import { NextResponse } from "next/server";
import { getShellStatus } from "@/components/shell/status.server";
import { reconcileStaleCalls } from "@/lib/calls/reconcile";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const study = new URL(req.url).searchParams.get("study");
  await reconcileStaleCalls().catch(() => undefined); // heal calls whose webhook never arrived
  const status = await getShellStatus(study);
  return NextResponse.json({ ok: true, status });
}
