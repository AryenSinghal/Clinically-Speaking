import { NextResponse } from "next/server";
import { reconcileStaleCalls } from "@/lib/calls/reconcile";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST -> check calls stuck "in progress" against Vapi and fix them. Safe to call repeatedly. */
export async function POST() {
  try {
    return NextResponse.json({ ok: true, ...(await reconcileStaleCalls()) });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "Failed" }, { status: 500 });
  }
}
