import type { StudyDetails } from "@/lib/schemas";
import { MAX_PROTOCOL_CHARS } from "./parse-protocol";

export function timelinePrompt(details: StudyDetails, protocolText: string, sections: string[]) {
  return {
    system: `You build participant study timelines (schedule of assessments) from clinical protocols.
Rules:
- day_offset is days from enrollment (Day 0 = baseline/enrollment visit). A screening visit may be negative.
- type "clinic" = in-person site visit; "survey_call" = automated phone check-in with the participant (voice agent asking questionnaire items and symptoms).
- Follow the protocol's schedule of assessments exactly when stated. Otherwise design a sensible one covering the whole study duration: screening/baseline clinic visit, periodic survey calls between clinic visits (e.g. weekly or biweekly early, then spaced), mid-study and end-of-study clinic visits.
- "window_days": allowed +/- window around the target day (clinic 3-7, survey calls 1-3, baseline 0).
- survey_call visits must set questionnaire_kind "follow_up"; clinic visits use null. Only use "recruitment" if the protocol has a pre-enrollment phone screen (day <= 0).
- "notes": one short line on what is collected (reference EDC sections when helpful).
- 8-16 visits total, concise names ("Day 14 Check-in Call").`,
    prompt: `STUDY DETAILS (JSON):\n${JSON.stringify(details)}\n\nEDC SECTIONS AVAILABLE: ${sections.join("; ")}\n\nPROTOCOL EXCERPT:\n"""\n${protocolText.slice(0, Math.floor(MAX_PROTOCOL_CHARS / 2))}\n"""`,
  };
}
