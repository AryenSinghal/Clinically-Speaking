import { NextResponse } from "next/server";
import { ensureRecording } from "@/lib/calls/recording";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Re-fetch the recording from Vapi and store a playable copy. Useful when a call's audio link is broken. */
export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  try {
    const url = await ensureRecording(id);
    if (!url) return NextResponse.json({ ok: false, error: "Vapi did not expose a playable recording for this call" }, { status: 404 });
    return NextResponse.json({ ok: true, recording_url: url });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
