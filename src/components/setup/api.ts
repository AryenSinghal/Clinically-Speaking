export type ApiResult<T> = T & { ok: true };

/** Fetch JSON from our API; throws Error(message) on failure (user-visible). */
export async function api<T>(url: string, init?: RequestInit & { json?: unknown }): Promise<ApiResult<T>> {
  const { json, ...rest } = init ?? {};
  const res = await fetch(url, {
    ...rest,
    headers: json !== undefined ? { "Content-Type": "application/json", ...(rest.headers ?? {}) } : rest.headers,
    body: json !== undefined ? JSON.stringify(json) : rest.body,
  });
  let data: unknown = null;
  try { data = await res.json(); } catch { /* non-JSON */ }
  const d = data as { ok?: boolean; error?: string } | null;
  if (!res.ok || !d || d.ok !== true) throw new Error(d?.error ?? `Request failed (${res.status})`);
  return d as ApiResult<T>;
}

export type StepKey = "parse" | "edc" | "timeline" | "questionnaires";
export type StepState = "pending" | "active" | "done" | "error";
export const STEP_LABELS: Record<StepKey, string> = {
  parse: "Parsing protocol",
  edc: "Building EDC template",
  timeline: "Building timeline",
  questionnaires: "Suggesting questionnaires",
};

/** Run generation steps (EDC first, then timeline + questionnaires in parallel), reporting progress. */
export async function runGeneration(studyId: string, onStep: (s: StepKey, st: StepState) => void, skipParse = true): Promise<void> {
  if (skipParse) onStep("parse", "done");
  onStep("edc", "active");
  try { await api(`/api/setup/generate`, { method: "POST", json: { studyId, step: "edc" } }); onStep("edc", "done"); }
  catch (e) { onStep("edc", "error"); throw e; }
  onStep("timeline", "active");
  onStep("questionnaires", "active");
  const run = async (step: "timeline" | "questionnaires") => {
    try { await api(`/api/setup/generate`, { method: "POST", json: { studyId, step } }); onStep(step, "done"); }
    catch (e) { onStep(step, "error"); throw e; }
  };
  const results = await Promise.allSettled([run("timeline"), run("questionnaires")]);
  const failed = results.find((r): r is PromiseRejectedResult => r.status === "rejected");
  if (failed) throw failed.reason instanceof Error ? failed.reason : new Error(String(failed.reason));
}

export const STEP_HINTS: Record<StepKey, string> = {
  parse: "Reading eligibility, endpoints and assessments",
  edc: "Data-capture fields, types and validation, grouped by section",
  timeline: "Visits, windows and survey calls on a day axis",
  questionnaires: "Screening and follow-up call scripts mapped to EDC fields",
};

export type FriendlyError = { title: string; hint: string | null; raw: string };

/** Turn raw server/Gemini errors into something a researcher can act on. */
export function describeError(raw: string): FriendlyError {
  const m = raw.toLowerCase();
  if (/api[_ ]?key|gemini_api_key|permission[_ ]denied|unauthenticated|401|403/.test(m) && /key|auth|permission|denied/.test(m)) {
    return { title: "Gemini API key is missing or invalid", hint: "Set GEMINI_API_KEY in .env.local and restart the server.", raw };
  }
  if (/model/.test(m) && /not found|404|not supported|unknown|invalid|unavailable/.test(m)) {
    return { title: "The Gemini model name was not accepted", hint: "Check GEMINI_MODEL in .env.local (for example a current Gemini Flash model) and restart the server.", raw };
  }
  if (/429|quota|rate.?limit|resource[_ ]exhausted/.test(m)) {
    return { title: "Gemini is rate limiting requests", hint: "Wait a few seconds and try again.", raw };
  }
  if (/no readable protocol text|could not read pdf/.test(m)) {
    return { title: "We could not read text from that file", hint: "If the PDF is a scan, paste the protocol text instead.", raw };
  }
  if (/failed to fetch|networkerror|load failed/.test(m)) {
    return { title: "Could not reach the server", hint: "Check that the app is running and try again.", raw };
  }
  return { title: "Something went wrong", hint: null, raw };
}

export function errText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
