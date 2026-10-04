import { after } from "next/server";
import { db } from "@/lib/db/server";
import type { Call } from "@/lib/db/types";
import { getVapiCall } from "@/lib/vapi";
import { runExtraction } from "./extract";
import { handleVapiMessage } from "./webhook";

const CHECK_AFTER_MS = 90_000;     // give Vapi time to dial before we look
const GIVE_UP_MS = 4 * 60_000;     // still queued/ringing after this long: nobody picked up
const IN_FLIGHT: Call["status"][] = ["queued", "ringing", "in_progress"];
const EXTRACT_STALE_MS = 3 * 60_000; // analysis normally takes seconds; longer means it was interrupted

/**
 * Heals calls whose Vapi webhook never reached us (tunnel down, call never answered, etc.).
 * For each call stuck "in flight", ask Vapi what happened: if it ended, process it exactly like the
 * end-of-call webhook would; if it never connected, mark it failed so the UI and the one-at-a-time guard recover.
 */
export async function reconcileStaleCalls(): Promise<{ checked: number; fixed: number }> {
  const sb = db();
  const cutoff = new Date(Date.now() - CHECK_AFTER_MS).toISOString();
  const { data } = await sb.from("call").select("*").in("status", IN_FLIGHT).not("vapi_call_id", "is", null).lt("created_at", cutoff).limit(10);
  const stale = (data ?? []) as Call[];
  let fixed = 0;

  for (const call of stale) {
    const age = Date.now() - Date.parse(call.created_at);
    const fail = async (reason: string) => {
      const { data: upd } = await sb.from("call")
        .update({ status: "failed", ended_at: new Date().toISOString(), flag_reason: reason })
        .eq("id", call.id).in("status", IN_FLIGHT).select("id");
      if (upd?.length) fixed++;
    };
    try {
      const vapi = await getVapiCall(call.vapi_call_id!);
      if (vapi.status === "ended") {
        const { background } = await handleVapiMessage({
          message: { type: "end-of-call-report", call: vapi, artifact: vapi.artifact ?? {}, endedReason: vapi.endedReason },
        });
        if (background) after(async () => { try { await background(); } catch { /* recoverable via retry-extraction */ } });
        fixed++;
      } else if (age > GIVE_UP_MS && vapi.status !== "in-progress") {
        await fail("No answer: the call never connected");
      }
    } catch {
      if (age > 2 * GIVE_UP_MS) await fail("Call state could not be confirmed with Vapi");
    }
  }

  // Analysis that was interrupted (e.g. server restarted mid-extraction) would sit in "extracting" forever: re-run it.
  const extractCutoff = new Date(Date.now() - EXTRACT_STALE_MS).toISOString();
  const { data: stuckExtract } = await sb.from("call").select("id").eq("status", "extracting").lt("ended_at", extractCutoff).limit(5);
  for (const row of (stuckExtract ?? []) as { id: string }[]) {
    const { data: reset } = await sb.from("call").update({ status: "ended" }).eq("id", row.id).eq("status", "extracting").select("id");
    if (reset?.length) {
      fixed++;
      after(async () => { try { await runExtraction(row.id); } catch { /* recoverable via retry-extraction */ } });
    }
  }
  return { checked: stale.length + (stuckExtract?.length ?? 0), fixed };
}
