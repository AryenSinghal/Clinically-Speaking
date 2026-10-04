"use client";
import clsx from "clsx";
import { ChevronDown, RotateCcw, SlidersHorizontal } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { Badge, Button, inputCls } from "@/components/ui";
import { AGE_BOUNDS, type Filters, type Weights } from "@/lib/scoring";

function Range({ label, value, min, max, step = 1, unit, onChange }: {
  label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="min-w-0">
      <div className="mb-1 flex items-baseline justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-medium text-slate-600">{label}</label>
        <span className="font-semibold tabular-nums text-slate-900">{value}{unit}</span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="block h-5 w-full accent-violet-700" />
    </div>
  );
}

function AgeInput({ id, label, value, onCommit }: { id: string; label: string; value: number; onCommit: (v: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = () => {
    const n = Number(draft);
    if (!Number.isFinite(n) || draft.trim() === "") { setDraft(String(value)); return; }
    onCommit(Math.round(Math.min(AGE_BOUNDS.max, Math.max(AGE_BOUNDS.min, n))));
  };
  return (
    <input id={id} aria-label={label} inputMode="numeric" value={draft} onChange={(e) => setDraft(e.target.value.replace(/[^0-9]/g, ""))}
      onBlur={commit} onKeyDown={(e) => { if (e.key === "Enter") commit(); }} className={clsx(inputCls, "w-14 text-center tabular-nums")} />
  );
}

export function FilterBar({ filters, weights, shown, pool, changed, onFilters, onWeights, onReset }: {
  filters: Filters; weights: Weights; shown: number; pool: number; changed: boolean;
  onFilters: (f: Filters) => void; onWeights: (w: Weights) => void; onReset: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ageId = useId();
  const total = weights.condition + weights.geography + weights.demographics || 1;
  const pct = (n: number) => Math.round((n / total) * 100);
  const setAge = (k: "ageMin" | "ageMax", v: number) => {
    const next = { ...filters, [k]: v };
    if (next.ageMin > next.ageMax) { if (k === "ageMin") next.ageMax = v; else next.ageMin = v; }
    onFilters(next);
  };
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-end gap-x-6 gap-y-3 px-4 py-3">
        <div>
          <label htmlFor={ageId} className="mb-1 block text-xs font-medium text-slate-600">Age range</label>
          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <AgeInput id={ageId} label="Minimum age" value={filters.ageMin} onCommit={(v) => setAge("ageMin", v)} />
            <span aria-hidden>to</span>
            <AgeInput id={`${ageId}-max`} label="Maximum age" value={filters.ageMax} onCommit={(v) => setAge("ageMax", v)} />
          </div>
        </div>
        <div className="w-44 max-w-full flex-1 basis-40"><Range label="Max distance" value={filters.maxKm} min={5} max={200} step={5} unit=" km" onChange={(v) => onFilters({ ...filters, maxKm: v })} /></div>
        <div className="w-44 max-w-full flex-1 basis-40"><Range label="Min fit score" value={filters.minScore} min={0} max={100} step={5} onChange={(v) => onFilters({ ...filters, minScore: v })} /></div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Badge tone={shown === 0 ? "amber" : "violet"}><span aria-live="polite">{shown} of {pool} to screen shown</span></Badge>
          <Button variant="ghost" size="sm" onClick={onReset} disabled={!changed}><RotateCcw className="h-3.5 w-3.5" />Reset</Button>
          <Button variant="secondary" size="sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <SlidersHorizontal className="h-3.5 w-3.5" />Advanced: scoring weights
            <ChevronDown className={clsx("h-3.5 w-3.5 transition-transform", open && "rotate-180")} />
          </Button>
        </div>
      </div>
      {open && (
        <div className="border-t border-slate-100 bg-slate-50/60 px-4 py-3">
          <p className="mb-3 text-xs text-slate-500">Fit score blends three signals. Shift the weights to see how the ranking and map colors change; they are re-balanced to 100%.</p>
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-3">
            <Range label={`Condition match (${pct(weights.condition)}%)`} value={weights.condition} min={0} max={100} onChange={(v) => onWeights({ ...weights, condition: v })} />
            <Range label={`Geography (${pct(weights.geography)}%)`} value={weights.geography} min={0} max={100} onChange={(v) => onWeights({ ...weights, geography: v })} />
            <Range label={`Demographics (${pct(weights.demographics)}%)`} value={weights.demographics} min={0} max={100} onChange={(v) => onWeights({ ...weights, demographics: v })} />
          </div>
        </div>
      )}
    </div>
  );
}
