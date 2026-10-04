import { NextResponse, after } from "next/server";
import { handleVapiMessage } from "@/lib/calls/webhook";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  let body: unknown = null;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: true, ignored: true }); }
  try {
    const { background } = await handleVapiMessage(body);
    if (background) after(async () => { try { await background(); } catch { console.error("[vapi webhook] background task failed"); } });
  } catch (e) {
    console.error("[vapi webhook] handler error:", e instanceof Error ? e.message : "unknown");
  }
  // Always 200 so Vapi does not retry-storm; failures are recoverable via retry-extraction.
  return NextResponse.json({ ok: true });
}
