import { db } from "@/lib/db/server";
import { requireEnv } from "@/lib/env";

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === "object" && v !== null && !Array.isArray(v);
const str = (v: unknown): string | null => (typeof v === "string" && v.startsWith("http") ? v : null);

/** Every recording URL Vapi might expose on a call object, best guess first. */
export function recordingCandidates(call: unknown): string[] {
  const c = isObj(call) ? call : {};
  const a = isObj(c.artifact) ? c.artifact : {};
  const rec = isObj(a.recording) ? a.recording : {};
  const mono = isObj(rec.mono) ? rec.mono : {};
  const all = [a.stereoRecordingUrl, a.recordingUrl, rec.stereoUrl, c.stereoRecordingUrl, c.recordingUrl, mono.combinedUrl, mono.assistantUrl]
    .map(str).filter((u): u is string => !!u);
  return [...new Set(all)];
}

/** Returns the audio bytes if the URL serves real audio (not an XML/JSON error page). */
async function fetchAudio(url: string): Promise<{ buf: ArrayBuffer; type: string } | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const type = (res.headers.get("content-type") ?? "").toLowerCase();
    if (type.includes("xml") || type.includes("json") || type.includes("html")) return null;
    const buf = await res.arrayBuffer();
    return buf.byteLength > 1000 ? { buf, type: type || "audio/wav" } : null;
  } catch { return null; }
}

async function fetchVapiCall(vapiCallId: string): Promise<unknown> {
  const res = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(vapiCallId)}`, {
    headers: { Authorization: `Bearer ${requireEnv("VAPI_API_KEY")}` },
  });
  if (!res.ok) throw new Error(`Vapi GET /call failed (${res.status})`);
  return res.json();
}

/**
 * Make sure `call.recording_url` points at playable audio. Tries `hint` URLs (from the webhook), then the
 * Vapi API, copies the first working file into the Supabase `recordings` bucket, and stores that public URL.
 * Falls back to the first candidate URL if copying fails. Returns the URL stored, or null.
 */
export async function ensureRecording(callId: string, hints: string[] = []): Promise<string | null> {
  const sb = db();
  const { data } = await sb.from("call").select("vapi_call_id").eq("id", callId).maybeSingle();
  const vapiId = (data as { vapi_call_id: string | null } | null)?.vapi_call_id ?? null;

  let candidates = [...hints];
  if (vapiId) {
    try { candidates = [...new Set([...candidates, ...recordingCandidates(await fetchVapiCall(vapiId))])]; } catch { /* use hints only */ }
  }

  for (const url of candidates) {
    const audio = await fetchAudio(url);
    if (!audio) continue;
    const ext = audio.type.includes("mpeg") || audio.type.includes("mp3") ? "mp3" : audio.type.includes("ogg") ? "ogg" : "wav";
    const path = `${callId}.${ext}`;
    const { error } = await sb.storage.from("recordings").upload(path, audio.buf, { contentType: audio.type, upsert: true });
    const publicUrl = error ? url : sb.storage.from("recordings").getPublicUrl(path).data.publicUrl;
    await sb.from("call").update({ recording_url: publicUrl }).eq("id", callId);
    return publicUrl;
  }
  return null;
}
