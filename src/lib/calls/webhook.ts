import { db } from "@/lib/db/server";
import type { Call } from "@/lib/db/types";
import { runExtraction } from "./extract";
import { ensureRecording, recordingCandidates } from "./recording";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const RANK: Record<Call["status"], number> = { queued: 0, ringing: 1, in_progress: 2, ended: 3, failed: 3, extracting: 4, complete: 5 };

function lowerThan(s: Call["status"]): Call["status"][] {
  return (Object.keys(RANK) as Call["status"][]).filter((k) => RANK[k] < RANK[s]);
}

function metadataCallId(msg: Obj): string | null {
  const call = isObj(msg.call) ? msg.call : {};
  const candidates: unknown[] = [
    isObj(call.metadata) ? call.metadata.callId : null,
    isObj(msg.metadata) ? msg.metadata.callId : null,
    isObj(msg.assistant) && isObj(msg.assistant.metadata) ? msg.assistant.metadata.callId : null,
    isObj(call.assistant) && isObj(call.assistant.metadata) ? call.assistant.metadata.callId : null,
    isObj(call.assistantOverrides) && isObj(call.assistantOverrides.metadata) ? call.assistantOverrides.metadata.callId : null,
  ];
  for (const c of candidates) if (typeof c === "string" && UUID.test(c)) return c;
  return null;
}

async function findCall(msg: Obj): Promise<Call | null> {
  const sb = db();
  const id = metadataCallId(msg);
  if (id) {
    const { data } = await sb.from("call").select("*").eq("id", id).maybeSingle();
    if (data) return data as Call;
  }
  const vapiId = isObj(msg.call) ? str(msg.call.id) : null;
  if (vapiId) {
    const { data } = await sb.from("call").select("*").eq("vapi_call_id", vapiId).maybeSingle();
    if (data) return data as Call;
  }
  return null;
}

function roleOf(r: unknown): "agent" | "participant" | null {
  if (r === "assistant" || r === "bot" || r === "agent") return "agent";
  if (r === "user" || r === "customer") return "participant";
  return null;
}

async function attachVapiId(call: Call, msg: Obj) {
  const vapiId = isObj(msg.call) ? str(msg.call.id) : null;
  if (vapiId && !call.vapi_call_id) await db().from("call").update({ vapi_call_id: vapiId }).eq("id", call.id);
}

async function insertEvent(callId: string, role: "agent" | "participant", text: string, startMs: number | null) {
  const sb = db();
  for (let attempt = 0; attempt < 6; attempt++) {
    const { data: last } = await sb.from("transcript_event").select("seq,role,text").eq("call_id", callId).order("seq", { ascending: false }).limit(1).maybeSingle();
    const l = last as { seq: number; role: string; text: string } | null;
    if (l && l.role === role && l.text === text) return; // duplicate delivery
    const seq = (l?.seq ?? 0) + 1;
    const { error } = await sb.from("transcript_event").insert({ call_id: callId, seq, role, text, start_ms: startMs, end_ms: null });
    if (!error) return;
    if (!/duplicate|unique|23505/i.test(error.message + (error.code ?? ""))) return;
  }
}

type Evt = { seq: number; role: "agent" | "participant"; text: string; start_ms: number | null; end_ms: number | null };

function eventsFromArtifact(artifact: Obj): Evt[] {
  const out: Evt[] = [];
  if (Array.isArray(artifact.messages)) {
    for (const m of artifact.messages) {
      if (!isObj(m)) continue;
      const role = roleOf(m.role);
      const text = str(m.message) ?? str(m.content);
      if (!role || !text) continue;
      const sfs = num(m.secondsFromStart);
      const start = sfs !== null ? Math.round(sfs * 1000) : null;
      const dur = num(m.duration);
      out.push({ seq: out.length + 1, role, text: text.trim(), start_ms: start, end_ms: start !== null && dur !== null ? start + Math.round(dur) : null });
    }
  }
  if (!out.length) {
    const t = str(artifact.transcript);
    if (t) {
      for (const line of t.split(/\n+/)) {
        const m = /^\s*(AI|Assistant|Bot|User|Customer|Participant)\s*:\s*(.+)$/i.exec(line);
        if (m) out.push({ seq: out.length + 1, role: /^(ai|assistant|bot)$/i.test(m[1]) ? "agent" : "participant", text: m[2].trim(), start_ms: null, end_ms: null });
      }
    }
  }
  return out;
}

/** Returns an optional background task for `after()`. Never throws on malformed payloads. */
export async function handleVapiMessage(body: unknown): Promise<{ background?: () => Promise<void> }> {
  const msg = isObj(body) && isObj(body.message) ? body.message : isObj(body) ? body : null;
  if (!msg) return {};
  const type = str(msg.type);
  if (!type) return {};
  const call = await findCall(msg);
  if (!call) return {};
  const sb = db();
  await attachVapiId(call, msg);

  if (type === "status-update") {
    const s = str(msg.status);
    const map: Record<string, Call["status"] | undefined> = { queued: "queued", scheduled: "queued", ringing: "ringing", "in-progress": "in_progress", ended: "ended" };
    const next = s ? map[s] : undefined;
    if (!next || RANK[next] <= RANK[call.status]) return {};
    const patch: Partial<Call> = { status: next };
    if (next === "in_progress" && !call.started_at) patch.started_at = new Date().toISOString();
    if (next === "ended" && !call.ended_at) patch.ended_at = new Date().toISOString();
    await sb.from("call").update(patch).eq("id", call.id).in("status", lowerThan(next));
    return {};
  }

  if (type === "transcript") {
    if (msg.transcriptType !== "final") return {};
    if (RANK[call.status] > RANK.in_progress) return {};
    const role = roleOf(msg.role);
    const text = str(msg.transcript);
    if (!role || !text) return {};
    let startedAt = call.started_at ? Date.parse(call.started_at) : NaN;
    if (!Number.isFinite(startedAt)) {
      startedAt = Date.now();
      await sb.from("call").update({ status: "in_progress", started_at: new Date(startedAt).toISOString() }).eq("id", call.id).in("status", ["queued", "ringing"]);
    }
    await insertEvent(call.id, role, text.trim(), Math.max(0, Date.now() - startedAt));
    return {};
  }

  if (type === "end-of-call-report") {
    if (call.status === "extracting" || call.status === "complete") return {};
    const artifact = isObj(msg.artifact) ? msg.artifact : {};
    const evs = eventsFromArtifact(artifact);
    if (evs.length) {
      await sb.from("transcript_event").upsert(evs.map((e) => ({ ...e, call_id: call.id })), { onConflict: "call_id,seq" });
      await sb.from("transcript_event").delete().eq("call_id", call.id).gt("seq", evs.length);
    }
    const rec = isObj(artifact.recording) ? artifact.recording : {};
    const mono = isObj(rec.mono) ? rec.mono : {};
    const recordingUrl = str(artifact.recordingUrl) ?? str(msg.recordingUrl) ?? str(mono.combinedUrl) ?? str(rec.stereoUrl);
    const endedReason = str(msg.endedReason) ?? "";
    const { count } = await sb.from("transcript_event").select("id", { count: "exact", head: true }).eq("call_id", call.id);
    if (!count && /(did-not-answer|busy|voicemail|failed|error|rejected|invalid|unreachable)/i.test(endedReason)) {
      await sb.from("call").update({ status: "failed", ended_at: new Date().toISOString(), flag_reason: `Call did not connect (${endedReason})` }).eq("id", call.id);
      return {};
    }
    const transcript = str(artifact.transcript);
    await sb.from("call").update({
      status: "ended",
      ended_at: call.ended_at ?? new Date().toISOString(),
      ...(recordingUrl && !call.recording_url ? { recording_url: recordingUrl } : {}),
      ...(transcript && !call.transcript ? { transcript } : {}),
    }).eq("id", call.id).in("status", ["queued", "ringing", "in_progress", "ended", "failed"]);
    return {
      background: async () => {
        await Promise.all([
          ensureRecording(call.id, [...(recordingUrl ? [recordingUrl] : []), ...recordingCandidates({ artifact })]).catch(() => null),
          runExtraction(call.id).then(() => undefined),
        ]);
      },
    };
  }
  return {};
}
