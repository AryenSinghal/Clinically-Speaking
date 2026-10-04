import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/server";
import { listCandidates } from "@/lib/recruitment/candidates";

export async function GET(req: Request) {
  try {
    const studyId = new URL(req.url).searchParams.get("studyId");
    const candidates = await listCandidates(studyId);
    return NextResponse.json({ ok: true, candidates });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed to load candidates" }, { status: 500 });
  }
}

const Patch = z.object({
  ids: z.array(z.string().uuid()).min(1).max(200),
  studyId: z.string().uuid().optional(),
  status: z.enum(["suggested", "selected", "accepted"]).optional(),
  fitScores: z.record(z.string(), z.number().min(0).max(100)).optional(),
});

/** Link candidates to a study / change status / persist fit scores. */
export async function PATCH(req: Request) {
  const parsed = Patch.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  const { ids, studyId, status, fitScores } = parsed.data;
  try {
    const patch: { study_id?: string; status?: "suggested" | "selected" | "accepted" } = {};
    if (studyId) patch.study_id = studyId;
    if (status) patch.status = status;
    if (Object.keys(patch).length) {
      let q = db().from("candidate").update(patch).in("id", ids);
      // Never reassign a candidate that already belongs to a different study.
      if (studyId) q = q.or(`study_id.is.null,study_id.eq.${studyId}`);
      const { error } = await q;
      if (error) throw new Error(error.message);
    }
    if (fitScores) {
      await Promise.all(Object.entries(fitScores).filter(([id]) => ids.includes(id)).map(async ([id, score]) => {
        const { error } = await db().from("candidate").update({ fit_score: score }).eq("id", id);
        if (error) throw new Error(error.message);
      }));
    }
    const { data, error } = await db().from("candidate").select("*").in("id", ids);
    if (error) throw new Error(error.message);
    return NextResponse.json({ ok: true, candidates: data ?? [] });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Update failed" }, { status: 500 });
  }
}
