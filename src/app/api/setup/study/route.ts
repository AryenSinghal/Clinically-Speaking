import { z } from "zod";
import { db } from "@/lib/db/server";
import { SiteInfo, StudyDetails } from "@/lib/schemas";
import type { Study } from "@/lib/db/types";
import { bodyJson, fail, guard, ok, Uuid } from "../_lib/common";

export const runtime = "nodejs";

const Body = z.object({
  studyId: Uuid,
  title: z.string().min(1).optional(),
  details: StudyDetails.optional(),
  site: SiteInfo.nullable().optional(),
  status: z.enum(["draft", "setup_complete", "recruiting", "active"]).optional(),
});

/** PATCH { studyId, title?, details?, site?, status? } -> { ok, study } */
export async function PATCH(req: Request) {
  return guard(async () => {
    const { studyId, ...patch } = Body.parse(await bodyJson(req));
    const update: Partial<Study> = {};
    if (patch.title !== undefined) update.title = patch.title;
    if (patch.details !== undefined) {
      update.details = patch.details;
      if (patch.title === undefined) update.title = patch.details.title;
    }
    if (patch.site !== undefined) update.site = patch.site;
    if (patch.status !== undefined) update.status = patch.status;
    if (!Object.keys(update).length) return fail("Nothing to update");
    const { data, error } = await db().from("study").update(update).eq("id", studyId).select("*").single();
    if (error) return fail(error.message, 500);
    return ok({ study: data as Study });
  });
}
