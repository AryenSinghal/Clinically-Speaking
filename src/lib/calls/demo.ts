import { db } from "@/lib/db/server";
import type { Candidate, FormField, Questionnaire } from "@/lib/db/types";
import { locateQuote, type TimedEvent } from "./evidence";

export type DemoVariant = "good" | "escalate" | "invalid";

type Line = { role: "agent" | "participant"; text: string };

function script(first: string, variant: DemoVariant): Line[] {
  const head: Line[] = [
    { role: "agent", text: `Hi, may I speak with ${first}? This is an AI assistant calling on behalf of the study team. Is it okay if I record this call?` },
    { role: "participant", text: "Yes, that's fine, go ahead." },
    { role: "agent", text: "Thank you. First, how old are you?" },
    { role: "participant", text: "I'm 54 years old." },
    { role: "agent", text: "Do you currently take any medication for your condition?" },
    { role: "participant", text: "Yes, I take one tablet every morning, and it has been working okay." },
    { role: "agent", text: "Have you been hospitalized or visited an emergency room in the past three months?" },
  ];
  if (variant === "escalate") {
    return [...head,
      { role: "participant", text: "Actually yes, last week I got really dizzy and my chest felt tight, so my wife took me to the emergency room." },
      { role: "agent", text: "Thank you for telling me. I'll have the study nurse call you right away. If you feel unwell again, please call emergency services. Take care." },
    ];
  }
  if (variant === "invalid") {
    return [...head,
      { role: "participant", text: "Yes, I was in the hospital for two weeks in August for a heart procedure." },
      { role: "agent", text: "Thanks for sharing that. Are you currently pregnant or planning to become pregnant?" },
      { role: "participant", text: "No, not at all." },
      { role: "agent", text: "Thank you for your time. The study team will follow up with you." },
    ];
  }
  return [...head,
    { role: "participant", text: "No, nothing like that. I've been feeling pretty good." },
    { role: "agent", text: "Wonderful. Are you interested in taking part in the study?" },
    { role: "participant", text: "Yes, I'd love to take part. Please sign me up." },
    { role: "agent", text: "Great, the study team will be in touch shortly. Thank you!" },
  ];
}

function valueFor(f: FormField, c: Candidate, line: string): string {
  if (/age/i.test(f.key)) return String(c.age);
  switch (f.type) {
    case "boolean": return /\b(no|not)\b/i.test(line) && !/yes/i.test(line) ? "false" : "true";
    case "integer": case "number": return "1";
    case "date": return new Date().toISOString().slice(0, 10);
    case "select": return f.options?.[0] ?? "yes";
    case "multiselect": return f.options?.[0] ?? "";
    default: return line.length > 60 ? line.slice(0, 57) + "..." : line;
  }
}

export async function seedDemoCall(candidateId: string, variant: DemoVariant, kind: "screening" | "confirmation" | "survey" = "screening"): Promise<{ callId: string } | { error: string; status: number }> {
  const sb = db();
  const { data: cd } = await sb.from("candidate").select("*").eq("id", candidateId).maybeSingle();
  const cand = cd as Candidate | null;
  if (!cand) return { error: "Candidate not found", status: 404 };
  if (!cand.study_id) return { error: "Candidate has no study", status: 400 };

  const first = cand.name.split(/\s+/)[0] || "there";
  const lines = script(first, variant);
  // synthetic timings: ~65ms per char + 700ms gap
  let t = 500;
  const events = lines.map((l, i) => {
    const start = t;
    const end = start + Math.max(1500, l.text.length * 65);
    t = end + 700;
    return { seq: i + 1, role: l.role, text: l.text, start_ms: start, end_ms: end };
  });
  const totalMs = t;

  const flagReason = variant === "escalate"
    ? "Participant reported dizziness, chest tightness and an ER visit last week."
    : variant === "invalid"
      ? "Participant was hospitalized for a cardiac procedure within the exclusion window."
      : "Eligible and willing to participate; no concerns raised.";
  const summary = variant === "escalate"
    ? "Participant consented and answered basic screening questions, then disclosed a recent ER visit for dizziness and chest tightness. The agent escalated to the study nurse."
    : variant === "invalid"
      ? "Participant consented and reported a recent hospitalization that fails an eligibility criterion. Screening ended politely."
      : "Participant consented, confirmed age and medication use, reported no hospitalizations and wants to join the study.";

  const now = Date.now();
  const { data: created, error } = await sb.from("call").insert({
    study_id: cand.study_id, candidate_id: cand.id, kind, status: "complete", recording_url: null,
    transcript: lines.map((l) => `${l.role === "agent" ? "AGENT" : "PARTICIPANT"}: ${l.text}`).join("\n"),
    summary, flag: variant === "good" ? "good" : variant, flag_reason: flagReason, escalation_resolved: false,
    started_at: new Date(now - totalMs).toISOString(), ended_at: new Date(now).toISOString(),
  }).select("id").single();
  if (error || !created) return { error: error?.message ?? "Insert failed", status: 500 };
  const callId = (created as { id: string }).id;

  await sb.from("transcript_event").insert(events.map((e) => ({ ...e, call_id: callId })));

  const { data: ffs } = await sb.from("form_field").select("*").eq("study_id", cand.study_id).order("position", { ascending: true });
  const fields = (ffs ?? []) as FormField[];
  const { data: qd } = await sb.from("questionnaire").select("*").eq("study_id", cand.study_id).eq("kind", "recruitment").limit(1).maybeSingle();
  const targeted = new Set(((qd as Questionnaire | null)?.items ?? []).map((i) => i.target_field_key).filter(Boolean));
  const ordered = [...fields.filter((f) => targeted.has(f.key)), ...fields.filter((f) => !targeted.has(f.key))].slice(0, 6);
  const participant = events.filter((e) => e.role === "participant");
  const timed: TimedEvent[] = events;
  const rows = ordered.map((f, i) => {
    const quoteLine = participant[Math.min(i + 1, participant.length - 1)];
    const loc = locateQuote(quoteLine.text, timed, totalMs);
    return {
      call_id: callId, field_id: f.id, value: valueFor(f, cand, quoteLine.text), evidence_quote: quoteLine.text,
      evidence_start_ms: loc.startMs, evidence_end_ms: loc.endMs, confidence: Math.round((0.7 + ((i * 7) % 3) * 0.1) * 100) / 100,
      review_status: "pending" as const,
    };
  });
  if (rows.length) await sb.from("field_value").insert(rows);

  if (kind === "screening") {
    await sb.from("candidate").update({ status: variant === "invalid" ? "invalid" : variant === "good" ? "good" : "screened" }).eq("id", cand.id);
  }
  return { callId };
}
