"use client";
import { useCallback, useEffect, useState } from "react";
import { Check, Circle, Loader2, X } from "lucide-react";
import clsx from "clsx";
import { STEP_HINTS, STEP_LABELS, type StepKey, type StepState } from "./api";

export const INITIAL_STEPS: Record<StepKey, StepState> = { parse: "pending", edc: "pending", timeline: "pending", questionnaires: "pending" };
type StepTimes = Partial<Record<StepKey, { start: number; end?: number }>>;

/** Ticks while `active`, so elapsed timers re-render. */
export function useNow(active: boolean, ms = 500): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(id);
  }, [active, ms]);
  return now;
}

/** Step state plus per-step timing for the Stepper. */
export function useStepper() {
  const [steps, setSteps] = useState<Record<StepKey, StepState>>(INITIAL_STEPS);
  const [times, setTimes] = useState<StepTimes>({});
  const [startedAt, setStartedAt] = useState<number | null>(null);

  const setStep = useCallback((k: StepKey, s: StepState) => {
    const now = Date.now();
    setSteps((p) => ({ ...p, [k]: s }));
    setTimes((p) => {
      const start = p[k]?.start ?? now;
      if (s === "active") return { ...p, [k]: { start } };
      if (s === "done" || s === "error") return { ...p, [k]: { start, end: now } };
      return p;
    });
  }, []);
  const reset = useCallback((init: Record<StepKey, StepState>) => {
    const now = Date.now();
    setSteps(init); setStartedAt(now);
    setTimes(Object.fromEntries((Object.keys(init) as StepKey[]).filter((k) => init[k] === "active").map((k) => [k, { start: now }])));
  }, []);
  return { steps, times, startedAt, setStep, reset };
}

function fmt(ms: number) { return `${(Math.max(0, ms) / 1000).toFixed(1)}s`; }

/** Vertical stepper: icon, label, hint and elapsed time per step. */
export function Stepper({ steps, times, startedAt, only }: { steps: Record<StepKey, StepState>; times: StepTimes; startedAt: number | null; only?: StepKey[] }) {
  const keys = only ?? (Object.keys(STEP_LABELS) as StepKey[]);
  const running = keys.some((k) => steps[k] === "active");
  const now = useNow(running);
  return (
    <div>
      <ol className="relative">
        {keys.map((k, i) => {
          const s = steps[k];
          const t = times[k];
          const last = i === keys.length - 1;
          return (
            <li key={k} className="relative flex gap-3 pb-5 last:pb-0" aria-current={s === "active" ? "step" : undefined}>
              {!last && <span aria-hidden className={clsx("absolute left-[13px] top-7 h-[calc(100%-1.75rem)] w-px", s === "done" ? "bg-emerald-300" : "bg-slate-200")} />}
              <span className={clsx("relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs transition",
                s === "done" && "border-emerald-500 bg-emerald-500 text-white", s === "active" && "border-violet-600 bg-violet-50 text-violet-700",
                s === "error" && "border-red-500 bg-red-500 text-white", s === "pending" && "border-slate-300 bg-white text-slate-300")}>
                {s === "done" ? <Check className="h-4 w-4" /> : s === "active" ? <Loader2 className="h-4 w-4 animate-spin" /> : s === "error" ? <X className="h-4 w-4" /> : <Circle className="h-2.5 w-2.5" />}
              </span>
              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={clsx("text-sm", s === "pending" ? "text-slate-400" : s === "error" ? "font-medium text-red-700" : s === "active" ? "font-semibold text-slate-900" : "font-medium text-slate-800")}>{STEP_LABELS[k]}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-slate-500">
                    {t ? fmt((t.end ?? now) - t.start) : s === "done" ? "done" : ""}
                  </span>
                </div>
                <p className={clsx("text-xs", s === "pending" ? "text-slate-300" : "text-slate-500")}>{STEP_HINTS[k]}</p>
              </div>
            </li>
          );
        })}
      </ol>
      {startedAt != null && running && (
        <p className="mt-4 border-t border-slate-100 pt-3 text-right font-mono text-xs tabular-nums text-slate-500">Elapsed {fmt(now - startedAt)}</p>
      )}
    </div>
  );
}
