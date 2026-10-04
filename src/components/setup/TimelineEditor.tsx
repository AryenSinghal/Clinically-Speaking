"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { CalendarClock, Phone, Plus, Stethoscope, Trash2, Bell } from "lucide-react";
import clsx from "clsx";
import { Badge, Button, Card, EmptyState, inputCls } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import type { Questionnaire, Visit } from "@/lib/db/types";
import { api, errText } from "./api";
import { ErrorBanner, InlineDelete, Labeled } from "./bits";
import { REMINDER_LEAD_DAYS } from "@/lib/survey";

const dayLabel = (d: number) => `Day ${d}`;

export function TimelineEditor({ studyId, visits, questionnaires, onVisits }: {
  studyId: string; visits: Visit[]; questionnaires: Questionnaire[]; onVisits: (v: Visit[]) => void;
}) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const prevIds = useRef(new Set(visits.map((v) => v.id)));

  // select a newly created visit so its form opens
  useEffect(() => {
    const added = visits.find((v) => !prevIds.current.has(v.id));
    prevIds.current = new Set(visits.map((v) => v.id));
    if (added) setSelected(added.id);
  }, [visits]);
  const current = visits.find((v) => v.id === selected) ?? null;

  async function call(url: string, init: RequestInit & { json?: unknown }): Promise<boolean> {
    try { const r = await api<{ visits: Visit[] }>(url, init); onVisits(r.visits); setError(null); return true; }
    catch (e) { setError(errText(e)); return false; }
  }
  const patch = async (id: string, p: Partial<Visit>) => { if (await call("/api/setup/visits", { method: "PATCH", json: { id, patch: p } })) toast("Visit saved", "success"); };
  const remove = async (id: string) => { if (await call(`/api/setup/visits?id=${id}`, { method: "DELETE" })) { if (selected === id) setSelected(null); toast("Visit deleted", "info"); } };
  const add = (type: Visit["type"]) => {
    const last = visits.reduce((m, v) => Math.max(m, v.day_offset), 0);
    return call("/api/setup/visits", { method: "POST", json: { studyId, visit: { name: type === "clinic" ? "New clinic visit" : "New survey call", type, day_offset: last + 7, window_days: type === "clinic" ? 3 : 1 } } });
  };

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <Card title="Study timeline" subtitle="Select a visit to edit it below"
        actions={<>
          <Button variant="secondary" size="sm" onClick={() => void add("clinic")}><Plus className="h-3.5 w-3.5" />Clinic visit</Button>
          <Button variant="secondary" size="sm" onClick={() => void add("survey_call")}><Plus className="h-3.5 w-3.5" />Survey call</Button>
        </>}>
        {visits.length === 0
          ? <EmptyState icon={<CalendarClock className="h-5 w-5" />} title="No visits yet" body="Regenerate drafts, or add a clinic visit or survey call." />
          : <Chart visits={visits} selected={selected} onSelect={(id) => { setSelected(id); setTimeout(() => editorRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50); }} />}
      </Card>

      <div ref={editorRef}>
        {current ? (
          <Card title={<span className="flex items-center gap-2">Edit visit <Badge tone={current.type === "clinic" ? "violet" : "green"}>{current.type === "clinic" ? "Clinic visit" : "Survey call"}</Badge></span>}
            actions={<InlineDelete label={`Delete ${current.name}`} onDelete={() => void remove(current.id)}><Trash2 className="h-4 w-4" /></InlineDelete>}>
            <VisitForm key={current.id} visit={current} questionnaires={questionnaires} onSave={(p) => void patch(current.id, p)} />
          </Card>
        ) : visits.length > 0 && (
          <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-4 text-center text-sm text-slate-500">Click a visit on the timeline to edit its name, day, window or questionnaire.</p>
        )}
      </div>
    </div>
  );
}

function Chart({ visits, selected, onSelect }: { visits: Visit[]; selected: string | null; onSelect: (id: string) => void }) {
  const sorted = useMemo(() => [...visits].sort((a, b) => a.day_offset - b.day_offset || a.position - b.position), [visits]);
  const { min, max, ticks } = useMemo(() => {
    const lo = Math.min(0, ...visits.map((v) => v.day_offset - v.window_days));
    const hi = Math.max(7, ...visits.map((v) => v.day_offset + v.window_days));
    const pad = Math.max(1, Math.round((hi - lo) * 0.03));
    const a = lo - pad, b = hi + pad, span = b - a;
    const step = span <= 30 ? 7 : span <= 70 ? 14 : span <= 140 ? 30 : span <= 400 ? 60 : 90;
    const t = new Set<number>([0]);
    for (let d = Math.ceil(a / step) * step; d <= b; d += step) t.add(d);
    return { min: a, max: b, ticks: [...t].sort((x, y) => x - y) };
  }, [visits]);
  const pct = (d: number) => ((d - min) / (max - min)) * 100;

  const pre = sorted.filter((v) => v.day_offset < 0);
  const main = sorted.filter((v) => v.day_offset >= 0);
  const groups = [
    ...(pre.length ? [{ label: "Pre-enrollment", note: "Before Day 0", rows: pre }] : []),
    { label: pre.length ? "Study period" : "Visits", note: "From Day 0", rows: main },
  ].filter((g) => g.rows.length > 0);

  return (
    <div>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600" aria-label="Legend">
        <span className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-sm bg-violet-700 text-white"><Stethoscope className="h-2.5 w-2.5" /></span>Clinic visit</span>
        <span className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-emerald-500 text-white"><Phone className="h-2.5 w-2.5" /></span>Survey call</span>
        <span className="flex items-center gap-1.5"><span className="flex h-4 w-4 items-center justify-center rounded-full bg-sky-500 text-white"><Bell className="h-2.5 w-2.5" /></span>Reminder call (automatic, {REMINDER_LEAD_DAYS} day before each clinic visit)</span>
        <span className="flex items-center gap-1.5"><span className="inline-block h-2 w-5 rounded bg-slate-300" />Allowed window (+/- days)</span>
      </div>

      <div className="overflow-x-auto">
        <div className="min-w-[34rem]">
          {/* axis */}
          <div className="grid grid-cols-[9rem_1fr] sm:grid-cols-[12rem_1fr]">
            <div />
            <div className="relative mx-3 h-7 border-b border-slate-300" aria-hidden>
              {ticks.map((t) => (
                <span key={t} className="absolute bottom-0 -translate-x-1/2" style={{ left: `${pct(t)}%` }}>
                  <span className={clsx("block text-center text-[10px] tabular-nums", t === 0 ? "font-semibold text-violet-700" : "text-slate-500")}>{t === 0 ? "Day 0" : t}</span>
                  <span className={clsx("mx-auto block w-px", t === 0 ? "h-2 bg-violet-600" : "h-1.5 bg-slate-300")} />
                </span>
              ))}
            </div>
          </div>

          {groups.map((g) => (
            <div key={g.label} className="mt-1">
              <div className="flex items-center gap-2 px-1 pb-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                {g.label}<span className="font-normal normal-case tracking-normal text-slate-400">{g.note}</span>
              </div>
              {g.rows.map((v) => {
                const active = selected === v.id;
                const clinic = v.type === "clinic";
                const w = (v.window_days * 2 / (max - min)) * 100;
                return (
                  <button key={v.id} type="button" onClick={() => onSelect(v.id)} aria-pressed={active}
                    aria-label={`${v.name}, ${dayLabel(v.day_offset)}, window plus or minus ${v.window_days} days`}
                    className={clsx("grid w-full grid-cols-[9rem_1fr] items-center rounded-lg text-left transition focus-visible:outline-2 focus-visible:outline-violet-600 sm:grid-cols-[12rem_1fr]",
                      active ? "bg-violet-50 ring-1 ring-violet-300" : "hover:bg-slate-50")}>
                    <div className="min-w-0 px-2 py-1.5">
                      <div className="truncate text-sm font-medium text-slate-900">{v.name}</div>
                      <div className="text-[11px] tabular-nums text-slate-500">{dayLabel(v.day_offset)}{v.window_days > 0 && ` · +/-${v.window_days}d`}</div>
                    </div>
                    <div className="relative mx-3 h-9">
                      {ticks.map((t) => <span key={t} aria-hidden className={clsx("absolute inset-y-0 w-px", t === 0 ? "bg-violet-300" : "bg-slate-100")} style={{ left: `${pct(t)}%` }} />)}
                      {v.window_days > 0 && (
                        <span aria-hidden className={clsx("absolute top-1/2 h-2.5 -translate-y-1/2 rounded", clinic ? "bg-violet-200" : "bg-emerald-200")}
                          style={{ left: `${pct(v.day_offset - v.window_days)}%`, width: `${w}%` }} />
                      )}
                      {clinic && v.day_offset >= REMINDER_LEAD_DAYS && (
                        <span aria-hidden title={`Reminder call, day ${v.day_offset - REMINDER_LEAD_DAYS}`} className="absolute top-1/2 flex h-4 w-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-sky-500 text-white shadow-sm"
                          style={{ left: `calc(${pct(v.day_offset - REMINDER_LEAD_DAYS)}% - 15px)` }}><Bell className="h-2.5 w-2.5" /></span>
                      )}
                      <span aria-hidden className={clsx("absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center text-white shadow-sm transition",
                        clinic ? "rounded-sm bg-violet-700" : "rounded-full bg-emerald-500", active && "scale-125 ring-2 ring-white ring-offset-1 ring-offset-violet-400")}
                        style={{ left: `${pct(v.day_offset)}%` }}>
                        {clinic ? <Stethoscope className="h-3 w-3" /> : <Phone className="h-3 w-3" />}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function VisitForm({ visit, questionnaires, onSave }: { visit: Visit; questionnaires: Questionnaire[]; onSave: (p: Partial<Visit>) => void }) {
  const [v, setV] = useState(visit);
  const [prev, setPrev] = useState(visit);
  if (prev !== visit) { setPrev(visit); setV(visit); }
  const commit = (n: Visit = v) => {
    if (n.name === visit.name && n.type === visit.type && n.day_offset === visit.day_offset && n.window_days === visit.window_days && n.questionnaire_id === visit.questionnaire_id && n.notes === visit.notes) return;
    onSave({ name: n.name.trim() || "Visit", type: n.type, day_offset: n.day_offset, window_days: n.window_days, questionnaire_id: n.questionnaire_id, notes: n.notes });
  };
  const upd = (p: Partial<Visit>, now = false) => { const n = { ...v, ...p }; setV(n); if (now) commit(n); };
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(); }}>
      <Labeled label="Name" className="lg:col-span-2"><input className={inputCls} value={v.name} onChange={(e) => upd({ name: e.target.value })} /></Labeled>
      <Labeled label="Type" className="lg:col-span-2">
        <select className={inputCls} value={v.type} onChange={(e) => upd({ type: e.target.value as Visit["type"] }, true)}>
          <option value="clinic">Clinic visit</option><option value="survey_call">Survey call</option>
        </select>
      </Labeled>
      <Labeled label="Day (negative = before enrollment)"><input type="number" className={inputCls} value={v.day_offset} onChange={(e) => upd({ day_offset: Math.round(Number(e.target.value) || 0) })} /></Labeled>
      <Labeled label="Window +/- days"><input type="number" min={0} className={inputCls} value={v.window_days} onChange={(e) => upd({ window_days: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></Labeled>
      <Labeled label="Questionnaire" className="lg:col-span-3">
        <select className={inputCls} disabled={v.type === "clinic"} value={v.questionnaire_id ?? ""} onChange={(e) => upd({ questionnaire_id: e.target.value || null }, true)}>
          <option value="">{v.type === "clinic" ? "Not used for clinic visits" : "None"}</option>
          {questionnaires.map((q) => <option key={q.id} value={q.id}>{q.title}</option>)}
        </select>
      </Labeled>
      <Labeled label="Notes" className="lg:col-span-3"><input className={inputCls} value={v.notes ?? ""} onChange={(e) => upd({ notes: e.target.value || null })} /></Labeled>
      <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-6">Changes save automatically when you leave a field.</p>
    </div>
  );
}
