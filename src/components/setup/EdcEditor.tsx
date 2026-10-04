"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ChevronRight, Database, Plus, Search, Trash2 } from "lucide-react";
import clsx from "clsx";
import { Badge, Button, Card, EmptyState, inputCls } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import type { FormField } from "@/lib/db/types";
import { api, errText, plural } from "./api";
import { ErrorBanner, InlineDelete, Labeled, NumInput, SavedMark, Switch } from "./bits";

type Source = FormField["source"];
const TYPES: FormField["type"][] = ["text", "number", "integer", "boolean", "date", "select", "multiselect"];
const SOURCE_TONE = { ai_draft: "violet", researcher_edited: "amber", uploaded: "green" } as const;
const SOURCE_LABEL: Record<Source, string> = { ai_draft: "AI draft", researcher_edited: "Edited", uploaded: "Uploaded" };

export function EdcEditor({ studyId, fields, onFields }: { studyId: string; fields: FormField[]; onFields: (f: FormField[]) => void }) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [newSection, setNewSection] = useState("");
  const [query, setQuery] = useState("");
  const [sourceFilter, setSourceFilter] = useState<Source | "all">("all");
  const [closed, setClosed] = useState<Set<string>>(new Set());
  const [focusId, setFocusId] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const filtering = q !== "" || sourceFilter !== "all";
  const counts = useMemo(() => {
    const c: Record<Source, number> = { ai_draft: 0, researcher_edited: 0, uploaded: 0 };
    for (const f of fields) c[f.source]++;
    return c;
  }, [fields]);

  const sections = useMemo(() => {
    const m = new Map<string, FormField[]>();
    for (const f of [...fields].sort((a, b) => a.position - b.position)) m.set(f.section, [...(m.get(f.section) ?? []), f]);
    return [...m.entries()].map(([name, all]) => {
      const rows = all.filter((f) => (sourceFilter === "all" || f.source === sourceFilter)
        && (!q || `${f.label} ${f.key} ${f.section} ${f.type}`.toLowerCase().includes(q)));
      return { name, all, rows };
    });
  }, [fields, q, sourceFilter]);
  const visible = sections.filter((s) => (filtering ? s.rows.length > 0 : true));
  const matchCount = sections.reduce((n, s) => n + s.rows.length, 0);

  const replace = (row: FormField) => onFields(fields.map((f) => (f.id === row.id ? row : f)));

  async function patch(id: string, p: Partial<FormField>) {
    try {
      const r = await api<{ field: FormField }>("/api/setup/fields", { method: "PATCH", json: { id, patch: p } });
      replace(r.field); setError(null);
    } catch (e) { setError(errText(e)); throw e; }
  }
  async function remove(id: string) {
    try { await api("/api/setup/fields?id=" + id, { method: "DELETE" }); onFields(fields.filter((f) => f.id !== id)); setError(null); toast("Field deleted", "info"); }
    catch (e) { setError(errText(e)); }
  }
  async function add(section: string) {
    try {
      const r = await api<{ field: FormField }>("/api/setup/fields", { method: "POST", json: { studyId, field: { section, label: "New field", key: "new_field", type: "text" } } });
      onFields([...fields, r.field]); setError(null); setFocusId(r.field.id);
      setClosed((c) => { const n = new Set(c); n.delete(section); return n; });
      setQuery(""); setSourceFilter("all");
    } catch (e) { setError(errText(e)); }
  }
  const toggle = (name: string) => setClosed((c) => { const n = new Set(c); if (n.has(name)) n.delete(name); else n.add(name); return n; });

  if (fields.length === 0) {
    return (
      <div className="space-y-4">
        <ErrorBanner error={error} onClose={() => setError(null)} />
        <EmptyState icon={<Database className="h-5 w-5" />} title="No EDC fields yet"
          body="Regenerate drafts from the action bar, or start by adding your first section."
          action={<AddSection value={newSection} onChange={setNewSection} onAdd={(s) => void add(s)} />} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onClose={() => setError(null)} />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-52 flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input type="search" className={clsx(inputCls, "pl-8")} placeholder={`Search ${plural(fields.length, "field")} by label or key`} value={query}
            aria-label="Search fields" onChange={(e) => setQuery(e.target.value)} />
        </div>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by origin">
          {(["all", "ai_draft", "researcher_edited", "uploaded"] as const).map((s) => {
            const n = s === "all" ? fields.length : counts[s];
            if (s !== "all" && n === 0) return null;
            return (
              <button key={s} type="button" aria-pressed={sourceFilter === s} onClick={() => setSourceFilter(s)}
                className={clsx("rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-violet-600",
                  sourceFilter === s ? "border-violet-600 bg-violet-700 text-white" : "border-slate-300 bg-white text-slate-600 hover:bg-slate-50")}>
                {s === "all" ? "All" : SOURCE_LABEL[s]} <span className="opacity-70">{n}</span>
              </button>
            );
          })}
        </div>
        {!filtering && (
          <Button variant="ghost" size="sm" onClick={() => setClosed(closed.size ? new Set() : new Set(sections.map((s) => s.name)))}>
            {closed.size ? "Expand all" : "Collapse all"}
          </Button>
        )}
      </div>
      {filtering && <p className="text-xs text-slate-500">{plural(matchCount, "field")} match.{" "}
        <button type="button" className="font-medium text-violet-700 hover:underline" onClick={() => { setQuery(""); setSourceFilter("all"); }}>Clear filters</button></p>}

      {visible.length === 0 && <p className="rounded-xl border border-dashed border-slate-300 bg-white/60 p-6 text-center text-sm text-slate-500">No fields match your filters.</p>}

      {visible.map(({ name, all, rows }) => {
        const open = filtering || !closed.has(name);
        return (
          <section key={name} className="rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <header className="flex items-center gap-2 px-3 py-2.5">
              <button type="button" aria-expanded={open} onClick={() => toggle(name)} disabled={filtering}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1 text-left hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-violet-600">
                {open ? <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" /> : <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />}
                <h2 className="truncate text-sm font-semibold text-slate-900">{name}</h2>
                <Badge>{filtering ? `${rows.length} of ${all.length}` : all.length}</Badge>
              </button>
              <Button variant="ghost" size="sm" onClick={() => void add(name)} aria-label={`Add field to ${name}`}><Plus className="h-3.5 w-3.5" />Field</Button>
            </header>
            {open && (
              <div className="divide-y divide-slate-100 border-t border-slate-100">
                {rows.map((f) => <FieldRow key={f.id} field={f} autoOpen={focusId === f.id} onSave={(p) => patch(f.id, p)} onDelete={() => void remove(f.id)} />)}
              </div>
            )}
          </section>
        );
      })}

      <Card title="Add section" subtitle="Sections group related fields, for example Quality of Life">
        <AddSection value={newSection} onChange={setNewSection} onAdd={(s) => void add(s)} />
      </Card>
    </div>
  );
}

function AddSection({ value, onChange, onAdd }: { value: string; onChange: (v: string) => void; onAdd: (s: string) => void }) {
  const go = () => { if (value.trim()) { onAdd(value.trim()); onChange(""); } };
  return (
    <div className="flex w-full max-w-md gap-2">
      <input className={inputCls} placeholder="e.g. Quality of Life" value={value} aria-label="New section name" onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") go(); }} />
      <Button disabled={!value.trim()} onClick={go}><Plus className="h-4 w-4" />Add</Button>
    </div>
  );
}

function FieldRow({ field, autoOpen, onSave, onDelete }: { field: FormField; autoOpen: boolean; onSave: (p: Partial<FormField>) => Promise<void>; onDelete: () => void }) {
  const [open, setOpen] = useState(autoOpen);
  const [f, setF] = useState(field);
  const [savedAt, setSavedAt] = useState(0);
  const labelRef = useRef<HTMLInputElement>(null);
  useEffect(() => setF(field), [field]);
  useEffect(() => { if (autoOpen) { labelRef.current?.focus(); labelRef.current?.select(); } }, [autoOpen]);
  const isSelect = f.type === "select" || f.type === "multiselect";
  const isNum = f.type === "number" || f.type === "integer";
  const dirty = JSON.stringify(f) !== JSON.stringify(field);

  /** Persist the changed editable columns. */
  function commit(next: FormField = f) {
    if (JSON.stringify(next) === JSON.stringify(field)) return;
    onSave({ section: next.section, key: next.key, label: next.label, type: next.type, unit: next.unit, required: next.required, options: next.options, validation: next.validation })
      .then(() => setSavedAt(Date.now()), () => undefined);
  }
  const upd = (p: Partial<FormField>, now = false) => { const n = { ...f, ...p }; setF(n); if (now) commit(n); };
  const val = f.validation ?? {};
  const setVal = (p: Partial<NonNullable<FormField["validation"]>>) => {
    const v = { ...val, ...p };
    const empty = v.min == null && v.max == null && !v.regex && !v.note;
    upd({ validation: empty ? null : v });
  };
  const hasRules = !!(field.validation && (field.validation.min != null || field.validation.max != null || field.validation.regex || field.validation.note));

  return (
    <div className={clsx("px-3 py-2.5", open && "bg-slate-50/60")} onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) commit(); }}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="rounded p-1 text-slate-400 hover:text-slate-700 focus-visible:outline-2 focus-visible:outline-violet-600" aria-label={open ? "Hide details" : "Show details"}>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
        <div className="min-w-44 flex-1 basis-56">
          <input ref={labelRef} className="w-full rounded border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-medium text-slate-900 hover:border-slate-300 focus:border-violet-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-violet-200"
            value={f.label} onChange={(e) => upd({ label: e.target.value })} aria-label="Label" />
          <div className="px-1.5 font-mono text-[11px] leading-4 text-slate-500">{f.key}</div>
        </div>
        <select className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-700 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          value={f.type} onChange={(e) => upd({ type: e.target.value as FormField["type"] }, true)} aria-label="Type">
          {TYPES.map((t) => <option key={t}>{t}</option>)}
        </select>
        <input className="w-16 rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200"
          placeholder="unit" value={f.unit ?? ""} onChange={(e) => upd({ unit: e.target.value || null })} aria-label="Unit" />
        <label className="flex items-center gap-1.5 text-xs text-slate-600">
          <Switch checked={f.required} onChange={(v) => upd({ required: v }, true)} label={`Required: ${f.label}`} />
          <span className="hidden sm:inline">Required</span>
        </label>
        <Badge tone={SOURCE_TONE[field.source]}>{SOURCE_LABEL[field.source]}</Badge>
        {hasRules && <Badge tone="blue">Rules</Badge>}
        <SavedMark stamp={savedAt} />
        <InlineDelete label={`Delete ${field.label}`} onDelete={onDelete}><Trash2 className="h-4 w-4" /></InlineDelete>
      </div>
      {open && (
        <div className="mt-3 grid gap-3 pl-7 sm:grid-cols-2 lg:grid-cols-4">
          <Labeled label="Key (snake_case)"><input className={inputCls + " font-mono text-xs"} value={f.key} onChange={(e) => upd({ key: e.target.value })} /></Labeled>
          <Labeled label="Section"><input className={inputCls} value={f.section} onChange={(e) => upd({ section: e.target.value })} /></Labeled>
          {isSelect && (
            <Labeled label="Options (comma separated)" className="sm:col-span-2">
              <input className={inputCls} value={(f.options ?? []).join(", ")} onChange={(e) => upd({ options: e.target.value.split(",").map((s) => s.trimStart()) })}
                onBlur={() => upd({ options: (f.options ?? []).map((s) => s.trim()).filter(Boolean) })} />
            </Labeled>
          )}
          {isNum && (
            <>
              <Labeled label="Min"><NumInput value={val.min} onChange={(v) => setVal({ min: v })} /></Labeled>
              <Labeled label="Max"><NumInput value={val.max} onChange={(v) => setVal({ max: v })} /></Labeled>
            </>
          )}
          {(f.type === "text" || f.type === "date") && (
            <Labeled label="Regex"><input className={inputCls + " font-mono text-xs"} value={val.regex ?? ""} onChange={(e) => setVal({ regex: e.target.value || null })} /></Labeled>
          )}
          <Labeled label="Validation note" className="sm:col-span-2"><input className={inputCls} value={val.note ?? ""} onChange={(e) => setVal({ note: e.target.value || null })} /></Labeled>
          <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">
            {dirty ? <span className="text-amber-700">Unsaved changes save automatically when you leave this row.</span> : "Changes save automatically when you leave this row."}
          </p>
        </div>
      )}
    </div>
  );
}
