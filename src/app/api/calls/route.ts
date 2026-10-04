import { NextResponse } from "next/server";
import { db } from "@/lib/db/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const studyId = url.searchParams.get("studyId");
  const candidateId = url.searchParams.get("candidateId");
  let q = db().from("call").select("*").order("created_at", { ascending: false }).limit(200);
  if (studyId) q = q.eq("study_id", studyId);
  if (candidateId) q = q.eq("candidate_id", candidateId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, calls: data ?? [] });
}
