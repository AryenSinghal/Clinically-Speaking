"use client";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Badge, Button, Card, Skeleton } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import { browserDb } from "@/lib/db/client";
import type { Call, Candidate, Study } from "@/lib/db/types";
import { DEFAULT_SITE, DEFAULT_WEIGHTS, defaultFilters, passesFilters, scoreCandidate, scoreColor, type Filters, type Weights } from "@/lib/scoring";
import { ActionBar, type Batch } from "./ActionBar";
import { CandidateList } from "./CandidateList";
import { FilterBar } from "./FilterBar";
import { ProgressStrip } from "./ProgressStrip";
import { TrialContextPanel } from "./TrialContextPanel";
import { canSelect, isActive, tabOf, type CallsByCandidate, type Row, type Stage, type TabKey } from "./types";

const CandidateMap = dynamic(() => import("./CandidateMap"), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full rounded-none" />,
});

type Api = { ok: boolean; error?: string; candidates?: Candidate[] };
type ApiResult = { ok: boolean; error?: string; callId?: string };

function groupCalls(calls: Call[]): CallsByCandidate {
  const out: CallsByCandidate = {};
  for (const c of calls) {
    if (!c.candidate_id || c.kind === "survey" || c.kind === "reminder") continue;
    const slot = (out[c.candidate_id] ??= {});
    const cur = slot[c.kind];
    if (!cur || c.created_at > cur.created_at) slot[c.kind] = c;
  }
  return out;
}

async function api(url: string, method: string, body: unknown): Promise<ApiResult> {
  try {
    const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    return (await res.json().catch(() => ({ ok: false, error: `HTTP ${res.status}` }))) as ApiResult;
  } catch (e) { return { ok: false, error: e instanceof Error ? e.message : "Network error" }; }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function Legend() {
  const dot = (bg: string, size = 12) => <span className="inline-block rounded-full border-2 border-white shadow-sm" style={{ background: bg, width: size, height: size }} />;
  return (
    <div className="pointer-events-none absolute bottom-2 left-2 max-w-[calc(100%-1rem)] rounded-lg bg-white/95 px-2.5 py-1.5 text-[11px] text-slate-700 shadow">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="inline-flex items-center gap-1">{dot(scoreColor(80))}Strong fit</span>
        <span className="inline-flex items-center gap-1">{dot(scoreColor(60))}Moderate</span>
        <span className="inline-flex items-center gap-1">{dot(scoreColor(30))}Weak</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-white bg-slate-400 ring-[3px] ring-violet-700" />Selected</span>
        <span className="inline-flex items-center gap-1"><span className="inline-flex h-4 w-4 items-center justify-center rounded bg-violet-800 text-[10px] font-bold text-white">+</span>Site</span>
        <span className="inline-flex items-center gap-1"><span className="inline-block h-3.5 w-3.5 rounded-full border-2 border-dashed border-violet-700" />Max distance</span>
      </div>
      <div className="mt-0.5 text-slate-500">Bigger dot = better fit. Click a dot to select.</div>
    </div>
  );
}

export function RecruitmentClient({ study, initialCandidates }: { study: Study; initialCandidates: Candidate[] }) {
  const { toast } = useToast();
  const elig = study.details?.eligibility ?? null;
  const site = useMemo(() => (study.site ? { lat: study.site.lat, lng: study.site.lng } : DEFAULT_SITE), [study.site]);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [calls, setCalls] = useState<CallsByCandidate>({});
  const [callsLoaded, setCallsLoaded] = useState(false);
  const [filters, setFilters] = useState<Filters>(() => defaultFilters(elig));
  const [weights, setWeights] = useState<Weights>(DEFAULT_WEIGHTS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<TabKey>("toScreen");
  const [working, setWorking] = useState(false);
  // Sequential screening queue: the demo phone can only take one call at a time.
  const [queue, setQueue] = useState<string[]>([]);
  const [batch, setBatch] = useState<{ total: number; started: number } | null>(null);
  const startingRef = useRef(false);
  const [starting, setStarting] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const r = (await (await fetch(`/api/candidates?studyId=${study.id}`, { cache: "no-store" })).json()) as Api;
      if (r.ok && r.candidates) setCandidates(r.candidates);
    } catch { /* transient */ }
    try {
      const { data } = await browserDb().from("call").select("*").eq("study_id", study.id).in("kind", ["screening", "confirmation"]);
      if (data) setCalls(groupCalls(data as Call[]));
    } catch { /* browser Supabase not configured */ }
    setCallsLoaded(true);
  }, [study.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    try {
      const ch = browserDb().channel(`recruit-calls-${study.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "call", filter: `study_id=eq.${study.id}` }, () => { void refresh(); })
        .subscribe();
      return () => { void browserDb().removeChannel(ch); };
    } catch { return; }
  }, [study.id, refresh]);

  const anyActive = Object.values(calls).some((c) => isActive(c.screening) || isActive(c.confirmation));
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  const polling = anyActive || queue.length > 0;
  useEffect(() => {
    if (!polling) return;
    const t = setInterval(() => { void refreshRef.current(); }, 4000); // polling fallback if Realtime is off
    return () => clearInterval(t);
  }, [polling]);

  // Queue runner: start the next screening call only when nothing else is ringing.
  useEffect(() => {
    if (starting || startingRef.current || !callsLoaded) return;
    if (queue.length === 0) { if (batch && !anyActive) setBatch(null); return; }
    if (anyActive) return;
    const [id, ...rest] = queue;
    startingRef.current = true;
    setStarting(true);
    void (async () => {
      const r = await api("/api/calls/start", "POST", { candidateId: id, kind: "screening" });
      if (r.ok) {
        setQueue(rest);
        setBatch((b) => (b ? { ...b, started: b.started + 1 } : b));
      } else if (/already in progress/i.test(r.error ?? "")) {
        await sleep(3000); // something else holds the phone line; keep the queue and try again
      } else {
        toast(`Could not start a call: ${r.error ?? "unknown error"}`, "error");
        setQueue(rest);
        setBatch((b) => (b ? { ...b, total: Math.max(0, b.total - 1) } : b));
      }
      await refreshRef.current();
      startingRef.current = false;
      setStarting(false);
    })();
  }, [queue, anyActive, starting, callsLoaded, batch, toast]);

  const queuedIds = useMemo(() => new Set(queue), [queue]);

  const allRows: Row[] = useMemo(() => candidates.map((c) => ({
    c, r: scoreCandidate(c, { site, eligibility: elig, weights, maxKm: filters.maxKm }),
  })), [candidates, site, elig, weights, filters.maxKm]);
  const rows = useMemo(() => allRows
    .filter(({ c, r }) => c.status !== "suggested" || passesFilters(r, c, filters))
    .sort((a, b) => b.r.score - a.r.score), [allRows, filters]);

  const selectableIds = useMemo(() => new Set(rows.filter(({ c }) => canSelect(c, calls[c.id]) && !queuedIds.has(c.id)).map(({ c }) => c.id)), [rows, calls, queuedIds]);
  const actionable = rows.filter(({ c }) => selected.has(c.id) && selectableIds.has(c.id));

  const toggle = (id: string) => {
    if (!selectableIds.has(id)) { toast("This person is already in the pipeline.", "info"); return; }
    setSelected((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  };

  const enqueue = useCallback((ids: string[]) => {
    const fresh = ids.filter((i) => !queue.includes(i));
    if (!fresh.length) return;
    setQueue((q) => [...q, ...fresh]);
    setBatch((b) => (b ? { ...b, total: b.total + fresh.length } : { total: fresh.length, started: 0 }));
  }, [queue]);

  async function callSelected() {
    if (!actionable.length) return;
    setWorking(true);
    const ids = actionable.map(({ c }) => c.id);
    const fitScores = Object.fromEntries(actionable.map(({ c, r }) => [c.id, r.score]));
    const p = await api("/api/candidates", "PATCH", { ids, studyId: study.id, status: "selected", fitScores });
    if (!p.ok) { toast(p.error ?? "Could not select candidates", "error"); setWorking(false); return; }
    enqueue(ids);
    setSelected(new Set());
    setTab("progress");
    toast(ids.length === 1 ? "Screening call queued. Your demo phone will ring shortly." : `${ids.length} screening calls queued. They ring the demo phone one after another.`, "success");
    await refresh();
    setWorking(false);
  }

  async function withBusy(id: string, fn: () => Promise<void>) {
    setBusy((b) => new Set(b).add(id));
    try { await fn(); } finally { setBusy((b) => { const n = new Set(b); n.delete(id); return n; }); await refresh(); }
  }
  const nameOf = (id: string) => candidates.find((c) => c.id === id)?.name ?? "Candidate";
  const accept = (id: string) => withBusy(id, async () => {
    const r = await api("/api/candidates", "PATCH", { ids: [id], status: "accepted" });
    if (r.ok) { toast(`${nameOf(id)} accepted. Call them to confirm and book the first visit.`, "success"); setTab("accepted"); }
    else toast(r.error ?? "Accept failed", "error");
  });
  const confirmCall = (id: string) => withBusy(id, async () => {
    const r = await api("/api/calls/start", "POST", { candidateId: id, kind: "confirmation" });
    if (r.ok) { toast(`Confirmation call to ${nameOf(id)} started.`, "success"); setTab("progress"); }
    else toast(r.error ?? "Call failed to start", "error");
  });
  const retryScreening = (id: string) => { enqueue([id]); setTab("progress"); toast(`Retrying the screening call for ${nameOf(id)}.`, "info"); };
  const cancelQueue = () => {
    setQueue([]);
    setBatch((b) => (b ? { ...b, total: b.started } : b));
    toast("Remaining calls cancelled. The call in progress will finish.", "info");
  };

  const resetFilters = () => { setFilters(defaultFilters(elig)); setWeights(DEFAULT_WEIGHTS); };
  const filtersChanged = JSON.stringify(filters) !== JSON.stringify(defaultFilters(elig)) || JSON.stringify(weights) !== JSON.stringify(DEFAULT_WEIGHTS);

  const poolSize = candidates.filter((c) => c.status === "suggested").length;
  const shownSuggested = rows.filter(({ c }) => c.status === "suggested").length;
  const strong = rows.filter(({ r }) => r.score >= 75).length;
  const cond = study.details?.condition ?? elig?.target_conditions[0] ?? "";

  // ---- Guided progress: derive the stage and the one next action ----
  const tabs = rows.map(({ c }) => tabOf(c, calls[c.id], queuedIds.has(c.id)));
  const inProgress = tabs.filter((t) => t === "progress").length;
  const good = rows.filter(({ c }) => c.status === "good").length;
  const needsReview = rows.filter(({ c }) => c.status === "screened" || c.status === "good").length;
  const toConfirm = rows.filter(({ c }) => c.status === "accepted").length;
  const enrolled = rows.filter(({ c }) => c.status === "enrolled").length;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

  const selectTop = () => {
    const top = rows.filter(({ c }) => selectableIds.has(c.id)).slice(0, 3).map(({ c }) => c.id);
    setTab("toScreen");
    setSelected(new Set(top));
  };

  let stage: Stage = 1;
  let headline: React.ReactNode = "Select 1–3 people and start screening calls";
  let detail: React.ReactNode = "Use the filters and map to find strong fits, then pick a few to call. Start small for the demo.";
  let action: React.ReactNode = selectableIds.size > 0 ? <Button onClick={selectTop}>Select top {Math.min(3, selectableIds.size)} fits</Button> : null;
  if (inProgress > 0 || batch) {
    stage = 3;
    headline = batch && batch.total > 1 ? `Call ${Math.min(Math.max(batch.started, 1), batch.total)} of ${batch.total} in progress…` : "Call in progress…";
    detail = "Answer the demo phone. Results appear here on their own once each call has been analyzed.";
    action = tab !== "progress" ? <Button variant="secondary" onClick={() => setTab("progress")}>View calls in progress</Button> : null;
  } else if (actionable.length > 0) {
    stage = 2;
    headline = `${plural(actionable.length, "person")} selected`;
    detail = "Calls ring the demo phone one at a time, so answer each in turn.";
    action = <Button loading={working} onClick={() => void callSelected()}>Call {actionable.length} for screening</Button>;
  } else if (needsReview > 0) {
    stage = 4;
    headline = `${plural(needsReview, "result")} ready to review`;
    detail = good > 0 ? `Accept good candidates (${good} waiting), or open a call to check the evidence first.` : "Open each call to check the evidence and decide what to do.";
    action = tab !== "results" ? <Button onClick={() => setTab("results")}>Review results</Button> : null;
  } else if (toConfirm > 0) {
    stage = 5;
    headline = "Call accepted candidates to schedule their first visit";
    detail = `${plural(toConfirm, "accepted candidate")} waiting for a confirmation call.`;
    action = tab !== "accepted" ? <Button onClick={() => setTab("accepted")}>Go to accepted</Button> : null;
  } else if (enrolled > 0) {
    stage = 5;
    headline = `${enrolled} enrolled`;
    detail = "Everyone accepted has been scheduled. Select more candidates to keep recruiting.";
    action = null;
  }

  return (
    <div className="space-y-4">
      <ProgressStrip stage={stage} headline={headline} detail={detail} action={action} busy={stage === 3} />

      <FilterBar filters={filters} weights={weights} shown={shownSuggested} pool={poolSize} changed={filtersChanged}
        onFilters={setFilters} onWeights={setWeights} onReset={resetFilters} />

      <Card
        title="Candidates around the site"
        subtitle={elig ? `Protocol: age ${elig.age_min ?? "any"}–${elig.age_max ?? "any"}, sex ${elig.sex}, ${elig.target_conditions.join(", ") || "no target conditions"}` : "Protocol details not extracted yet; default scoring is used."}
        actions={<><Badge tone="violet">{rows.length} on map</Badge><Badge tone="green">{strong} strong fits</Badge></>}
        padded={false}
      >
        <div className="relative h-[380px] overflow-hidden rounded-b-2xl sm:h-[500px]">
          <CandidateMap site={site} siteName={study.site?.name ?? "Study site"} rows={rows} selected={selected} selectable={selectableIds} maxKm={filters.maxKm} onToggle={toggle} />
          <Legend />
        </div>
      </Card>

      <Card title="Candidates" subtitle="Synthetic demo registry: fictional people with fake phone numbers. Outbound calls go to the demo phone.">
        <CandidateList
          rows={rows} calls={calls} loading={!callsLoaded} selected={selected} busyIds={busy} queuedIds={queuedIds}
          tab={tab} onTab={setTab} filtersHidden={poolSize > 0 && shownSuggested === 0} onResetFilters={resetFilters}
          onToggle={toggle} onAccept={(id) => void accept(id)} onConfirmCall={(id) => void confirmCall(id)} onRetryScreening={retryScreening}
        />
      </Card>

      <TrialContextPanel cond={cond} lat={site.lat} lng={site.lng} />

      <ActionBar count={actionable.length} batch={batch ? { ...batch, current: null } : null} working={working} onCall={() => void callSelected()}
        onClear={() => setSelected(new Set())} onCancelQueue={cancelQueue} />
    </div>
  );
}
