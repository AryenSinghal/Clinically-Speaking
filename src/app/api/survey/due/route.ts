import { NextResponse } from "next/server";
import { db } from "@/lib/db/server";
import { buildMatrix } from "@/lib/survey";
import type { Call, Candidate, Visit } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/** POST {studyId, simulatedDay} -> due survey/reminder cells for enrolled candidates. */
export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as { studyId?: string; simulatedDay?: number };
    if (!body.studyId) return NextResponse.json({ ok: false, error: "studyId required" }, { status: 400 });
    const day = Number.isFinite(body.simulatedDay) ? Number(body.simulatedDay) : 0;
    const c = db();
    const [v, cand, calls] = await Promise.all([
      c.from("visit").select("*").eq("study_id", body.studyId),
      c.from("candidate").select("*").eq("study_id", body.studyId).eq("status", "enrolled"),
      c.from("call").select("*").eq("study_id", body.studyId).in("kind", ["survey", "reminder"]),
    ]);
    const err = v.error ?? cand.error ?? calls.error;
    if (err) return NextResponse.json({ ok: false, error: err.message }, { status: 500 });
    const { today, rows } = buildMatrix(cand.data as Candidate[], v.data as Visit[], calls.data as Call[], day);
    const due = rows.flatMap((r) => r.cells.filter((x) => x.status === "due").map((x) => ({ candidateId: r.candidate.id, visitId: x.visitId, kind: x.kind, overdue: x.overdue })));
    return NextResponse.json({ ok: true, today, due });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
