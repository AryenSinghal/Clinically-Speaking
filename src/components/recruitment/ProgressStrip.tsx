"use client";
import clsx from "clsx";
import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { STAGES, type Stage } from "./types";

/** Five-step guided progress with the single next action for the coordinator. */
export function ProgressStrip({ stage, headline, detail, action, busy }: {
  stage: Stage; headline: ReactNode; detail?: ReactNode; action?: ReactNode; busy?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <ol className="flex items-center gap-1 overflow-x-auto pb-1" aria-label="Recruitment progress">
        {STAGES.map((label, i) => {
          const n = (i + 1) as Stage;
          const done = n < stage, current = n === stage;
          return (
            <li key={label} className="flex min-w-0 flex-1 items-center gap-1.5" aria-current={current ? "step" : undefined}>
              <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                done && "bg-emerald-600 text-white", current && "bg-violet-700 text-white ring-4 ring-violet-200", !done && !current && "bg-slate-200 text-slate-600",
                current && busy && "animate-pulse")}>
                {done ? <Check className="h-3.5 w-3.5" /> : n}
              </span>
              <span className={clsx("hidden truncate text-xs font-medium sm:block", current ? "text-violet-900" : done ? "text-slate-700" : "text-slate-500")}>{label}</span>
              {n < 5 && <span aria-hidden className={clsx("mx-1 h-0.5 min-w-3 flex-1 rounded", done ? "bg-emerald-500" : "bg-slate-200")} />}
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-violet-700">Step {stage} of 5 · {STAGES[stage - 1]}</div>
          <div className="text-base font-semibold text-slate-900" aria-live="polite">{headline}</div>
          {detail && <div className="mt-0.5 text-sm text-slate-600">{detail}</div>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
    </div>
  );
}
