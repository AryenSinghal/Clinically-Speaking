import { z } from "zod";
import { db } from "@/lib/db/server";
import type { Visit } from "@/lib/db/types";
import { bodyJson, fail, guard, ok, Uuid } from "../_lib/common";
import { fetchVisits, resequenceVisits } from "../_lib/generate";

export const runtime = "nodejs";

const Patch = z.object({
  name: z.string().min(1),
  type: z.enum(["clinic", "survey_call"]),
  day_offset: z.number().int(),
  window_days: z.number().int().min(0),
  questionnaire_id: Uuid.nullable(),
  notes: z.string().nullable(),
}).partial();
const Create = z.object({ studyId: Uuid, visit: Patch.extend({ name: z.string().min(1) }) });

/** POST { studyId, visit } -> { ok, visits } (full re-sorted list) */
export async function POST(req: Request) {
  return guard(async () => {
    const { studyId, visit } = Create.parse(await bodyJson(req));
    const { error } = await db().from("visit").insert({
      study_id: studyId, name: visit.name, type: visit.type ?? "clinic", day_offset: visit.day_offset ?? 0,
      window_days: visit.window_days ?? 0, questionnaire_id: visit.questionnaire_id ?? null,
      notes: visit.notes ?? null, position: 9999,
    });
    if (error) return fail(error.message, 500);
    await resequenceVisits(studyId);
    return ok({ visits: await fetchVisits(studyId) }, 201);
  });
}

/** PATCH { id, patch } -> { ok, visits } */
export async function PATCH(req: Request) {
  return guard(async () => {
    const { id, patch } = z.object({ id: Uuid, patch: Patch }).parse(await bodyJson(req));
    const update: Partial<Visit> = { ...patch };
    if (patch.type === "clinic") update.questionnaire_id = null;
    const { data, error } = await db().from("visit").update(update).eq("id", id).select("study_id").single();
    if (error) return fail(error.message, 500);
    await resequenceVisits(data.study_id);
    return ok({ visits: await fetchVisits(data.study_id) });
  });
}

/** DELETE ?id= -> { ok, visits } */
export async function DELETE(req: Request) {
  return guard(async () => {
    const id = Uuid.parse(new URL(req.url).searchParams.get("id"));
    const d = db();
    const { data: cur } = await d.from("visit").select("study_id").eq("id", id).maybeSingle();
    if (!cur) return fail("Visit not found", 404);
    const { error } = await d.from("visit").delete().eq("id", id);
    if (error) return fail(error.message, 500);
    await resequenceVisits(cur.study_id);
    return ok({ visits: await fetchVisits(cur.study_id) });
  });
}
