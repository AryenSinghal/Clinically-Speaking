import { GEMINI_MODEL, requireEnv } from "@/lib/env";

export type StartCallInput = {
  phone: string;                         // E.164 destination (may be overridden by DEMO_PHONE_OVERRIDE)
  systemPrompt: string;                  // full voice-agent instructions
  firstMessage: string;
  metadata: { callId: string; [k: string]: string };   // our `call.id` MUST be in metadata.callId
};

/** Starts an outbound Vapi call. Returns Vapi's call id. Webhook: `${PUBLIC_URL}/api/vapi/webhook`. */
export async function startVapiCall(input: StartCallInput): Promise<{ vapiCallId: string; dialed: string }> {
  const dialed = process.env.DEMO_PHONE_OVERRIDE || input.phone;
  await assertWebhookReachable();
  // One or more Vapi phone number IDs, comma separated. If one hits its daily outbound cap, the next is tried.
  const numberIds = (process.env.VAPI_PHONE_NUMBER_IDS || requireEnv("VAPI_PHONE_NUMBER_ID")).split(",").map((x) => x.trim()).filter(Boolean);
  const body = (phoneNumberId: string) => ({
    phoneNumberId,
    customer: { number: dialed },
    assistant: {
      name: "EPRO Study Assistant",
      firstMessage: input.firstMessage,
      model: {
        provider: "google",
        model: process.env.VAPI_LLM_MODEL || GEMINI_MODEL(),
        messages: [{ role: "system", content: input.systemPrompt }],
        temperature: 0.4,
      },
      voice: { provider: "vapi", voiceId: "Elliot" },
      transcriber: { provider: "deepgram", model: "nova-2", language: "en" },
      recordingEnabled: true,
      endCallFunctionEnabled: true,
      silenceTimeoutSeconds: 30,
      maxDurationSeconds: 600,
      server: { url: `${requireEnv("PUBLIC_URL").replace(/\/$/, "")}/api/vapi/webhook` },
      serverMessages: ["status-update", "transcript", "end-of-call-report"],
      metadata: input.metadata,
    },
  });

  let limitHits = 0;
  for (const id of numberIds) {
    const res = await fetch("https://api.vapi.ai/call", {
      method: "POST",
      headers: { Authorization: `Bearer ${requireEnv("VAPI_API_KEY")}`, "Content-Type": "application/json" },
      body: JSON.stringify(body(id)),
    });
    if (res.ok) {
      const json = (await res.json()) as { id: string };
      return { vapiCallId: json.id, dialed };
    }
    const raw = await res.text();
    let message = raw;
    try { const j = JSON.parse(raw) as { message?: string | string[] }; message = Array.isArray(j.message) ? j.message.join("; ") : (j.message ?? raw); } catch { /* keep raw text */ }
    if (/daily outbound call limit/i.test(message)) { limitHits++; continue; } // try the next number
    throw new Error(`Vapi call failed (${res.status}): ${message}`);
  }
  throw new Error(
    `Vapi's daily outbound call limit has been reached on ${limitHits === 1 ? "your phone number" : `all ${limitHits} configured phone numbers`}. ` +
    "It resets daily. To get more calls, add another number's ID to VAPI_PHONE_NUMBER_IDS (comma separated) or import a number from your own telephony provider.",
  );
}

export type VapiCallState = { id: string; status?: string; endedReason?: string; artifact?: Record<string, unknown>; metadata?: Record<string, unknown> };

/** Fetch a call's current state from Vapi (used to heal calls whose webhook never arrived). */
export async function getVapiCall(vapiCallId: string): Promise<VapiCallState> {
  const res = await fetch(`https://api.vapi.ai/call/${encodeURIComponent(vapiCallId)}`, {
    headers: { Authorization: `Bearer ${requireEnv("VAPI_API_KEY")}` },
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Vapi GET /call failed (${res.status})`);
  return (await res.json()) as VapiCallState;
}

/**
 * Calls are capped per day, so never dial when Vapi's webhook could not reach us: you would lose the live transcript,
 * the call status and the extraction. Free tunnels (cloudflared/ngrok) get a NEW address on every restart.
 */
async function assertWebhookReachable(): Promise<void> {
  const url = `${requireEnv("PUBLIC_URL").replace(/\/$/, "")}/api/vapi/webhook`;
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: { type: "ping" } }), signal: AbortSignal.timeout(5000), cache: "no-store" });
    if (res.ok) return;
  } catch { /* fall through */ }
  throw new Error(
    "Your public tunnel is not reachable, so Vapi could not send call updates here. " +
    "Restart the tunnel (it gets a new address each time), copy the new https:// address into PUBLIC_URL in .env.local, then try again. No call was placed.",
  );
}
