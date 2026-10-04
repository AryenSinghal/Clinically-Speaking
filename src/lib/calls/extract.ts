import { db } from "@/lib/db/server";
import { generateJSON } from "@/lib/gemini";
import { ExtractionResult } from "@/lib/schemas";
import type { Call, FormField, Questionnaire, TranscriptEvent, FieldValue } from "@/lib/db/types";
import { EXTRACTION_SYSTEM, buildExtractionPrompt } from "@/prompts/extract-from-transcript";
import { locateQuote } from "./evidence";

export type ExtractOutcome = { ok: true; flag: Call["flag"]; fields: number } | { ok: false; error: string; skipped?: boolean };

/**
 * Run extraction for a call. Atomically claims the call (status -> 'extracting') so concurrent
 * triggers (webhook retries, manual retry) do not double-run. `force` re-runs even if complete.
 */
export async function runExtraction(callId: string, opts: { force?: boolean } = {}): Promise<ExtractOutcome> {
  const sb = db();

  const claimQ = sb.from("call").update({ status: "extracting" }).eq("id", callId);
  const { data: claimed } = await (opts.force
    ? claimQ.neq("status", "extracting")
    : claimQ.in("status", ["ended"])
  ).select("*");
  const call = ((claimed ?? []) as Call[])[0];
  if (!call) return { ok: false, error: "Call not claimable (already extracting/complete or missing)", skipped: true };

  try {
    const [{ data: evs }, { data: ffs }] = await Promise.all([
      sb.from("transcript_event").select("*").eq("call_id", callId).order("seq", { ascending: true }),
      call.study_id && call.kind !== "reminder" ? sb.from("form_field").select("*").eq("study_id", call.study_id).order("position", { ascending: true }) : Promise.resolve({ data: [] as FormField[] }),
    ]);
    const events = (evs ?? []) as TranscriptEvent[];
    const fields = (ffs ?? []) as FormField[];

    // Nobody spoke (voicemail, hang-up, never answered): that is "no answer", not an eligibility result.
    // Fail the call without touching the candidate so it can simply be retried.
    if (events.length && !events.some((e) => e.role === "participant")) {
      await sb.from("call").update({
        status: "failed",
        flag: null,
        flag_reason: "No answer: the participant never spoke",
        summary: "The call connected but the participant did not respond. Try again later.",
      }).eq("id", callId);
      return { ok: true, flag: null, fields: 0 };
    }

    if (!events.length) {
      await sb.from("call").update({ status: "complete", summary: "No conversation was captured for this call." }).eq("id", callId);
      return { ok: true, flag: call.flag, fields: 0 };
    }

    let questionnaire: Questionnaire | null = null;
    if (call.kind === "screening" && call.study_id) {
      const { data } = await sb.from("questionnaire").select("*").eq("study_id", call.study_id).eq("kind", "recruitment").order("created_at", { ascending: false }).limit(1).maybeSingle();
      questionnaire = (data as Questionnaire | null) ?? null;
    } else if (call.kind === "survey") {
      if (call.visit_id) {
        const { data: v } = await sb.from("visit").select("questionnaire_id").eq("id", call.visit_id).maybeSingle();
        const qid = (v as { questionnaire_id: string | null } | null)?.questionnaire_id;
        if (qid) {
          const { data } = await sb.from("questionnaire").select("*").eq("id", qid).maybeSingle();
          questionnaire = (data as Questionnaire | null) ?? null;
        }
      }
      if (!questionnaire && call.study_id) {
        const { data } = await sb.from("questionnaire").select("*").eq("study_id", call.study_id).eq("kind", "follow_up").order("created_at", { ascending: false }).limit(1).maybeSingle();
        questionnaire = (data as Questionnaire | null) ?? null;
      }
    }

    const transcriptText = events.map((e) => `[${e.seq}] ${e.role === "agent" ? "AGENT" : "PARTICIPANT"}: ${e.text}`).join("\n");
    const result = await generateJSON({
      system: EXTRACTION_SYSTEM,
      prompt: buildExtractionPrompt({ kind: call.kind, fields, questionnaire, transcript: transcriptText }),
      schema: ExtractionResult,
    });

    const byKey = new Map(fields.map((f) => [f.key, f]));
    const totalMsHint = call.started_at && call.ended_at ? Date.parse(call.ended_at) - Date.parse(call.started_at) : null;

    // keep human-reviewed values
    const { data: existing } = await sb.from("field_value").select("*").eq("call_id", callId);
    const reviewed = new Set(((existing ?? []) as FieldValue[]).filter((r) => r.review_status !== "pending").map((r) => r.field_id));

    const seen = new Set<string>();
    const rows: Array<{
      call_id: string; field_id: string; value: string | null; evidence_quote: string | null;
      evidence_start_ms: number | null; evidence_end_ms: number | null; confidence: number | null; review_status: "pending";
    }> = [];
    for (const f of result.fields) {
      const field = byKey.get(f.field_key);
      if (!field || seen.has(field.id) || reviewed.has(field.id)) continue;
      seen.add(field.id);
      const quote = f.value === null ? null : f.evidence_quote;
      const loc = locateQuote(quote, events, totalMsHint, f.evidence_turn);
      rows.push({
        call_id: callId,
        field_id: field.id,
        value: f.value,
        evidence_quote: quote,
        evidence_start_ms: loc.startMs,
        evidence_end_ms: loc.endMs,
        confidence: Number.isFinite(f.confidence) ? Math.min(1, Math.max(0, f.confidence)) : null,
        review_status: "pending",
      });
    }
    if (rows.length) {
      const { error } = await sb.from("field_value").upsert(rows, { onConflict: "call_id,field_id" });
      if (error) throw new Error(`field_value upsert failed: ${error.message}`);
    }

    await sb.from("call").update({
      flag: result.flag, flag_reason: result.flag_reason, summary: result.summary,
      transcript: call.transcript ?? events.map((e) => `${e.role === "agent" ? "AGENT" : "PARTICIPANT"}: ${e.text}`).join("\n"), escalation_resolved: result.flag === "escalate" ? false : call.escalation_resolved,
      status: "complete",
    }).eq("id", callId);

    if (call.candidate_id) {
      let next: "invalid" | "good" | "screened" | "enrolled" | null = null;
      if (call.kind === "screening") next = result.flag === "invalid" ? "invalid" : result.flag === "good" ? "good" : "screened";
      else if (call.kind === "confirmation" && result.flag === "good") next = "enrolled";
      if (next) {
        // Pipeline statuses only move forward: re-running extraction on an older call must never undo
        // a later accept/enrollment.
        const RANK: Record<string, number> = { suggested: 0, selected: 1, screened: 2, invalid: 2, good: 3, accepted: 4, enrolled: 5 };
        const { data: cur } = await sb.from("candidate").select("status").eq("id", call.candidate_id).maybeSingle();
        const curStatus = (cur as { status: string } | null)?.status ?? "suggested";
        if ((RANK[next] ?? 0) > (RANK[curStatus] ?? 0)) {
          const patch: { status: typeof next; enrolled_at?: string } = { status: next };
          if (next === "enrolled") patch.enrolled_at = new Date().toISOString().slice(0, 10);
          await sb.from("candidate").update(patch).eq("id", call.candidate_id);
        }
      }
    }
    return { ok: true, flag: result.flag, fields: rows.length };
  } catch (e) {
    await sb.from("call").update({ status: "ended" }).eq("id", callId).eq("status", "extracting");
    return { ok: false, error: e instanceof Error ? e.message : "Extraction failed" };
  }
}
