"use client";
import clsx from "clsx";
import { Check, ChevronDown, Pencil, Quote } from "lucide-react";
import { useState } from "react";
import type { FieldValue, FormField } from "@/lib/db/types";
import { Badge, Button, Card, EmptyState, inputCls } from "@/components/ui";
import { fmtMs, hasAnswer } from "./util";

export type FieldRow = { field: FormField; value: FieldValue | null };
type Save = (valueId: string, value: string, status: "confirmed" | "corrected") => void;

function group(rows: FieldRow[]): [string, FieldRow[]][] {
  const m = new Map<string, FieldRow[]>();
  for (const r of rows) m.set(r.field.section, [...(m.get(r.field.section) ?? []), r]);
  return [...m.entries()];
}

function ValueInput({ field, draft, setDraft, onEnter, onEsc }: { field: FormField; draft: string; setDraft: (s: string) => void; onEnter: () => void; onEsc: () => void }) {
  const kd = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") { e.preventDefault(); onEnter(); }
    if (e.key === "Escape") { e.preventDefault(); onEsc(); }
  };
  const label = `Corrected value for ${field.label}`;
  if ((field.type === "select" && field.options?.length) || field.type === "boolean") {
    const opts = field.type === "boolean" ? ["true", "false"] : field.options ?? [];
    return (
      <select autoFocus aria-label={label} className={inputCls} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={kd}>
        <option value="">(empty)</option>
        {opts.map((o) => <option key={o}>{o}</option>)}
      </select>
    );
  }
  return <input autoFocus aria-label={label} className={inputCls} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={kd} type={field.type === "date" ? "date" : "text"} />;
}

function Confidence({ c }: { c: number | null }) {
  if (c == null) return null;
  const tone = c >= 0.8 ? "bg-emerald-500" : c >= 0.5 ? "bg-amber-500" : "bg-red-500";
  return <span className="inline-flex items-center gap-1 text-[11px] text-slate-400" title="Model confidence"><span className={clsx("h-1.5 w-1.5 rounded-full", tone)} />{Math.round(c * 100)}%</span>;
}

function AnswerItem({ row, selected, busy, onSelect, onSave }: { row: FieldRow; selected: boolean; busy: boolean; onSelect: (r: FieldRow) => void; onSave: Save }) {
  const v = row.value!;
  const f = row.field;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(v.value ?? "");
  const save = () => {
    const val = draft.trim();
    setEditing(false);
    onSave(v.id, val, val === (v.value ?? "") ? "confirmed" : "corrected");
  };
  const cancel = () => { setDraft(v.value ?? ""); setEditing(false); };
  const hasEv = v.evidence_start_ms != null;
  return (
    <li
      onClick={() => onSelect(row)}
      className={clsx("cursor-pointer rounded-xl border bg-white p-3.5 transition", selected ? "border-amber-300 bg-amber-50/50 ring-1 ring-amber-300" : "border-slate-200 hover:border-violet-300",
        v.review_status !== "pending" && !selected && "bg-slate-50/60")}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-slate-500">{f.label}{f.unit ? ` (${f.unit})` : ""}</p>
          {editing ? (
            <div className="mt-1.5 flex flex-wrap items-center gap-2" onClick={(e) => e.stopPropagation()}>
              <div className="min-w-[10rem] flex-1"><ValueInput field={f} draft={draft} setDraft={setDraft} onEnter={save} onEsc={cancel} /></div>
              <Button size="sm" onClick={save} disabled={busy}>Save</Button>
              <Button size="sm" variant="ghost" onClick={cancel}>Cancel</Button>
              <p className="w-full text-[11px] text-slate-400">Enter to save, Esc to cancel</p>
            </div>
          ) : (
            <p className="mt-0.5 break-words text-base font-semibold text-slate-900">{v.value}</p>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {v.review_status === "confirmed" && <Badge tone="green"><Check className="h-3 w-3" />Confirmed</Badge>}
          {v.review_status === "corrected" && <Badge tone="violet"><Pencil className="h-3 w-3" />Corrected</Badge>}
          {v.review_status === "pending" && <Badge tone="amber" dot>Needs review</Badge>}
          <Confidence c={v.confidence} />
        </div>
      </div>

      {v.evidence_quote && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(row); }}
          className="mt-2.5 flex w-full items-start gap-2 rounded-lg bg-slate-100 px-2.5 py-1.5 text-left text-xs text-slate-700 transition hover:bg-violet-100"
          aria-label="Show this quote in the transcript"
        >
          <span className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full bg-violet-600 px-1.5 py-0.5 font-medium tabular-nums text-white"><Quote className="h-2.5 w-2.5 fill-current" />{hasEv ? fmtMs(v.evidence_start_ms) : "Find"}</span>
          <span className="line-clamp-2 italic">&ldquo;{v.evidence_quote}&rdquo;</span>
        </button>
      )}

      {!editing && (
        <div className="mt-2.5 flex gap-2" onClick={(e) => e.stopPropagation()}>
          {v.review_status !== "confirmed" && <Button size="sm" variant="success" disabled={busy} onClick={() => onSave(v.id, v.value ?? "", "confirmed")}><Check className="h-3 w-3" />Confirm</Button>}
          <Button size="sm" variant="secondary" disabled={busy} onClick={() => { setDraft(v.value ?? ""); setEditing(true); }}><Pencil className="h-3 w-3" />Correct</Button>
        </div>
      )}
    </li>
  );
}

export function EdcFieldList({ rows, loading, selectedFieldId, onSelect, onReview, onConfirmAll, busyId, confirmingAll }: {
  rows: FieldRow[];
  loading?: boolean;
  selectedFieldId: string | null;
  onSelect: (row: FieldRow) => void;
  onReview: Save;
  onConfirmAll: () => void;
  busyId: string | null;
  confirmingAll: boolean;
}) {
  const [showMissing, setShowMissing] = useState(false);
  const answered = rows.filter((r) => hasAnswer(r.value));
  const missing = rows.filter((r) => !hasAnswer(r.value));
  const done = answered.filter((r) => r.value!.review_status !== "pending").length;
  const pending = answered.length - done;
  const pct = answered.length ? Math.round((done / answered.length) * 100) : 0;

  if (!answered.length && !missing.length) {
    return <Card title="Answers"><EmptyState title={loading ? "Extracting answers..." : "No answers yet"} body="Answers appear here as soon as the transcript has been analysed." /></Card>;
  }

  return (
    <Card
      title="Answers captured"
      subtitle={answered.length ? "Click an answer to highlight where it was said in the transcript" : undefined}
      actions={pending > 0 ? <Button size="sm" variant="success" loading={confirmingAll} onClick={onConfirmAll}><Check className="h-3 w-3" />Confirm all ({pending})</Button> : undefined}
    >
      <div className="space-y-5">
        {answered.length > 0 && (
          <div>
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-slate-700">{done} of {answered.length} answers confirmed</span>
              <span className="tabular-nums text-slate-500">{pct}%</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-slate-100" role="progressbar" aria-valuenow={done} aria-valuemin={0} aria-valuemax={answered.length}>
              <div className={clsx("h-full rounded-full transition-all duration-500", pct === 100 ? "bg-emerald-500" : "bg-violet-600")} style={{ width: `${pct}%` }} />
            </div>
          </div>
        )}

        {answered.length === 0 && <p className="rounded-lg bg-slate-50 px-3 py-3 text-sm text-slate-600">No fields were answered in this call.</p>}

        {group(answered).map(([section, list]) => (
          <section key={section}>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{section}</h3>
            <ul className="space-y-2.5">
              {list.map((r) => (
                <AnswerItem key={`${r.value!.id}-${r.value!.value}-${r.value!.review_status}`} row={r} selected={selectedFieldId === r.field.id} busy={busyId === r.value!.id || confirmingAll} onSelect={onSelect} onSave={onReview} />
              ))}
            </ul>
          </section>
        ))}

        {missing.length > 0 && (
          <div className="rounded-xl border border-slate-200 bg-slate-50/60">
            <button type="button" aria-expanded={showMissing} onClick={() => setShowMissing((s) => !s)} className="flex w-full items-center justify-between gap-2 px-3.5 py-2.5 text-left text-sm font-medium text-slate-600 hover:text-slate-900">
              <span>{missing.length} field{missing.length === 1 ? "" : "s"} not captured in this call</span>
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">{showMissing ? "Hide" : "Show all"}<ChevronDown className={clsx("h-4 w-4 transition", showMissing && "rotate-180")} /></span>
            </button>
            {showMissing && (
              <div className="space-y-3 border-t border-slate-200 px-3.5 py-3">
                {group(missing).map(([section, list]) => (
                  <div key={section}>
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">{section}</p>
                    <ul className="flex flex-wrap gap-1.5">
                      {list.map((r) => <li key={r.field.id} className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-xs text-slate-500">{r.field.label}</li>)}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
