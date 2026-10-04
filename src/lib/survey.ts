// Pure survey due-logic, shared by the UI (client) and /api/survey/due. No server imports here.
import type { Call, Candidate, Visit } from "@/lib/db/types";

const DAY_MS = 86_400_000;
const IN_FLIGHT: Call["status"][] = ["queued", "ringing", "in_progress", "ended", "extracting"];

/** Parse 'YYYY-MM-DD' (or ISO) as a UTC midnight timestamp. */
export function dateToUtcMs(d: string): number {
  const ymd = d.slice(0, 10);
  const t = Date.parse(`${ymd}T00:00:00Z`);
  return Number.isNaN(t) ? 0 : t;
}

export function addDays(d: string, n: number): string {
  return new Date(dateToUtcMs(d) + n * DAY_MS).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((dateToUtcMs(to) - dateToUtcMs(from)) / DAY_MS);
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

/** How many days before a clinic visit its reminder call is due. */
export const REMINDER_LEAD_DAYS = 1;

export type CallKindOnBoard = "survey" | "reminder";

/** One scheduled call on a participant's timeline: a follow-up survey or a pre-visit reminder. */
export type ScheduleItem = {
  key: string;            // `${kind}:${visit.id}`
  kind: CallKindOnBoard;
  visit: Visit;           // the survey visit, or the clinic visit being reminded about
  dueDay: number;         // study day the call becomes due
  windowDays: number;
  label: string;
};

/** Survey calls (post-enrollment) plus a reminder one day before every clinic visit after day 0, ordered by due day. */
export function scheduleItems(visits: Visit[]): ScheduleItem[] {
  const items: ScheduleItem[] = [];
  for (const v of visits) {
    if (v.type === "survey_call" && v.day_offset >= 0) {
      items.push({ key: `survey:${v.id}`, kind: "survey", visit: v, dueDay: v.day_offset, windowDays: Math.max(0, v.window_days), label: v.name });
    } else if (v.type === "clinic" && v.day_offset >= REMINDER_LEAD_DAYS) {
      items.push({ key: `reminder:${v.id}`, kind: "reminder", visit: v, dueDay: v.day_offset - REMINDER_LEAD_DAYS, windowDays: 0, label: `Reminder: ${v.name}` });
    }
  }
  return items.sort((a, b) => a.dueDay - b.dueDay || a.visit.position - b.visit.position);
}

/** Survey visits only (post-enrollment: day_offset >= 0), ordered by day_offset. */
export function surveyVisits(visits: Visit[]): Visit[] {
  return visits.filter((v) => v.type === "survey_call" && v.day_offset >= 0).sort((a, b) => a.day_offset - b.day_offset || a.position - b.position);
}

export type CellStatus = "upcoming" | "due" | "calling" | "complete" | "flagged" | "skipped";

export type SurveyCell = {
  key: string;
  kind: CallKindOnBoard;
  visitId: string;
  status: CellStatus;
  overdue: boolean; // due but past the end of its window
  callId: string | null;
  flag: Call["flag"];
};

/** Status of one candidate x scheduled-call cell, given the candidate's day since enrollment. */
export function cellFor(item: ScheduleItem, day: number, calls: Call[]): SurveyCell {
  const { visit, kind } = item;
  const mine = calls
    .filter((c) => c.kind === kind && c.visit_id === visit.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const done = mine.find((c) => c.status === "complete");
  const base = { key: item.key, kind, visitId: visit.id, overdue: false };
  if (done) {
    // A reminder where the participant can't attend needs human follow-up, so it is flagged like an escalation.
    const flagged = done.flag === "escalate" || (kind === "reminder" && done.flag === "invalid");
    return { ...base, status: flagged ? "flagged" : "complete", callId: done.id, flag: done.flag };
  }
  const live = mine.find((c) => IN_FLIGHT.includes(c.status));
  if (live) return { ...base, status: "calling", callId: live.id, flag: live.flag };
  const lastFailed = mine[0] ?? null;
  const carry = { callId: lastFailed?.id ?? null, flag: null };
  if (day < item.dueDay - item.windowDays) return { ...base, status: "upcoming", ...carry };
  // A reminder is pointless once the visit day has arrived.
  if (kind === "reminder" && day >= visit.day_offset) return { ...base, status: "skipped", ...carry };
  return { ...base, status: "due", overdue: day > item.dueDay + item.windowDays, ...carry };
}

export type SurveyRow = { candidate: Candidate; day: number; date: string; cells: SurveyCell[] };

/** Build the candidates x scheduled-calls matrix. Virtual today = earliest enrolled_at + simulatedDay. */
export function buildMatrix(candidates: Candidate[], visits: Visit[], calls: Call[], simulatedDay: number): { today: string; rows: SurveyRow[] } {
  const enrolled = candidates.filter((c) => c.status === "enrolled" && c.enrolled_at);
  const base = enrolled.reduce((min, c) => (c.enrolled_at!.slice(0, 10) < min ? c.enrolled_at!.slice(0, 10) : min), enrolled[0]?.enrolled_at?.slice(0, 10) ?? todayStr());
  const today = addDays(base, simulatedDay);
  const items = scheduleItems(visits);
  const rows = enrolled.map((candidate) => {
    const day = daysBetween(candidate.enrolled_at!, today);
    const mine = calls.filter((c) => c.candidate_id === candidate.id);
    return { candidate, day, date: today, cells: items.map((it) => cellFor(it, day, mine)) };
  });
  return { today, rows };
}
