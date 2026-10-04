import type { StudyDetails } from "@/lib/schemas";
import { MAX_PROTOCOL_CHARS } from "./parse-protocol";

export function edcTemplatePrompt(details: StudyDetails, protocolText: string) {
  return {
    system: `You design Electronic Data Capture (EDC) case report form templates in CDASH style.
Output a flat list of fields grouped by "section". Rules:
- Typical sections (use only those relevant, in this order): Demographics, Medical History, Eligibility, Vital Signs, Laboratory, Study-specific Efficacy (named after the endpoint), Patient-Reported Outcomes (one section per instrument, e.g. "PRO: PHQ-9"), Concomitant Medications, Adverse Events, Study Drug Adherence.
- 30-50 fields total. Every field needs a snake_case "key" that is unique across the whole form (e.g. systolic_bp, phq9_item1, ae_term).
- "type": text | number | integer | boolean | date | select | multiselect. Dates are ISO 8601 (YYYY-MM-DD). Use "select" with controlled vocabulary "options" for categorical data (sex, AE severity: Mild/Moderate/Severe; relationship to study drug: Not related/Unlikely/Possible/Probable/Definite; outcome; yes/no/unknown). "options" must be null for non-select types.
- "unit": the standard unit for measurements (mmHg, bpm, kg, cm, %, mg/dL, mmol/mol, points) else null.
- "validation": plausible physiological ranges for numbers {min,max,note}, regex for formats where useful; else null. Never null-out "required" (boolean).
- Include fields a phone-based survey call could capture (symptoms, PRO items, medication adherence, adverse events, self-reported home measurements) as well as clinic measurements.
- Honor the regulatory notes. Labels are concise and human-readable. Keep output compact.`,
    prompt: `STUDY DETAILS (JSON):\n${JSON.stringify(details)}\n\nPROTOCOL EXCERPT:\n"""\n${protocolText.slice(0, Math.floor(MAX_PROTOCOL_CHARS / 2))}\n"""`,
  };
}
