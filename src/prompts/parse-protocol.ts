import { z } from "zod";
import { SiteInfo, StudyDetails } from "@/lib/schemas";

export const ProtocolParse = z.object({
  details: StudyDetails,
  site: SiteInfo.describe("Trial site. Infer from the protocol if a site/city is named; otherwise Boston, MA (42.3601, -71.0589)"),
});
export type ProtocolParse = z.infer<typeof ProtocolParse>;

export const MAX_PROTOCOL_CHARS = 45000;

export function parseProtocolPrompt(protocolText: string) {
  return {
    system: `You are a senior clinical research associate who converts clinical trial protocols into structured study metadata.
Rules:
- Use ONLY information in the protocol. Use null for unknown nullable values; never invent numbers.
- "spoken_name": a SHORT plain-language name for the study that a caller would say aloud, 2-6 words, no acronyms or phase numbers, like "the diabetes and blood pressure study". Never the full official title.
- "summary": 2-3 plain-language sentences a patient could understand.
- "eligibility.inclusion"/"exclusion": short atomic criteria (one condition each), max 12 each.
- "eligibility.target_conditions": lowercase condition keywords (e.g. "type 2 diabetes", "hypertension") useful for matching candidates.
- "assessments": named instruments/measurements (e.g. "HbA1c", "PHQ-9", "seated blood pressure").
- "regulatory_notes": formatting/regulatory requirements the EDC must honor (ALCOA+ data integrity, ISO 8601 dates, SI/conventional units, MedDRA for adverse events, CTCAE grading, CDASH naming, etc.), including any stated in the protocol.
- "duration_days": total participant duration in days (convert weeks/months).
- "site": the trial site. If the protocol names a site, institution or city, use it with plausible state and lat/lng. Otherwise default to name "Primary Clinical Site", city "Boston", state "MA", lat 42.3601, lng -71.0589.
Be concise.`,
    prompt: `PROTOCOL TEXT:\n"""\n${protocolText.slice(0, MAX_PROTOCOL_CHARS)}\n"""`,
  };
}
