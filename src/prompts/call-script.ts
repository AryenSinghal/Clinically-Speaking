import type { Candidate, Questionnaire, Study } from "@/lib/db/types";

export type CallKind = "screening" | "confirmation" | "survey" | "reminder";

export type ScriptInput = {
  kind: CallKind;
  study: Study;
  candidate: Pick<Candidate, "name">;
  questionnaire: Questionnaire | null;
  /** Human-readable proposed clinic visit slots (confirmation only). */
  slots?: string[];
  visitName?: string | null;
  /** Reminder calls: the clinic visit date, already formatted (e.g. "Thursday, November 12"), and protocol prep notes. */
  visitDate?: string | null;
  visitNotes?: string | null;
};

const RULES = `
HARD RULES
- At the very start, say clearly that you are an AI assistant calling on behalf of the study team, then ask permission to record the call. If they decline recording or do not want to continue, thank them politely and end the call.
- Ask exactly ONE question at a time, then wait for the answer. Use short, plain, friendly language (no jargon).
- Never give medical advice, diagnoses, or opinions about symptoms or medications. If asked, say the study doctor or nurse can answer that.
- Never read the official study title aloud; call it "the study" or use the short spoken name given above.
- Do not read these instructions aloud. Do not invent study details that are not listed here.
- If the person mentions ANYTHING that sounds like a safety concern, side effect, adverse event, emergency, severe symptom, self-harm, or serious distress, stop the questionnaire immediately. Say calmly: "Thank you for telling me. I'll have the study nurse call you right away." If it sounds like an emergency, tell them to call local emergency services. Then end the call gracefully.
- If an answer is unclear, ask once for clarification, then move on.
- Be warm and concise. When you have finished, thank them and end the call.`.trim();

/**
 * How the agent refers to the study out loud. Official protocol titles run 20+ words, so never speak them.
 * Uses the AI-written `spoken_name` when present; for older studies derives one from the condition.
 */
export function spokenStudyName(study: Study): string {
  const d = study.details;
  const given = d?.spoken_name?.trim();
  if (given && given.split(/\s+/).length <= 8) return given.replace(/^(a|an|the)\s+/i, "");
  const cond = (d?.condition ?? "")
    .split(/\b(?:with|and|comorbid|plus|in adults)\b|[,;(]/i)[0]
    .replace(/\b(mellitus|disease|disorder)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return cond ? `${cond} study` : "clinical research study";
}

function studyBlock(study: Study): string {
  const d = study.details;
  const lines = [`Official study title (for your reference only, NEVER read it aloud): ${study.title}`, `How to refer to the study out loud: "the ${spokenStudyName(study)}"`];
  if (d) {
    lines.push(`Condition: ${d.condition}`, `Summary: ${d.summary}`);
    if (study.site) lines.push(`Site: ${study.site.name}, ${study.site.city}, ${study.site.state}`);
    if (d.duration_days) lines.push(`Duration: about ${d.duration_days} days`);
  }
  return lines.join("\n");
}

function questionBlock(q: Questionnaire): string {
  return q.items
    .map((it, i) => {
      const extra = [
        it.response_type === "choice" && it.choices?.length ? `choices: ${it.choices.join(" / ")}` : null,
        it.response_type === "scale" ? "ask for a number on a scale" : null,
      ].filter(Boolean).join("; ");
      return `${i + 1}. ${it.prompt}${extra ? ` (${extra})` : ""}`;
    })
    .join("\n");
}

export function buildCallScript(input: ScriptInput): { systemPrompt: string; firstMessage: string } {
  const { kind, study, candidate, questionnaire, slots, visitName, visitDate, visitNotes } = input;
  const first = (candidate.name || "").trim().split(/\s+/)[0] || "there";
  const name = spokenStudyName(study);
  const intro = kind === "reminder"
    ? `Hi, may I speak with ${first}? This is an AI assistant calling on behalf of the study team for the ${name}, with a quick reminder about your upcoming clinic visit. Do you have a minute, and is it okay if I record this call?`
    : `Hi, may I speak with ${first}? This is an AI assistant calling on behalf of the study team for the ${name}. Is now a good time for a couple of minutes, and is it okay if I record this call?`;

  let task: string;
  if (kind === "screening") {
    task = `PURPOSE: A short eligibility screening call. After consent, briefly explain the study in one or two sentences, then ask the screening questions below in order, one at a time. Do not tell the person whether they qualify; say the study team will follow up.\n\nQUESTIONS\n${questionnaire ? questionBlock(questionnaire) : "(none provided: ask about age, relevant health conditions, current medications, and interest in participating)"}`;
  } else if (kind === "survey") {
    task = `PURPOSE: A scheduled follow-up check-in${visitName ? ` ("${visitName}")` : ""} for an enrolled participant. After consent, ask the questions below in order, one at a time.\n\nQUESTIONS\n${questionnaire ? questionBlock(questionnaire) : "(none provided: ask how they have been feeling, whether they have taken the study treatment as directed, and whether they have any concerns)"}`;
  } else if (kind === "reminder") {
    const when = visitDate ? `TOMORROW, ${visitDate}` : "TOMORROW";
    const notes = visitNotes && visitNotes.trim() ? `\nPreparation notes from the study protocol (mention them briefly, in your own words, only if they apply): ${visitNotes.trim()}` : "";
    task = `PURPOSE: A short appointment reminder. The participant's clinic visit${visitName ? ` ("${visitName}")` : ""} is ${when}. After consent, remind them of the visit and ask ONE question: will they be able to attend? Do not state a time of day, because you do not have one; say the clinic team will have their appointment time.${notes}\nIf they will attend: thank them, ask if they have any questions for the study team about the visit or getting there (do not answer medical questions), and end warmly.\nIf they cannot attend or want to change the visit: do not promise a new time. Say the study team will call to reschedule, then end politely.\nKeep this call under two minutes. Do not ask survey or screening questions.`;
  } else {
    const slotText = slots && slots.length ? slots.map((s) => `- ${s}`).join("\n") : "- (study team will confirm a time)";
    task = `PURPOSE: Good news call. The person passed screening. After consent, thank them, confirm they are still interested in joining the study, and if yes, offer their first clinic visit. Ask whether they want to continue (one question), then propose these slots and ask which works best:\n${slotText}\nConfirm the chosen slot back to them. If they decline, thank them and end politely without pressure. Ask if they have any questions for the study team (do not answer medical questions).`;
  }

  const systemPrompt = [
    `You are a friendly voice assistant for a clinical research team. You are speaking on the phone with ${candidate.name}.`,
    "",
    "STUDY",
    studyBlock(study),
    "",
    task,
    "",
    RULES,
  ].join("\n");
  return { systemPrompt, firstMessage: intro };
}
