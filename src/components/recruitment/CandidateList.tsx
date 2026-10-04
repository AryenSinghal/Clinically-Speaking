"use client";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Clock, ExternalLink, MapPin, Phone, RotateCcw, SearchX, UserCheck, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Badge, Button, EmptyState, Skeleton, Spinner, flagLabel, flagMeta } from "@/components/ui";
import type { Call } from "@/lib/db/types";
import { scoreColor } from "@/lib/scoring";
import { TABS, callStatusLabel, canSelect, isActive, tabOf, type CallsByCandidate, type Row, type TabKey } from "./types";

type Handlers = {
  onToggle: (id: string) => void;
  onAccept: (id: string) => void;
  onConfirmCall: (id: string) => void;
  onRetryScreening: (id: string) => void;
};

const linkBtn = "inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600";

function FitBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2" title={`Fit score ${score.toFixed(0)} of 100`}>
      <div className="h-2 w-24 overflow-hidden rounded-full bg-slate-100 sm:w-28"><div className="h-full rounded-full" style={{ width: `${score}%`, background: scoreColor(score) }} /></div>
      <span className="w-6 text-sm font-semibold tabular-nums text-slate-800">{score.toFixed(0)}</span>
    </div>
  );
}

function Outcome({ call, label }: { call: Call; label: string }) {
  const meta = call.flag ? flagMeta[call.flag] : null;
  const text = call.flag_reason || call.summary;
  return (
    <div className="mt-2.5 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-slate-500">{label}</span>
        {meta ? <Badge tone={meta.tone} dot>{flagLabel(call.flag!, call.kind)}</Badge> : <Badge>Awaiting analysis</Badge>}
        <Link href={`/review/${call.id}`} className="ml-auto inline-flex items-center gap-1 text-xs font-medium text-violet-800 hover:underline">Review call<ExternalLink className="h-3 w-3" /></Link>
      </div>
      {text && <p className="mt-1 line-clamp-2 text-sm text-slate-700">{text}</p>}
    </div>
  );
}

function FailedNote({ call, label }: { call: Call; label: string }) {
  return (
    <div className="mt-2.5 flex flex-wrap items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
      <AlertTriangle className="h-4 w-4 shrink-0" />
      <span>{label} did not connect or finished early.{call.flag_reason ? ` ${call.flag_reason}` : ""}</span>
      <Link href={`/review/${call.id}`} className="ml-auto text-xs font-medium underline">Details</Link>
    </div>
  );
}

function CandidateRow({ row, calls, selected, busy, queued, h }: {
  row: Row; calls: CallsByCandidate[string] | undefined; selected: boolean; busy: boolean; queued: boolean; h: Handlers;
}) {
  const { c, r } = row;
  const scr = calls?.screening, conf = calls?.confirmation;
  const tab = tabOf(c, calls, queued);
  let action: ReactNode = null;
  let note: ReactNode = null;

  if (tab === "toScreen") {
    if (scr?.status === "failed") {
      note = <FailedNote call={scr} label="Screening call" />;
      action = <Button size="sm" variant="secondary" disabled={busy} onClick={() => h.onRetryScreening(c.id)}><RotateCcw className="h-3.5 w-3.5" />Retry call</Button>;
    } else if (canSelect(c, calls)) {
      action = <Button size="sm" variant={selected ? "primary" : "secondary"} aria-pressed={selected} onClick={() => h.onToggle(c.id)}>{selected ? <><CheckCircle2 className="h-3.5 w-3.5" />Selected</> : "Select"}</Button>;
    }
  } else if (tab === "progress") {
    const active = isActive(conf) && conf ? conf : isActive(scr) ? scr : undefined;
    action = <Button size="sm" variant="secondary" disabled><Spinner className="h-3.5 w-3.5" />{active ? "Calling…" : "Queued"}</Button>;
    note = (
      <p className="mt-2 flex items-center gap-1.5 text-sm text-violet-900">
        <Phone className="h-3.5 w-3.5" />
        {active ? <>{conf && isActive(conf) ? "Confirmation call" : "Screening call"}: {callStatusLabel(active)}</> : "Waiting for the previous call to finish"}
        {active && <Link href={`/review/${active.id}`} className="ml-2 text-xs font-medium text-violet-800 hover:underline">Watch live</Link>}
      </p>
    );
  } else if (tab === "results") {
    if (scr) note = scr.status === "failed" ? <FailedNote call={scr} label="Screening call" /> : <Outcome call={scr} label="Screening" />;
    if (c.status === "good") action = <Button size="sm" variant="success" disabled={busy} loading={busy} onClick={() => h.onAccept(c.id)}>Accept</Button>;
    else action = scr ? <Link href={`/review/${scr.id}`} className={linkBtn}>View result</Link> : null;
  } else {
    if (conf?.status === "failed") {
      note = <FailedNote call={conf} label="Confirmation call" />;
      action = <Button size="sm" variant="secondary" disabled={busy} onClick={() => h.onConfirmCall(c.id)}><RotateCcw className="h-3.5 w-3.5" />Retry call</Button>;
    } else if (c.status === "enrolled") {
      action = <Badge tone="violet" dot>Enrolled</Badge>;
      if (conf) note = <Outcome call={conf} label="Confirmation" />;
    } else {
      action = <Button size="sm" disabled={busy} loading={busy} onClick={() => h.onConfirmCall(c.id)}><Phone className="h-3.5 w-3.5" />{conf ? "Call again to confirm" : "Call to confirm"}</Button>;
      if (conf) note = <Outcome call={conf} label="Confirmation" />;
      else if (scr) note = <Outcome call={scr} label="Screening" />;
    }
  }

  return (
    <li className={clsx("rounded-xl border bg-white p-3.5 transition", selected ? "border-violet-400 ring-2 ring-violet-200" : "border-slate-200 hover:border-slate-300")}>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1 basis-56">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{c.name}</span>
            {(!r.eligibleAge || !r.eligibleSex) && <Badge tone="red">{!r.eligibleAge ? "Outside age window" : "Sex mismatch"}</Badge>}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{c.age} y · {c.sex}</span>
            <span className="inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{[c.city, c.state].filter(Boolean).join(", ") || "Unknown"}</span>
            <span className="tabular-nums">{r.distanceKm.toFixed(0)} km from site</span>
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {c.conditions.length === 0 && <span className="text-xs text-slate-400">No listed conditions</span>}
            {c.conditions.map((x) => <Badge key={x} tone={r.matched.some((m) => x.toLowerCase().includes(m.toLowerCase()) || m.toLowerCase().includes(x.toLowerCase())) ? "violet" : "gray"}>{x}</Badge>)}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-4 sm:flex-col sm:items-end sm:gap-2">
          <FitBar score={r.score} />
          {action}
        </div>
      </div>
      {note}
    </li>
  );
}

const EMPTY: Record<TabKey, { title: string; body: string; icon: ReactNode }> = {
  toScreen: { title: "Everyone has been screened", body: "No one is waiting for a screening call. Loosen the filters to surface more of the registry.", icon: <Users className="h-5 w-5" /> },
  progress: { title: "No calls in progress", body: "Select people in the To screen tab and start screening calls. They appear here while the call runs.", icon: <Phone className="h-5 w-5" /> },
  results: { title: "No results yet", body: "Finished screening calls show up here with an outcome and a one-line reason. Review them, then accept the good fits.", icon: <Clock className="h-5 w-5" /> },
  accepted: { title: "No accepted candidates yet", body: "Accept good candidates from Results, then call them to confirm and schedule the first visit.", icon: <UserCheck className="h-5 w-5" /> },
};

export function CandidateList({ rows, calls, loading, selected, busyIds, queuedIds, tab, onTab, filtersHidden, onResetFilters, ...h }: Handlers & {
  rows: Row[]; calls: CallsByCandidate; loading: boolean; selected: Set<string>; busyIds: Set<string>; queuedIds: Set<string>;
  tab: TabKey; onTab: (t: TabKey) => void; filtersHidden: boolean; onResetFilters: () => void;
}) {
  const bucket: Record<TabKey, Row[]> = { toScreen: [], progress: [], results: [], accepted: [] };
  for (const row of rows) bucket[tabOf(row.c, calls[row.c.id], queuedIds.has(row.c.id))].push(row);
  const list = bucket[tab];
  return (
    <div>
      <div role="tablist" aria-label="Candidate stages" className="mb-3 flex gap-1 overflow-x-auto rounded-xl bg-slate-100 p-1">
        {TABS.map((t) => (
          <button key={t.key} role="tab" id={`tab-${t.key}`} aria-selected={tab === t.key} aria-controls="candidate-panel" onClick={() => onTab(t.key)}
            className={clsx("flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-violet-600",
              tab === t.key ? "bg-white text-violet-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
            {t.label}
            <span className={clsx("rounded-full px-1.5 text-xs tabular-nums", tab === t.key ? "bg-violet-100 text-violet-800" : "bg-slate-200 text-slate-600", t.key === "progress" && bucket.progress.length > 0 && "animate-pulse")}>{bucket[t.key].length}</span>
          </button>
        ))}
      </div>
      <div id="candidate-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {loading ? (
          <div className="space-y-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-[88px] w-full rounded-xl" />)}</div>
        ) : list.length > 0 ? (
          <ul className="space-y-2">
            {list.map((row) => <CandidateRow key={row.c.id} row={row} calls={calls[row.c.id]} selected={selected.has(row.c.id)} busy={busyIds.has(row.c.id)} queued={queuedIds.has(row.c.id)} h={h} />)}
          </ul>
        ) : tab === "toScreen" && filtersHidden ? (
          <EmptyState icon={<SearchX className="h-5 w-5" />} title="No one matches these filters" body="Widen the age range, raise the max distance, or lower the minimum fit score to bring candidates back."
            action={<Button variant="secondary" onClick={onResetFilters}><RotateCcw className="h-3.5 w-3.5" />Reset filters</Button>} />
        ) : (
          <EmptyState icon={EMPTY[tab].icon} title={EMPTY[tab].title} body={EMPTY[tab].body} />
        )}
      </div>
    </div>
  );
}
