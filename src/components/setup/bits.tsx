"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import clsx from "clsx";
import { AlertTriangle, Check, Plus, X } from "lucide-react";
import { Button, Callout, inputCls } from "@/components/ui";
import { describeError } from "./api";

export function Labeled({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <label className={className}>
      <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
      {children}
    </label>
  );
}

/** Friendly, actionable error callout (maps common Gemini/config failures to a fix). */
export function ErrorBanner({ error, onClose, actions }: { error: string | null; onClose?: () => void; actions?: ReactNode }) {
  if (!error) return null;
  const f = describeError(error);
  const showRaw = f.raw && f.raw !== f.title;
  return (
    <div role="alert" className="mb-3">
      <Callout
        tone="danger"
        icon={<AlertTriangle className="h-4 w-4" />}
        title={f.title}
        actions={<>
          {actions}
          {onClose && <button type="button" onClick={onClose} aria-label="Dismiss error" className="rounded p-1 text-red-700 hover:bg-red-100"><X className="h-4 w-4" /></button>}
        </>}
      >
        {f.hint && <p>{f.hint}</p>}
        {showRaw && <p className={clsx("break-words font-mono text-xs opacity-80", f.hint && "mt-1")}>{f.raw}</p>}
      </Callout>
    </div>
  );
}

/** Editable list of short strings, one per row. */
export function ListEditor({ items, onChange, placeholder }: { items: string[]; onChange: (v: string[]) => void; placeholder?: string }) {
  const [draft, setDraft] = useState("");
  const add = () => { const t = draft.trim(); if (t) { onChange([...items, t]); setDraft(""); } };
  return (
    <div className="space-y-1.5">
      {items.map((it, i) => (
        <div key={i} className="flex gap-1.5">
          <input className={inputCls} value={it} aria-label={`Item ${i + 1}`} onChange={(e) => onChange(items.map((x, j) => (j === i ? e.target.value : x)))} />
          <button type="button" className="rounded p-1 text-slate-400 hover:text-red-600" aria-label="Remove item" onClick={() => onChange(items.filter((_, j) => j !== i))}><X className="h-4 w-4" /></button>
        </div>
      ))}
      <div className="flex gap-1.5">
        <input className={inputCls} value={draft} placeholder={placeholder ?? "Add..."} aria-label="New item" onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }} />
        <button type="button" className="rounded p-1 text-violet-700 hover:text-violet-900" aria-label="Add item" onClick={add}><Plus className="h-4 w-4" /></button>
      </div>
    </div>
  );
}

/** Number input that yields null when empty. */
export function NumInput({ value, onChange, className, ...p }: { value: number | null | undefined; onChange: (v: number | null) => void; className?: string; placeholder?: string; step?: string; onBlur?: () => void }) {
  return (
    <input type="number" className={className ?? inputCls} value={value ?? ""} placeholder={p.placeholder} step={p.step} onBlur={p.onBlur}
      onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
  );
}

/** Accessible on/off switch. */
export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
      className={clsx("relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600",
        checked ? "bg-violet-700" : "bg-slate-300")}>
      <span className={clsx("inline-block h-4 w-4 rounded-full bg-white shadow transition", checked ? "translate-x-4.5" : "translate-x-0.5")} />
    </button>
  );
}

/** Small chip for lists of short phrases. */
export function Chip({ children, mono, tone = "slate" }: { children: ReactNode; mono?: boolean; tone?: "slate" | "violet" | "green" | "amber" | "red" }) {
  const tones = {
    slate: "border-slate-200 bg-slate-50 text-slate-700", violet: "border-violet-200 bg-violet-50 text-violet-800",
    green: "border-emerald-200 bg-emerald-50 text-emerald-800", amber: "border-amber-200 bg-amber-50 text-amber-900",
    red: "border-red-200 bg-red-50 text-red-800",
  } as const;
  return <span className={clsx("inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-0.5 text-xs", mono && "font-mono", tones[tone])}>{children}</span>;
}

/** Inline "Saved" confirmation that fades; render with a changing `stamp` to retrigger. */
export function SavedMark({ stamp }: { stamp: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    if (!stamp) return;
    const show = setTimeout(() => setVisible(true), 0);
    const hide = setTimeout(() => setVisible(false), 1800);
    return () => { clearTimeout(show); clearTimeout(hide); };
  }, [stamp]);
  return (
    <span aria-live="polite" className={clsx("inline-flex w-14 items-center gap-0.5 text-xs font-medium text-emerald-600 transition-opacity duration-300", visible ? "opacity-100" : "opacity-0")}>
      <Check className="h-3.5 w-3.5" />{visible ? "Saved" : ""}
    </span>
  );
}

/** Modal confirmation. Escape and backdrop click cancel; focus lands on Cancel. */
export function ConfirmDialog({ open, title, children, confirmLabel, tone = "primary", loading, onConfirm, onCancel }: {
  open: boolean; title: string; children: ReactNode; confirmLabel: string; tone?: "primary" | "danger"; loading?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const cancelRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!open) return;
    cancelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onCancel(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onCancel]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h2 className="text-base font-semibold text-slate-900">{title}</h2>
        <div className="mt-2 space-y-2 text-sm text-slate-600">{children}</div>
        <div className="mt-5 flex justify-end gap-2">
          <button ref={cancelRef} type="button" onClick={onCancel} className="rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600">Cancel</button>
          <Button variant={tone === "danger" ? "danger" : "primary"} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </div>
  );
}

/** Two-step inline delete: first click asks, second confirms. */
export function InlineDelete({ onDelete, label, children }: { onDelete: () => void; label: string; children: ReactNode }) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!asking) return;
    const t = setTimeout(() => setAsking(false), 4000);
    return () => clearTimeout(t);
  }, [asking]);
  if (asking) {
    return (
      <span className="inline-flex items-center gap-1">
        <button type="button" onClick={() => { setAsking(false); onDelete(); }} className="rounded-md bg-red-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-red-700">Delete?</button>
        <button type="button" onClick={() => setAsking(false)} aria-label="Cancel delete" className="rounded p-0.5 text-slate-400 hover:text-slate-700"><X className="h-3.5 w-3.5" /></button>
      </span>
    );
  }
  return <button type="button" onClick={() => setAsking(true)} aria-label={label} className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600">{children}</button>;
}
