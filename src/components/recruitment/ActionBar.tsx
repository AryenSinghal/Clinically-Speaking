"use client";
import { Phone, X } from "lucide-react";
import { Button, Spinner } from "@/components/ui";

export type Batch = { total: number; started: number; current: string | null };

/** Sticky bottom bar: start screening for the selection, or show sequential call progress. */
export function ActionBar({ count, batch, working, onCall, onClear, onCancelQueue }: {
  count: number; batch: Batch | null; working: boolean; onCall: () => void; onClear: () => void; onCancelQueue: () => void;
}) {
  if (!batch && count === 0) return null;
  return (
    <div className="sticky bottom-4 z-40 mt-4">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-x-4 gap-y-2 rounded-2xl border border-violet-200 bg-white/95 p-3 pl-4 shadow-xl backdrop-blur" role="region" aria-label="Selection actions">
        {batch ? (
          <>
            <Spinner />
            <div className="min-w-0 flex-1 basis-60">
              <div className="text-sm font-semibold text-slate-900">Calling {Math.min(Math.max(batch.started, 1), batch.total)} of {batch.total}{batch.current ? ` · ${batch.current}` : ""}</div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuemin={0} aria-valuemax={batch.total} aria-valuenow={batch.started}>
                <div className="h-full rounded-full bg-violet-600 transition-all" style={{ width: `${(Math.max(batch.started - 0.5, 0) / batch.total) * 100}%` }} />
              </div>
              <p className="mt-1 text-xs text-slate-500">Calls ring the demo phone one at a time. The next call starts when this one finishes.</p>
            </div>
            {batch.started < batch.total && <Button variant="ghost" size="sm" onClick={onCancelQueue}>Cancel remaining</Button>}
          </>
        ) : (
          <>
            <div className="min-w-0 flex-1 basis-60">
              <div className="text-sm font-semibold text-slate-900">{count} selected</div>
              <p className="text-xs text-slate-500">Calls go to the demo phone one at a time, so only one rings at once. Answer each in turn.</p>
            </div>
            <Button variant="ghost" size="sm" onClick={onClear}><X className="h-3.5 w-3.5" />Clear</Button>
            <Button size="lg" loading={working} onClick={onCall}><Phone className="h-4 w-4" />Call for screening</Button>
          </>
        )}
      </div>
    </div>
  );
}
