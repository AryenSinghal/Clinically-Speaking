"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { browserDb } from "@/lib/db/client";
import type { ShellStatus } from "./types";

const key = (study: string | null) => `epro-shell-status:${study ?? "latest"}`;

function readCache(study: string | null): ShellStatus | null {
  try {
    const raw = sessionStorage.getItem(key(study));
    return raw ? (JSON.parse(raw) as ShellStatus) : null;
  } catch {
    return null;
  }
}

/**
 * Pipeline status for the study. Returns `null` until the first real value is known
 * (callers render skeletons), seeds from sessionStorage so navigation never flashes empty,
 * and refreshes on any `call` change (Realtime) plus a slow poll.
 */
export function useShellStatus(studyParam: string | null): ShellStatus | null {
  const [status, setStatus] = useState<ShellStatus | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Seed from cache after mount (keeps SSR/hydration markup identical).
  useEffect(() => {
    const cached = readCache(studyParam);
    if (cached) setStatus((s) => s ?? cached);
  }, [studyParam]);

  const load = useCallback(async () => {
    try {
      const qs = studyParam ? `?study=${encodeURIComponent(studyParam)}` : "";
      const res = await fetch(`/api/survey/status${qs}`, { cache: "no-store" });
      const json = (await res.json()) as { ok: boolean; status?: ShellStatus };
      if (json.ok && json.status) {
        setStatus(json.status);
        try { sessionStorage.setItem(key(studyParam), JSON.stringify(json.status)); } catch { /* ignore */ }
      }
    } catch {
      /* keep last status */
    }
  }, [studyParam]);

  useEffect(() => {
    void load();
    const poll = setInterval(() => void load(), 15000);
    let channel: ReturnType<ReturnType<typeof browserDb>["channel"]> | null = null;
    try {
      channel = browserDb()
        .channel(`shell-status-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "call" }, () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => void load(), 400);
        })
        .subscribe();
    } catch {
      /* realtime unavailable: polling still works */
    }
    return () => {
      clearInterval(poll);
      if (timer.current) clearTimeout(timer.current);
      try { if (channel) void browserDb().removeChannel(channel); } catch { /* ignore */ }
    };
  }, [load]);

  return status;
}
