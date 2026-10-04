import { z } from "zod";
import { db } from "@/lib/db/server";
import { QuestionnaireItem } from "@/lib/schemas";
import type { Questionnaire } from "@/lib/db/types";
import { bodyJson, fail, guard, ok, Uuid } from "../_lib/common";
import { relinkVisits } from "../_lib/generate";

export const runtime = "nodejs";

const Patch = z.object({
  title: z.string().min(1),
  kind: z.enum(["recruitment", "follow_up"]),
  items: z.array(QuestionnaireItem),
}).partial();
const Create = z.object({ studyId: Uuid, questionnaire: Patch.extend({ kind: z.enum(["recruitment", "follow_up"]), title: z.string().min(1) }) });

/** POST { studyId, questionnaire:{kind,title,items?} } -> { ok, questionnaire } */
export async function POST(req: Request) {
  return guard(async () => {
    const { studyId, questionnaire: q } = Create.parse(await bodyJson(req));
    const { data, error } = await db().from("questionnaire")
      .insert({ study_id: studyId, kind: q.kind, title: q.title, items: q.items ?? [], origin: "suggested" })
      .select("*").single();
    if (error) return fail(error.message, 500);
    await relinkVisits(studyId);
    return ok({ questionnaire: data as Questionnaire }, 201);
  });
}

/** PATCH { id, patch:{title?,kind?,items?} } -> { ok, questionnaire } */
export async function PATCH(req: Request) {
  return guard(async () => {
    const { id, patch } = z.object({ id: Uuid, patch: Patch }).parse(await bodyJson(req));
    if (!Object.keys(patch).length) return fail("Nothing to update");
    const { data, error } = await db().from("questionnaire").update(patch).eq("id", id).select("*").single();
    if (error) return fail(error.message, 500);
    return ok({ questionnaire: data as Questionnaire });
  });
}

/** DELETE ?id= -> { ok } (visits keep existing but lose questionnaire link) */
export async function DELETE(req: Request) {
  return guard(async () => {
    const id = Uuid.parse(new URL(req.url).searchParams.get("id"));
    const { error } = await db().from("questionnaire").delete().eq("id", id);
    if (error) return fail(error.message, 500);
    return ok({});
  });
}
