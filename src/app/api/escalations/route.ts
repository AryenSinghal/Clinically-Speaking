import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const studyId = new URL(req.url).searchParams.get("studyId");
  let q = db().from("call").select("*").eq("flag", "escalate").order("created_at", { ascending: false });
  if (studyId) q = q.eq("study_id", studyId);
  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, calls: data ?? [] });
}

const Body = z.object({ callId: z.string().uuid(), resolved: z.boolean() });
export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  const { error } = await db().from("call").update({ escalation_resolved: parsed.data.resolved }).eq("id", parsed.data.callId);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
