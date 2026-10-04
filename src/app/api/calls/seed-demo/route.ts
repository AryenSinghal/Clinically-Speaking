import { NextResponse } from "next/server";
import { z } from "zod";
import { seedDemoCall } from "@/lib/calls/demo";

export const runtime = "nodejs";
const Body = z.object({
  candidateId: z.string().uuid(),
  variant: z.enum(["good", "escalate", "invalid"]).default("good"),
  kind: z.enum(["screening", "confirmation", "survey"]).default("screening"),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  const r = await seedDemoCall(parsed.data.candidateId, parsed.data.variant, parsed.data.kind);
  if ("error" in r) return NextResponse.json({ ok: false, error: r.error }, { status: r.status });
  return NextResponse.json({ ok: true, callId: r.callId });
}
