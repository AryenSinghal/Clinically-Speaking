import { db } from "@/lib/db/server";
import { generateJSON } from "@/lib/gemini";
import {
  EdcTemplateDraft, QuestionnairesDraft, TimelineDraft, QuestionnaireDraft, QuestionnaireItem,
  type QuestionnaireDraft as QDraft,
} from "@/lib/schemas";
import type { FormField, Study } from "@/lib/db/types";
import { parseProtocolPrompt, ProtocolParse } from "@/prompts/parse-protocol";
import { edcTemplatePrompt } from "@/prompts/edc-template";
import { timelinePrompt } from "@/prompts/timeline";
import { suggestQuestionnairesPrompt, parseUploadedQuestionnairePrompt, type FieldRef } from "@/prompts/questionnaires";
import { uniqueKey } from "./common";

export const DEFAULT_SITE = { name: "Primary Clinical Site", city: "Boston", state: "MA", lat: 42.3601, lng: -71.0589 };

export async function loadStudy(studyId: string): Promise<Study> {
  const { data, error } = await db().from("study").select("*").eq("id", studyId).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Study not found");
  return data as Study;
}

function requireDetails(study: Study) {
  if (!study.details) throw new Error("Study has no parsed details yet; run the 'details' step first");
  return study.details;
}

// ---------- details ----------
export async function runDetails(studyId: string): Promise<Study> {
  const study = await loadStudy(studyId);
  if (!study.protocol_text) throw new Error("Study has no protocol text");
  const { system, prompt } = parseProtocolPrompt(study.protocol_text);
  const parsed = await generateJSON({ system, prompt, schema: ProtocolParse });
  const { data, error } = await db().from("study")
    .update({ details: parsed.details, site: parsed.site, title: parsed.details.title || study.title })
    .eq("id", studyId).select("*").single();
  if (error) throw new Error(error.message);
  return data as Study;
}

// ---------- EDC ----------
export async function runEdc(studyId: string): Promise<FormField[]> {
  const study = await loadStudy(studyId);
  const details = requireDetails(study);
  const { system, prompt } = edcTemplatePrompt(details, study.protocol_text ?? "");
  const draft = await generateJSON({ system, prompt, schema: EdcTemplateDraft });

  const d = db();
  const del = await d.from("form_field").delete().eq("study_id", studyId).eq("source", "ai_draft");
  if (del.error) throw new Error(del.error.message);
  const kept = await d.from("form_field").select("key, position").eq("study_id", studyId);
  if (kept.error) throw new Error(kept.error.message);
  const used = new Set((kept.data ?? []).map((r) => r.key));
  const base = Math.max(-1, ...(kept.data ?? []).map((r) => r.position)) + 1;

  const rows = draft.fields.slice(0, 120).map((f, i) => {
    const isSelect = f.type === "select" || f.type === "multiselect";
    const options = isSelect && f.options?.length ? f.options : null;
    const type = isSelect && !options ? "text" : f.type;
    const v = f.validation;
    const hasVal = v && (v.min != null || v.max != null || v.regex || v.note);
    return {
      study_id: studyId,
      section: f.section.trim() || "General",
      key: uniqueKey(f.key || f.label, used),
      label: f.label.trim() || f.key,
      type,
      unit: f.unit?.trim() || null,
      required: f.required,
      options,
      validation: hasVal ? v : null,
      source: "ai_draft" as const,
      position: base + i,
    };
  });
  if (rows.length) {
    const ins = await d.from("form_field").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }
  return fetchFields(studyId);
}

export async function fetchFields(studyId: string): Promise<FormField[]> {
  const { data, error } = await db().from("form_field").select("*").eq("study_id", studyId).order("position");
  if (error) throw new Error(error.message);
  return (data ?? []) as FormField[];
}

// ---------- timeline ----------
export async function runTimeline(studyId: string) {
  const study = await loadStudy(studyId);
  const details = requireDetails(study);
  const fields = await fetchFields(studyId);
  const sections = [...new Set(fields.map((f) => f.section))];
  const { system, prompt } = timelinePrompt(details, study.protocol_text ?? "", sections);
  const draft = await generateJSON({ system, prompt, schema: TimelineDraft });

  const d = db();
  const qs = await d.from("questionnaire").select("id, kind, created_at").eq("study_id", studyId).order("created_at", { ascending: false });
  const qByKind = (k: "recruitment" | "follow_up") => (qs.data ?? []).find((q) => q.kind === k)?.id ?? null;

  const del = await d.from("visit").delete().eq("study_id", studyId);
  if (del.error) throw new Error(del.error.message);
  const sorted = [...draft.visits].sort((a, b) => a.day_offset - b.day_offset).slice(0, 60);
  const rows = sorted.map((v, i) => ({
    study_id: studyId,
    name: v.name.trim() || `Visit ${i + 1}`,
    type: v.type,
    day_offset: Math.round(v.day_offset),
    window_days: Math.max(0, Math.round(v.window_days)),
    questionnaire_id: v.type === "survey_call" ? qByKind(v.questionnaire_kind ?? "follow_up") : null,
    notes: v.notes?.trim() || null,
    position: i,
  }));
  if (rows.length) {
    const ins = await d.from("visit").insert(rows);
    if (ins.error) throw new Error(ins.error.message);
  }
  await relinkVisits(studyId);
  return fetchVisits(studyId);
}

export async function fetchVisits(studyId: string) {
  const { data, error } = await db().from("visit").select("*").eq("study_id", studyId).order("position");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Link survey_call visits that lack a questionnaire to the latest follow_up questionnaire. */
export async function relinkVisits(studyId: string) {
  const d = db();
  const q = await d.from("questionnaire").select("id").eq("study_id", studyId).eq("kind", "follow_up").order("created_at", { ascending: false }).limit(1);
  const id = q.data?.[0]?.id;
  if (!id) return;
  await d.from("visit").update({ questionnaire_id: id }).eq("study_id", studyId).eq("type", "survey_call").is("questionnaire_id", null);
}

/** Re-number visit.position by day_offset. */
export async function resequenceVisits(studyId: string) {
  const d = db();
  const { data } = await d.from("visit").select("id, day_offset, position").eq("study_id", studyId);
  const sorted = [...(data ?? [])].sort((a, b) => a.day_offset - b.day_offset || a.position - b.position);
  await Promise.all(sorted.map((v, i) => (v.position === i ? null : d.from("visit").update({ position: i }).eq("id", v.id))));
}

// ---------- questionnaires ----------
export function toFieldRefs(fields: FormField[]): FieldRef[] {
  return fields.map((f) => ({ key: f.key, label: f.label, type: f.type, unit: f.unit, section: f.section, options: f.options }));
}

/** Normalize a draft: unique ids, valid target keys, choices only for choice type, disqualifier only for recruitment. */
export function sanitizeDraft(draft: QDraft, validKeys: Set<string>): QDraft {
  const ids = new Set<string>();
  const items = draft.items.slice(0, 40).map((it, i) => {
    let id = (it.id || `q${i + 1}`).trim();
    while (ids.has(id)) id = `${id}_${i + 1}`;
    ids.add(id);
    const choices = it.response_type === "choice" && it.choices?.length ? it.choices : null;
    return {
      ...it,
      id,
      choices,
      response_type: it.response_type === "choice" && !choices ? ("text" as const) : it.response_type,
      target_field_key: it.target_field_key && validKeys.has(it.target_field_key) ? it.target_field_key : null,
      disqualifying_answer: draft.kind === "recruitment" ? it.disqualifying_answer?.trim() || null : null,
    };
  });
  return { ...draft, items };
}

export async function runQuestionnaires(studyId: string) {
  const study = await loadStudy(studyId);
  const details = requireDetails(study);
  const fields = await fetchFields(studyId);
  const keys = new Set(fields.map((f) => f.key));
  const { system, prompt } = suggestQuestionnairesPrompt(details, toFieldRefs(fields));
  const out = await generateJSON({ system, prompt, schema: QuestionnairesDraft });

  // one per kind
  const picked = (["recruitment", "follow_up"] as const)
    .map((k) => out.questionnaires.find((q) => q.kind === k))
    .filter((q): q is QDraft => !!q)
    .map((q) => sanitizeDraft(q, keys));
  if (!picked.length) throw new Error("Gemini returned no questionnaires");

  const d = db();
  const del = await d.from("questionnaire").delete().eq("study_id", studyId).eq("origin", "suggested");
  if (del.error) throw new Error(del.error.message);
  const ins = await d.from("questionnaire").insert(
    picked.map((q) => ({ study_id: studyId, kind: q.kind, title: q.title, items: q.items, origin: "suggested" as const })),
  );
  if (ins.error) throw new Error(ins.error.message);
  await relinkVisits(studyId);
  return fetchQuestionnaires(studyId);
}

export async function fetchQuestionnaires(studyId: string) {
  const { data, error } = await db().from("questionnaire").select("*").eq("study_id", studyId).order("created_at");
  if (error) throw new Error(error.message);
  return data ?? [];
}

/** Parse researcher-supplied questionnaire content (text/JSON/CSV) into a draft. */
export async function parseUploadedQuestionnaire(raw: string, studyId: string, kind: "recruitment" | "follow_up"): Promise<QDraft> {
  const fields = await fetchFields(studyId);
  const keys = new Set(fields.map((f) => f.key));

  // Fast path: already valid JSON in our shape.
  try {
    const json: unknown = JSON.parse(raw);
    const whole = QuestionnaireDraft.safeParse(json);
    if (whole.success) return sanitizeDraft(whole.data, keys);
    const items = (json && typeof json === "object" && !Array.isArray(json) && "items" in json ? (json as { items: unknown }).items : json);
    const arr = QuestionnaireItem.array().safeParse(items);
    if (arr.success) return sanitizeDraft({ kind, title: "Uploaded questionnaire", items: arr.data }, keys);
  } catch { /* not JSON: fall through to Gemini */ }

  const { system, prompt } = parseUploadedQuestionnairePrompt(raw, toFieldRefs(fields), kind);
  const draft = await generateJSON({ system, prompt, schema: QuestionnaireDraft });
  return sanitizeDraft({ ...draft, kind }, keys);
}

/** Replace references to a field key in all questionnaires of a study (newKey null = clear). */
export async function rewriteFieldRefs(studyId: string, oldKey: string, newKey: string | null) {
  const d = db();
  const { data } = await d.from("questionnaire").select("id, items").eq("study_id", studyId);
  for (const q of data ?? []) {
    if (!q.items.some((it) => it.target_field_key === oldKey)) continue;
    const items = q.items.map((it) => (it.target_field_key === oldKey ? { ...it, target_field_key: newKey } : it));
    await d.from("questionnaire").update({ items }).eq("id", q.id);
  }
}
