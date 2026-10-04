import type { Call, Candidate } from "@/lib/db/types";
import type { ScoreResult } from "@/lib/scoring";

export type Row = { c: Candidate; r: ScoreResult };
export type CallsByCandidate = Record<string, { screening?: Call; confirmation?: Call }>;

export const ACTIVE_CALL: Call["status"][] = ["queued", "ringing", "in_progress", "ended", "extracting"];
export const isActive = (c?: Call) => !!c && ACTIVE_CALL.includes(c.status);

export type TabKey = "toScreen" | "progress" | "results" | "accepted";
export const TABS: { key: TabKey; label: string }[] = [
  { key: "toScreen", label: "To screen" },
  { key: "progress", label: "In progress" },
  { key: "results", label: "Results" },
  { key: "accepted", label: "Accepted" },
];

/** Which list a candidate belongs to, derived from candidate status + latest calls + the local call queue. */
export function tabOf(c: Candidate, calls: CallsByCandidate[string] | undefined, queued: boolean): TabKey {
  if (c.status === "accepted" || c.status === "enrolled") return isActive(calls?.confirmation) ? "progress" : "accepted";
  if (c.status === "screened" || c.status === "good" || c.status === "invalid") return "results";
  if (queued || isActive(calls?.screening)) return "progress";
  return "toScreen";
}

export const canSelect = (c: Candidate, calls: CallsByCandidate[string] | undefined) =>
  (c.status === "suggested" || c.status === "selected") && !isActive(calls?.screening);

export function callStatusLabel(call: Call): string {
  switch (call.status) {
    case "queued": return "Dialing";
    case "ringing": return "Ringing";
    case "in_progress": return "On the call";
    case "ended": case "extracting": return "Analyzing transcript";
    default: return call.status;
  }
}

export type Stage = 1 | 2 | 3 | 4 | 5;
export const STAGES = ["Find candidates", "Select", "Screening calls", "Review results", "Accept & schedule"] as const;
