import { NextResponse } from "next/server";
import { z } from "zod";
import { startCall, CallStartError } from "@/lib/calls/start";

export const runtime = "nodejs";
const Body = z.object({ candidateId: z.string().uuid(), kind: z.enum(["screening", "confirmation", "survey", "reminder"]), visitId: z.string().uuid().optional() });

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  try {
    const { callId } = await startCall(parsed.data);
    return NextResponse.json({ ok: true, callId });
  } catch (e) {
    if (e instanceof CallStartError) return NextResponse.json({ ok: false, error: e.message }, { status: e.status });
    return NextResponse.json({ ok: false, error: "Failed to start call" }, { status: 500 });
  }
}
