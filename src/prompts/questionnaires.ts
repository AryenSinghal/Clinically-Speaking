import type { StudyDetails } from "@/lib/schemas";

export type FieldRef = { key: string; label: string; type: string; unit: string | null; section: string; options: string[] | null };

function fieldList(fields: FieldRef[]): string {
  return fields
    .map((f) => `${f.key} | ${f.label} | ${f.type}${f.unit ? ` (${f.unit})` : ""}${f.options?.length ? ` [${f.options.join("/")}]` : ""} | ${f.section}`)
    .join("\n");
}

const ITEM_RULES = `Item rules:
- "id": short unique ids "q1","q2",...
- "prompt": phrased the way a friendly voice agent would ASK it aloud on the phone; one question per item, plain language, no jargon.
- "response_type": yes_no | number | scale (1-5 or 0-10 stated in the prompt) | text | choice (then "choices" is a list, else null).
- "target_field_key": MUST be exactly one key from the EDC FIELD LIST that this answer populates, or null if none fits. Never invent keys.
- "disqualifying_answer": for recruitment items only, the answer that makes the candidate ineligible (e.g. "yes" for a yes_no exclusion question, "no" for a required inclusion question), else null. Always null for follow_up items.`;

export function suggestQuestionnairesPrompt(details: StudyDetails, fields: FieldRef[]) {
  return {
    system: `You write phone-interview questionnaires for a clinical trial voice agent.
Produce EXACTLY two questionnaires:
1. kind "recruitment": title "Eligibility Screening Call". 6-10 items verifying inclusion/exclusion criteria (age, diagnosis, medications, pregnancy, recent events, availability). Each item that tests a criterion has a disqualifying_answer.
2. kind "follow_up": title "Follow-up Check-in Call". 6-10 items: symptoms, validated PRO instrument items named in the protocol, home measurements the participant can report, medication adherence, adverse events, concomitant medications.
${ITEM_RULES}`,
    prompt: `STUDY DETAILS (JSON):\n${JSON.stringify(details)}\n\nEDC FIELD LIST (key | label | type | section):\n${fieldList(fields)}`,
  };
}

export function parseUploadedQuestionnairePrompt(raw: string, fields: FieldRef[], kind: "recruitment" | "follow_up") {
  return {
    system: `You convert a researcher's own questionnaire (free text, JSON, CSV, or numbered list) into a structured voice-agent questionnaire. Keep the researcher's wording and order; only rephrase slightly if a question cannot be spoken aloud. Do not add or drop questions. kind must be "${kind}". Title: use the document's title if present, else a short descriptive one.
${ITEM_RULES}
${kind === "follow_up" ? "- disqualifying_answer must be null." : "- Only set disqualifying_answer when the source states or clearly implies an exclusion rule."}`,
    prompt: `EDC FIELD LIST (key | label | type | section):\n${fieldList(fields)}\n\nUPLOADED QUESTIONNAIRE:\n"""\n${raw.slice(0, 30000)}\n"""`,
  };
}
