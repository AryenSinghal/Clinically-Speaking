import type { FormField, Questionnaire } from "@/lib/db/types";

export const EXTRACTION_SYSTEM = `You are a clinical data abstraction assistant. You read a phone-call transcript between an AI study assistant (agent) and a research participant, and fill Electronic Data Capture (EDC) fields.

Rules:
- Use ONLY information the participant actually said. Never guess. If a field was not answered, set value to null and evidence_quote to null.
- Every transcript line is prefixed with its number like [7]. evidence_turn MUST be the number of the line the evidence_quote comes from (the participant's ANSWER to that field's question, not an earlier unrelated reply such as consent). Short answers like "Yes." appear many times: the turn number is what disambiguates them.
- evidence_quote MUST be copied VERBATIM from the participant's words in the transcript (a short contiguous span, ideally one sentence or less). Do not paraphrase, fix grammar, or merge separate turns.
- Values: booleans as "true"/"false"; numbers/integers as plain digits without units; dates as YYYY-MM-DD when determinable; select values must exactly match one of the field's options; multiselect values as a comma-separated list of options; text as short plain text.
- confidence is 0..1: how sure you are the value is correct and accurately captured.
- Return one entry per listed field_key (only keys from the list).
- flag semantics (escalate takes precedence over the others):
  * "escalate": ANY unexpected answer, safety concern, adverse event, side effect, hospital/ER visit, self-harm or distress, medication confusion, request to withdraw, or anything the study team should look at urgently or that does not fit the expected answers.
  * "invalid": for screening, the participant fails an eligibility criterion (e.g. gives a disqualifying answer) or declines to participate; for other calls, the participant refused/ended without completing.
  * "good": eligible/completed as expected and willing, with nothing concerning.
- flag_reason: one short sentence citing the deciding answer. summary: 2 sentences.`;

export function buildExtractionPrompt(args: {
  kind: "screening" | "confirmation" | "survey" | "reminder";
  fields: FormField[];
  questionnaire: Questionnaire | null;
  transcript: string;
}): string {
  const fields = args.fields
    .map((f) => `- ${f.key} | ${f.label} | type=${f.type}${f.unit ? ` | unit=${f.unit}` : ""}${f.options?.length ? ` | options=${f.options.join(", ")}` : ""} | section=${f.section}`)
    .join("\n");
  const q = args.questionnaire
    ? args.questionnaire.items
        .map((it) => `- "${it.prompt}" -> field=${it.target_field_key ?? "none"}${it.disqualifying_answer ? `; DISQUALIFYING answer: ${it.disqualifying_answer}` : ""}`)
        .join("\n")
    : "(none)";
  const kindNote =
    args.kind === "reminder"
      ? "This was a VISIT REMINDER call (the day before a clinic visit). There are no EDC fields to fill (return an empty fields list). flag: good = the participant confirmed they will attend; invalid = they cannot attend or want to reschedule/cancel (the study team must follow up); escalate = any safety concern, new symptom, adverse event, or distress (takes precedence). flag_reason: one short sentence naming the deciding answer. summary: say whether they will attend and any question or request they raised."
      : args.kind === "confirmation"
      ? "This was a CONFIRMATION call: flag good = participant confirmed they want to join (note chosen visit slot in the summary); invalid = declined."
      : args.kind === "survey"
        ? "This was a follow-up SURVEY call."
        : "This was a SCREENING call.";
  return `${kindNote}

EDC FIELDS (key | label | type ...):
${fields || "(none)"}

QUESTIONNAIRE USED:
${q}

TRANSCRIPT:
${args.transcript}`;
}
