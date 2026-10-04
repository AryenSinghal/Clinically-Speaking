// Hand-written to mirror supabase/migrations/0001_init.sql.
// (Replace with `supabase gen types typescript` output once a project is linked.)
import type { QuestionnaireItem, StudyDetails, SiteInfo, FieldValidation } from "@/lib/schemas";

export type Json = string | number | boolean | null | { [k: string]: Json | undefined } | Json[];

export type Study = {
  id: string; title: string; protocol_text: string | null; protocol_pdf_url: string | null;
  details: StudyDetails | null; site: SiteInfo | null;
  status: "draft" | "setup_complete" | "recruiting" | "active"; created_at: string;
};
export type Questionnaire = {
  id: string; study_id: string; kind: "recruitment" | "follow_up"; title: string;
  items: QuestionnaireItem[]; origin: "suggested" | "uploaded"; created_at: string;
};
export type Visit = {
  id: string; study_id: string; name: string; type: "clinic" | "survey_call";
  day_offset: number; window_days: number; questionnaire_id: string | null; notes: string | null; position: number;
};
export type FormField = {
  id: string; study_id: string; section: string; key: string; label: string;
  type: "text" | "number" | "integer" | "boolean" | "date" | "select" | "multiselect";
  unit: string | null; required: boolean; options: string[] | null; validation: FieldValidation | null;
  source: "ai_draft" | "researcher_edited" | "uploaded"; position: number;
};
export type Candidate = {
  id: string; study_id: string | null; name: string; phone: string; age: number; sex: string;
  conditions: string[]; city: string | null; state: string | null; lat: number; lng: number;
  fit_score: number | null;
  status: "suggested" | "selected" | "screened" | "invalid" | "good" | "accepted" | "enrolled";
  enrolled_at: string | null; notes: string | null; created_at: string;
};
export type Call = {
  id: string; study_id: string | null; candidate_id: string | null;
  kind: "screening" | "confirmation" | "survey" | "reminder"; visit_id: string | null; vapi_call_id: string | null;
  status: "queued" | "ringing" | "in_progress" | "ended" | "failed" | "extracting" | "complete";
  recording_url: string | null; transcript: string | null; summary: string | null;
  flag: "invalid" | "good" | "escalate" | null; flag_reason: string | null;
  escalation_resolved: boolean; started_at: string | null; ended_at: string | null; created_at: string;
};
export type TranscriptEvent = {
  id: string; call_id: string; seq: number; role: "agent" | "participant"; text: string;
  start_ms: number | null; end_ms: number | null;
};
export type FieldValue = {
  id: string; call_id: string; field_id: string; value: string | null; evidence_quote: string | null;
  evidence_start_ms: number | null; evidence_end_ms: number | null; confidence: number | null;
  review_status: "pending" | "confirmed" | "corrected";
};

// Insert = required cols only for those without defaults; keep loose for hackathon speed.
type Tbl<R, Req extends keyof R> = {
  Row: R;
  Insert: Pick<R, Req> & Partial<Omit<R, Req>>;
  Update: Partial<R>;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      study: Tbl<Study, "title">;
      questionnaire: Tbl<Questionnaire, "study_id" | "kind" | "title">;
      visit: Tbl<Visit, "study_id" | "name" | "type" | "day_offset">;
      form_field: Tbl<FormField, "study_id" | "section" | "key" | "label" | "type">;
      candidate: Tbl<Candidate, "name" | "phone" | "age" | "sex" | "lat" | "lng">;
      call: Tbl<Call, "kind">;
      transcript_event: Tbl<TranscriptEvent, "call_id" | "seq" | "role" | "text">;
      field_value: Tbl<FieldValue, "call_id" | "field_id">;
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
