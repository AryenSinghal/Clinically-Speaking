import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/server";
import type { Study } from "@/lib/db/types";
import { listCandidates } from "@/lib/recruitment/candidates";
import { DEFAULT_SITE, DEFAULT_WEIGHTS, scoreCandidate } from "@/lib/scoring";

const Body = z.object({
  studyId: z.string().uuid(),
  weights: z.object({ condition: z.number().min(0), geography: z.number().min(0), demographics: z.number().min(0) }).optional(),
  maxKm: z.number().min(1).max(500).optional(),
  persist: z.boolean().optional(),
});

/** Server-side scoring of the registry for a study; optionally persists fit_score. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  const { studyId, weights = DEFAULT_WEIGHTS, maxKm = 100, persist } = parsed.data;
  try {
    const { data } = await db().from("study").select("*").eq("id", studyId).maybeSingle();
    const study = data as Study | null;
    if (!study) return NextResponse.json({ ok: false, error: "Study not found" }, { status: 404 });
    const site = study.site ? { lat: study.site.lat, lng: study.site.lng } : DEFAULT_SITE;
    const cands = await listCandidates(studyId);
    const scores = cands.map((c) => ({ id: c.id, ...scoreCandidate(c, { site, eligibility: study.details?.eligibility ?? null, weights, maxKm }) }))
      .sort((a, b) => b.score - a.score);
    if (persist) {
      await Promise.all(scores.map((s) => db().from("candidate").update({ fit_score: s.score }).eq("id", s.id)));
    }
    return NextResponse.json({ ok: true, scores });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Scoring failed" }, { status: 500 });
  }
}
