"use client";
import { useState } from "react";
import { ChevronDown, MapPin, Pencil } from "lucide-react";
import clsx from "clsx";
import { Badge, Button, Callout, Card, Stat, inputCls } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import type { Study } from "@/lib/db/types";
import type { SiteInfo, StudyDetails } from "@/lib/schemas";
import { api, errText } from "./api";
import { Chip, ErrorBanner, Labeled, ListEditor, NumInput } from "./bits";

const DEFAULT_SITE: SiteInfo = { name: "Primary Clinical Site", city: "Boston", state: "MA", lat: 42.3601, lng: -71.0589 };
const LIMIT = 5;

function ageRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return "Any";
  if (min != null && max != null) return `${min}–${max}`;
  return min != null ? `${min}+` : `up to ${max}`;
}

export function StudyDetailsCard({ study, visitCount, onStudy }: { study: Study; visitCount: number; onStudy: (s: Study) => void }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [d, setD] = useState<StudyDetails | null>(study.details);
  const [site, setSite] = useState<SiteInfo>(study.site ?? DEFAULT_SITE);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!study.details || !d) {
    return (
      <Callout tone="warn" title="No parsed study details yet">
        Use &quot;Re-parse protocol&quot; from the Regenerate menu to read the protocol again.
      </Callout>
    );
  }

  async function save() {
    if (!d) return;
    setSaving(true); setError(null);
    try {
      const r = await api<{ study: Study }>("/api/setup/study", { method: "PATCH", json: { studyId: study.id, details: d, site } });
      onStudy(r.study); setEditing(false); toast("Overview saved", "success");
    } catch (e) { setError(errText(e)); }
    finally { setSaving(false); }
  }
  const set = (p: Partial<StudyDetails>) => setD({ ...d, ...p });
  const setElig = (p: Partial<StudyDetails["eligibility"]>) => setD({ ...d, eligibility: { ...d.eligibility, ...p } });

  const actions = editing ? (
    <>
      <Button variant="secondary" size="sm" onClick={() => { setD(study.details); setSite(study.site ?? DEFAULT_SITE); setEditing(false); setError(null); }}>Cancel</Button>
      <Button size="sm" onClick={() => void save()} loading={saving}>Save</Button>
    </>
  ) : <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />Edit</Button>;

  if (!editing) {
    const e = study.details.eligibility;
    const v = study.details;
    const s = study.site ?? DEFAULT_SITE;
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Stat label="Age range" value={ageRange(e.age_min, e.age_max)} hint={e.sex === "any" ? "Any sex" : `${e.sex} only`} />
          <Stat label="Sample size" value={v.sample_size ?? "n/a"} hint="participants" />
          <Stat label="Duration" value={v.duration_days ?? "n/a"} hint={v.duration_days != null ? "days" : undefined} />
          <Stat label="Visits" value={visitCount} hint="on the timeline" />
        </div>

        <Card title="Study summary" actions={actions}>
          <ErrorBanner error={error} />
          <div className="flex flex-wrap gap-1.5">
            <Badge tone="violet">{v.condition}</Badge>
            {v.phase && <Badge>{v.phase}</Badge>}
            {v.sponsor && <Badge>{v.sponsor}</Badge>}
          </div>
          <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-700">{v.summary}</p>
        </Card>

        <div className="grid gap-4 md:grid-cols-2">
          <CriteriaCard title="Inclusion criteria" tone="green" items={e.inclusion} />
          <CriteriaCard title="Exclusion criteria" tone="red" items={e.exclusion} />
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Card title="Endpoints" subtitle={`${v.endpoints.length} listed`}>
            <ChipList items={v.endpoints} tone="violet" />
          </Card>
          <Card title="Assessments" subtitle={`${v.assessments.length} listed`}>
            <ChipList items={v.assessments} />
          </Card>
        </div>

        <Card title="Trial site and matching">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="flex gap-2 text-sm text-slate-700">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
              <div>
                <div className="font-medium text-slate-900">{s.name}</div>
                <div>{s.city}, {s.state} <span className="text-slate-400">({s.lat.toFixed(3)}, {s.lng.toFixed(3)})</span></div>
              </div>
            </div>
            <div>
              <div className="mb-1 text-xs font-medium text-slate-500">Matching keywords</div>
              <ChipList items={e.target_conditions} />
            </div>
          </div>
        </Card>

        {v.regulatory_notes.length > 0 && (
          <details className="group rounded-2xl border border-slate-200/80 bg-white">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-2xl px-5 py-3.5 text-sm font-semibold text-slate-900 focus-visible:outline-2 focus-visible:outline-violet-600">
              <span>Regulatory notes <span className="ml-1 text-xs font-normal text-slate-500">{v.regulatory_notes.length}</span></span>
              <ChevronDown className="h-4 w-4 text-slate-400 transition group-open:rotate-180" />
            </summary>
            <ul className="list-disc space-y-1 border-t border-slate-100 px-9 py-4 text-sm text-slate-700">
              {v.regulatory_notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </details>
        )}
      </div>
    );
  }

  return (
    <Card title="Edit study overview" actions={actions}>
      <ErrorBanner error={error} onClose={() => setError(null)} />
      <div className="grid gap-4 md:grid-cols-2">
        <Labeled label="Title" className="md:col-span-2"><input className={inputCls} value={d.title} onChange={(e) => set({ title: e.target.value })} /></Labeled>
        <Labeled label="Condition"><input className={inputCls} value={d.condition} onChange={(e) => set({ condition: e.target.value })} /></Labeled>
        <Labeled label="Phase"><input className={inputCls} value={d.phase ?? ""} onChange={(e) => set({ phase: e.target.value || null })} /></Labeled>
        <Labeled label="Sponsor"><input className={inputCls} value={d.sponsor ?? ""} onChange={(e) => set({ sponsor: e.target.value || null })} /></Labeled>
        <div className="grid grid-cols-2 gap-3">
          <Labeled label="Sample size"><NumInput value={d.sample_size} onChange={(v) => set({ sample_size: v })} /></Labeled>
          <Labeled label="Duration (days)"><NumInput value={d.duration_days} onChange={(v) => set({ duration_days: v })} /></Labeled>
        </div>
        <Labeled label="Summary" className="md:col-span-2"><textarea className={inputCls} rows={3} value={d.summary} onChange={(e) => set({ summary: e.target.value })} /></Labeled>
        <div className="grid grid-cols-3 gap-3 md:col-span-2">
          <Labeled label="Age min"><NumInput value={d.eligibility.age_min} onChange={(v) => setElig({ age_min: v })} /></Labeled>
          <Labeled label="Age max"><NumInput value={d.eligibility.age_max} onChange={(v) => setElig({ age_max: v })} /></Labeled>
          <Labeled label="Sex">
            <select className={inputCls} value={d.eligibility.sex} onChange={(e) => setElig({ sex: e.target.value as StudyDetails["eligibility"]["sex"] })}>
              <option value="any">any</option><option value="female">female</option><option value="male">male</option>
            </select>
          </Labeled>
        </div>
        <Labeled label="Inclusion criteria"><ListEditor items={d.eligibility.inclusion} onChange={(v) => setElig({ inclusion: v })} /></Labeled>
        <Labeled label="Exclusion criteria"><ListEditor items={d.eligibility.exclusion} onChange={(v) => setElig({ exclusion: v })} /></Labeled>
        <Labeled label="Matching keywords (lowercase conditions)"><ListEditor items={d.eligibility.target_conditions} onChange={(v) => setElig({ target_conditions: v.map((x) => x.toLowerCase()) })} /></Labeled>
        <Labeled label="Endpoints"><ListEditor items={d.endpoints} onChange={(v) => set({ endpoints: v })} /></Labeled>
        <Labeled label="Assessments"><ListEditor items={d.assessments} onChange={(v) => set({ assessments: v })} /></Labeled>
        <Labeled label="Regulatory notes"><ListEditor items={d.regulatory_notes} onChange={(v) => set({ regulatory_notes: v })} /></Labeled>
        <div className="grid grid-cols-2 gap-3 md:col-span-2 md:grid-cols-5">
          <Labeled label="Site name" className="col-span-2"><input className={inputCls} value={site.name} onChange={(e) => setSite({ ...site, name: e.target.value })} /></Labeled>
          <Labeled label="City"><input className={inputCls} value={site.city} onChange={(e) => setSite({ ...site, city: e.target.value })} /></Labeled>
          <Labeled label="State"><input className={inputCls} value={site.state} onChange={(e) => setSite({ ...site, state: e.target.value })} /></Labeled>
          <div className="grid grid-cols-2 gap-2">
            <Labeled label="Lat"><NumInput step="any" value={site.lat} onChange={(v) => setSite({ ...site, lat: v ?? 0 })} /></Labeled>
            <Labeled label="Lng"><NumInput step="any" value={site.lng} onChange={(v) => setSite({ ...site, lng: v ?? 0 })} /></Labeled>
          </div>
        </div>
      </div>
    </Card>
  );
}

function ChipList({ items, tone }: { items: string[]; tone?: "violet" }) {
  if (!items.length) return <p className="text-sm text-slate-400">None listed</p>;
  return <div className="flex flex-wrap gap-1.5">{items.map((x, i) => <Chip key={`${x}${i}`} tone={tone}>{x}</Chip>)}</div>;
}

function CriteriaCard({ title, tone, items }: { title: string; tone: "green" | "red"; items: string[] }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, LIMIT);
  return (
    <section className={clsx("rounded-2xl border bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", tone === "green" ? "border-emerald-200/80" : "border-red-200/80")}>
      <header className="flex items-center justify-between gap-2 px-5 py-3.5">
        <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
        <Badge tone={tone}>{items.length}</Badge>
      </header>
      <div className="border-t border-slate-100 px-5 py-4">
        {items.length === 0 ? <p className="text-sm text-slate-400">None listed</p> : (
          <ul className="space-y-2 text-sm text-slate-700">
            {shown.map((x, i) => (
              <li key={i} className="flex gap-2"><span aria-hidden className={clsx("mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full", tone === "green" ? "bg-emerald-500" : "bg-red-500")} /><span>{x}</span></li>
            ))}
          </ul>
        )}
        {items.length > LIMIT && (
          <button type="button" aria-expanded={all} onClick={() => setAll((a) => !a)} className="mt-3 text-xs font-medium text-violet-700 hover:underline">
            {all ? "Show fewer" : `Show all ${items.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
