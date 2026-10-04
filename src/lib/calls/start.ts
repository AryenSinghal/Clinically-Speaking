import { db } from "@/lib/db/server";
import type { Candidate, Questionnaire, Study, Visit } from "@/lib/db/types";
import { buildCallScript, type CallKind } from "@/prompts/call-script";
import { startVapiCall } from "@/lib/vapi";
import { addDays } from "@/lib/survey";
import { reconcileStaleCalls } from "./reconcile";

export class CallStartError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

function nextWeekday(d: Date): Date {
  const x = new Date(d);
  while (x.getDay() === 0 || x.getDay() === 6) x.setDate(x.getDate() + 1);
  return x;
}

function proposeSlots(firstClinic: Visit | null): string[] {
  const base = new Date();
  base.setDate(base.getDate() + Math.max(1, firstClinic?.day_offset ?? 3));
  const day = nextWeekday(base);
  const label = day.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  return [`${label} at 9:00 AM`, `${label} at 11:30 AM`, `${label} at 2:00 PM`];
}

export async function startCall(input: { candidateId: string; kind: CallKind; visitId?: string }): Promise<{ callId: string }> {
  const sb = db();
  const { data: candidate } = await sb.from("candidate").select("*").eq("id", input.candidateId).maybeSingle();
  const cand = candidate as Candidate | null;
  if (!cand) throw new CallStartError("Candidate not found", 404);
  if (!cand.study_id) throw new CallStartError("Candidate is not assigned to a study", 400);

  const { data: studyRow } = await sb.from("study").select("*").eq("id", cand.study_id).maybeSingle();
  const study = studyRow as Study | null;
  if (!study) throw new CallStartError("Study not found", 404);

  let visit: Visit | null = null;
  if (input.visitId) {
    const { data } = await sb.from("visit").select("*").eq("id", input.visitId).maybeSingle();
    visit = (data as Visit | null) ?? null;
    if (!visit) throw new CallStartError("Visit not found", 404);
  }

  let questionnaire: Questionnaire | null = null;
  let slots: string[] | undefined;
  let visitDate: string | null = null;
  if (input.kind === "screening") {
    const { data } = await sb.from("questionnaire").select("*").eq("study_id", study.id).eq("kind", "recruitment").order("created_at", { ascending: false }).limit(1).maybeSingle();
    questionnaire = (data as Questionnaire | null) ?? null;
  } else if (input.kind === "survey") {
    if (visit?.questionnaire_id) {
      const { data } = await sb.from("questionnaire").select("*").eq("id", visit.questionnaire_id).maybeSingle();
      questionnaire = (data as Questionnaire | null) ?? null;
    }
    if (!questionnaire) {
      const { data } = await sb.from("questionnaire").select("*").eq("study_id", study.id).eq("kind", "follow_up").order("created_at", { ascending: false }).limit(1).maybeSingle();
      questionnaire = (data as Questionnaire | null) ?? null;
    }
  } else if (input.kind === "reminder") {
    if (!visit) throw new CallStartError("A reminder call needs the clinic visit it is about (visitId)", 400);
    if (visit.type !== "clinic") throw new CallStartError("Reminder calls are only for clinic visits", 400);
    if (cand.enrolled_at) {
      // Visit date on the participant's own timeline (enrollment day + visit offset), formatted in UTC so it never shifts a day.
      visitDate = new Date(`${addDays(cand.enrolled_at, visit.day_offset)}T00:00:00Z`)
        .toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
    }
  } else {
    const { data } = await sb.from("visit").select("*").eq("study_id", study.id).eq("type", "clinic").order("day_offset", { ascending: true }).order("position", { ascending: true }).limit(1).maybeSingle();
    slots = proposeSlots((data as Visit | null) ?? null);
  }

  // Demo safety: every call rings the same phone, so allow only one in flight at a time.
  if (process.env.DEMO_PHONE_OVERRIDE) {
    await reconcileStaleCalls().catch(() => undefined); // clear calls that were never answered before judging "busy"
    const since = new Date(Date.now() - 15 * 60_000).toISOString();
    const { count } = await sb.from("call").select("id", { count: "exact", head: true })
      .in("status", ["queued", "ringing", "in_progress"]).gte("created_at", since);
    if (count) throw new CallStartError("Another call is already in progress on the demo phone. Wait for it to finish.", 409);
  }

  const { data: created, error: insErr } = await sb
    .from("call")
    .insert({ study_id: study.id, candidate_id: cand.id, kind: input.kind, visit_id: visit?.id ?? null, status: "queued" })
    .select("id")
    .single();
  if (insErr || !created) throw new CallStartError(`Could not create call: ${insErr?.message ?? "unknown"}`, 500);
  const callId = (created as { id: string }).id;

  try {
    const { systemPrompt, firstMessage } = buildCallScript({ kind: input.kind, study, candidate: cand, questionnaire, slots, visitName: visit?.name, visitDate, visitNotes: visit?.notes });
    const { vapiCallId } = await startVapiCall({
      phone: cand.phone,
      systemPrompt,
      firstMessage,
      metadata: { callId, studyId: study.id, kind: input.kind },
    });
    await sb.from("call").update({ vapi_call_id: vapiCallId }).eq("id", callId);
    return { callId };
  } catch (e) {
    await sb.from("call").update({ status: "failed", flag_reason: "Call could not be started" }).eq("id", callId);
    throw new CallStartError(e instanceof Error ? e.message : "Failed to start call", 502);
  }
}
