import type { Call } from "@/lib/db/types";

export function fmtMs(ms: number | null | undefined): string {
  if (ms == null) return "--:--";
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export const IN_PROGRESS: Call["status"][] = ["queued", "ringing", "in_progress"];
export const isLive = (s: Call["status"]) => IN_PROGRESS.includes(s);

export const kindLabel: Record<Call["kind"], string> = { screening: "Screening", confirmation: "Confirmation", survey: "Survey", reminder: "Reminder" };

export function timeAgo(iso: string | null | undefined, now: number = Date.now()): string {
  if (!iso) return "";
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function fmtDuration(startIso: string | null, endIso: string | null): string | null {
  if (!startIso || !endIso) return null;
  const s = Math.round((new Date(endIso).getTime() - new Date(startIso).getTime()) / 1000);
  if (!Number.isFinite(s) || s <= 0) return null;
  return `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, "0")}s`;
}

export const hasAnswer = (v: { value: string | null } | null | undefined): boolean => !!v && v.value != null && v.value.trim() !== "";
