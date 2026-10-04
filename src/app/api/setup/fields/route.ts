import { z } from "zod";
import { db } from "@/lib/db/server";
import { FieldValidation } from "@/lib/schemas";
import type { FormField } from "@/lib/db/types";
import { bodyJson, fail, guard, ok, snakeKey, Uuid } from "../_lib/common";
import { rewriteFieldRefs } from "../_lib/generate";

export const runtime = "nodejs";

const Type = z.enum(["text", "number", "integer", "boolean", "date", "select", "multiselect"]);
const Patch = z.object({
  section: z.string().min(1),
  key: z.string().min(1),
  label: z.string().min(1),
  type: Type,
  unit: z.string().nullable(),
  required: z.boolean(),
  options: z.array(z.string()).nullable(),
  validation: FieldValidation.nullable(),
}).partial();
const Create = z.object({ studyId: Uuid, field: Patch.extend({ section: z.string().min(1), label: z.string().min(1) }) });

function cleanOptions(type: FormField["type"] | undefined, options: string[] | null | undefined) {
  if (options === undefined) return undefined;
  if (type && type !== "select" && type !== "multiselect") return null;
  const o = (options ?? []).map((s) => s.trim()).filter(Boolean);
  return o.length ? o : null;
}

/** POST { studyId, field } -> { ok, field } (source = researcher_edited) */
export async function POST(req: Request) {
  return guard(async () => {
    const { studyId, field } = Create.parse(await bodyJson(req));
    const d = db();
    const { data: existing } = await d.from("form_field").select("key, position").eq("study_id", studyId);
    const used = new Set((existing ?? []).map((r) => r.key));
    let key = snakeKey(field.key ?? field.label);
    for (let n = 2; used.has(key); n++) key = `${snakeKey(field.key ?? field.label)}_${n}`;
    const position = Math.max(-1, ...(existing ?? []).map((r) => r.position)) + 1;
    const type = field.type ?? "text";
    const { data, error } = await d.from("form_field").insert({
      study_id: studyId, section: field.section, key, label: field.label, type,
      unit: field.unit ?? null, required: field.required ?? false,
      options: cleanOptions(type, field.options) ?? null, validation: field.validation ?? null,
      source: "researcher_edited", position,
    }).select("*").single();
    if (error) return fail(error.message, 500);
    return ok({ field: data as FormField }, 201);
  });
}

/** PATCH { id, patch } -> { ok, field }. Marks source=researcher_edited; key renames update questionnaire references. */
export async function PATCH(req: Request) {
  return guard(async () => {
    const { id, patch } = z.object({ id: Uuid, patch: Patch }).parse(await bodyJson(req));
    const d = db();
    const { data: cur, error: e0 } = await d.from("form_field").select("*").eq("id", id).maybeSingle();
    if (e0) return fail(e0.message, 500);
    if (!cur) return fail("Field not found", 404);
    const old = cur as FormField;
    const update: Partial<FormField> = { ...patch, source: "researcher_edited" };
    if (patch.key !== undefined) update.key = snakeKey(patch.key);
    const type = patch.type ?? old.type;
    if (patch.options !== undefined || patch.type !== undefined) {
      update.options = cleanOptions(type, patch.options === undefined ? old.options : patch.options) ?? null;
    }
    const { data, error } = await d.from("form_field").update(update).eq("id", id).select("*").single();
    if (error) return fail(error.code === "23505" ? `Key "${update.key}" is already used in this study` : error.message, error.code === "23505" ? 409 : 500);
    const row = data as FormField;
    if (row.key !== old.key) await rewriteFieldRefs(old.study_id, old.key, row.key);
    return ok({ field: row });
  });
}

/** DELETE ?id=<uuid> -> { ok }. Clears questionnaire references to the deleted key. */
export async function DELETE(req: Request) {
  return guard(async () => {
    const id = Uuid.parse(new URL(req.url).searchParams.get("id"));
    const d = db();
    const { data: cur } = await d.from("form_field").select("study_id, key").eq("id", id).maybeSingle();
    if (!cur) return fail("Field not found", 404);
    const { error } = await d.from("form_field").delete().eq("id", id);
    if (error) return fail(error.message, 500);
    await rewriteFieldRefs(cur.study_id, cur.key, null);
    return ok({});
  });
}
