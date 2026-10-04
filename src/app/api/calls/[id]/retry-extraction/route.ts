import { NextResponse, after } from "next/server";
import { runExtraction } from "@/lib/calls/extract";

export const runtime = "nodejs";
export const maxDuration = 120;

// Re-runs extraction. Add ?wait=1 to await the result instead of running in the background.
export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ ok: false, error: "Invalid id" }, { status: 400 });
  if (new URL(req.url).searchParams.get("wait") === "1") {
    const r = await runExtraction(id, { force: true });
    return NextResponse.json(r, { status: r.ok ? 200 : r.skipped ? 409 : 500 });
  }
  after(async () => { await runExtraction(id, { force: true }); });
  return NextResponse.json({ ok: true, started: true });
}
