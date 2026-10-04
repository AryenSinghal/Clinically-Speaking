import { z } from "zod";

// ---------- Shared building blocks ----------
export const SiteInfo = z.object({
  name: z.string(), city: z.string(), state: z.string(), lat: z.number(), lng: z.number(),
});
export type SiteInfo = z.infer<typeof SiteInfo>;

export const FieldValidation = z.object({
  min: z.number().nullable().optional(),
  max: z.number().nullable().optional(),
  regex: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});
export type FieldValidation = z.infer<typeof FieldValidation>;

// ---------- Setup pipeline: protocol -> details ----------
export const StudyDetails = z.object({
  title: z.string(),
  condition: z.string().describe("Primary condition/indication studied"),
  spoken_name: z.string().nullable().optional().describe("Short name a person would say out loud on the phone, 2-6 words, no jargon, e.g. \"the diabetes and blood pressure study\". Never the full official title."),
  phase: z.string().nullable(),
  sponsor: z.string().nullable(),
  summary: z.string().describe("2-3 sentence plain-language summary"),
  sample_size: z.number().nullable(),
  duration_days: z.number().nullable(),
  eligibility: z.object({
    age_min: z.number().nullable(),
    age_max: z.number().nullable(),
    sex: z.enum(["any", "female", "male"]),
    inclusion: z.array(z.string()),
    exclusion: z.array(z.string()),
    target_conditions: z.array(z.string()).describe("Lowercase condition keywords used for candidate matching"),
  }),
  endpoints: z.array(z.string()),
  assessments: z.array(z.string()).describe("Instruments/measurements named in the protocol"),
  regulatory_notes: z.array(z.string()).describe("Formatting/regulatory requirements to honor in the EDC"),
});
export type StudyDetails = z.infer<typeof StudyDetails>;

// ---------- EDC template ----------
export const EdcFieldDraft = z.object({
  section: z.string(),
  key: z.string().describe("snake_case, unique"),
  label: z.string(),
  type: z.enum(["text", "number", "integer", "boolean", "date", "select", "multiselect"]),
  unit: z.string().nullable(),
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
  validation: FieldValidation.nullable(),
});
export type EdcFieldDraft = z.infer<typeof EdcFieldDraft>;
export const EdcTemplateDraft = z.object({ fields: z.array(EdcFieldDraft) });

// ---------- Timeline ----------
export const VisitDraft = z.object({
  name: z.string(),
  type: z.enum(["clinic", "survey_call"]),
  day_offset: z.number().int(),
  window_days: z.number().int(),
  questionnaire_kind: z.enum(["recruitment", "follow_up"]).nullable().describe("Which questionnaire a survey_call uses"),
  notes: z.string().nullable(),
});
export type VisitDraft = z.infer<typeof VisitDraft>;
export const TimelineDraft = z.object({ visits: z.array(VisitDraft) });

// ---------- Questionnaires ----------
export const QuestionnaireItem = z.object({
  id: z.string(),
  prompt: z.string().describe("Question as the voice agent should ask it, conversational"),
  response_type: z.enum(["yes_no", "number", "scale", "text", "choice"]),
  choices: z.array(z.string()).nullable(),
  target_field_key: z.string().nullable().describe("form_field.key this answer should populate"),
  disqualifying_answer: z.string().nullable().describe("If set, this answer makes a recruitment candidate ineligible"),
});
export type QuestionnaireItem = z.infer<typeof QuestionnaireItem>;
export const QuestionnaireDraft = z.object({
  kind: z.enum(["recruitment", "follow_up"]),
  title: z.string(),
  items: z.array(QuestionnaireItem),
});
export type QuestionnaireDraft = z.infer<typeof QuestionnaireDraft>;
export const QuestionnairesDraft = z.object({ questionnaires: z.array(QuestionnaireDraft) });

// ---------- Call extraction ----------
export const ExtractionResult = z.object({
  fields: z.array(z.object({
    field_key: z.string(),
    value: z.string().nullable().describe("null if the participant never answered"),
    evidence_quote: z.string().nullable().describe("VERBATIM participant words supporting the value"),
    evidence_turn: z.number().nullable().describe("The [number] of the transcript line the evidence_quote comes from"),
    confidence: z.number().describe("0..1"),
  })),
  flag: z.enum(["invalid", "good", "escalate"]),
  flag_reason: z.string(),
  summary: z.string().describe("2 sentence call summary"),
});
export type ExtractionResult = z.infer<typeof ExtractionResult>;
