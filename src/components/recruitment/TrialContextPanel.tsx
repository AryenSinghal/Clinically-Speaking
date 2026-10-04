"use client";
import { ChevronDown, ExternalLink, Globe2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, Callout, Card, Skeleton } from "@/components/ui";
import type { CtgovTrial } from "@/lib/ctgov";

type State = { kind: "loading" } | { kind: "error"; msg: string } | { kind: "ok"; trials: CtgovTrial[] };

export function TrialContextPanel({ cond, lat, lng }: { cond: string; lat: number; lng: number }) {
  const [state, setState] = useState<State>({ kind: "loading" });
  const [open, setOpen] = useState(true);
  useEffect(() => {
    if (!cond) return;
    const ac = new AbortController();
    setState({ kind: "loading" });
    const p = new URLSearchParams({ cond, lat: String(lat), lng: String(lng), radiusKm: "80" });
    fetch(`/api/ctgov?${p}`, { signal: ac.signal })
      .then((r) => r.json())
      .then((j: { ok: boolean; trials?: CtgovTrial[]; error?: string }) =>
        setState(j.ok ? { kind: "ok", trials: j.trials ?? [] } : { kind: "error", msg: j.error ?? "Unavailable" }))
      .catch((e: unknown) => { if (!ac.signal.aborted) setState({ kind: "error", msg: e instanceof Error ? e.message : "Unavailable" }); });
    return () => ac.abort();
  }, [cond, lat, lng]);

  const count = state.kind === "ok" ? state.trials.length : null;
  return (
    <Card
      title="Other trials near the site"
      subtitle="Context from ClinicalTrials.gov"
      padded={false}
      actions={
        <>
          {count !== null && <Badge tone="gray">{count} found</Badge>}
          <Button variant="ghost" size="sm" aria-expanded={open} aria-controls="trial-context" onClick={() => setOpen((o) => !o)}>
            {open ? "Hide" : "Show"}<ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </Button>
        </>
      }
    >
      {open && (
        <div id="trial-context" className="space-y-3 p-5">
          <Callout tone="info" icon={<Globe2 className="h-4 w-4" />}>
            These are real, public trials recruiting {cond ? <>for &ldquo;{cond}&rdquo; </> : ""}within about 80 km of the site, so you can see the competing studies for the same patients. The participants in this demo registry are synthetic.
          </Callout>
          {!cond && <p className="text-sm text-slate-500">No condition has been extracted from the protocol yet, so there is nothing to search for.</p>}
          {cond && state.kind === "loading" && (
            <div className="grid gap-3 sm:grid-cols-2">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full rounded-xl" />)}</div>
          )}
          {cond && state.kind === "error" && <Callout tone="warn">Could not reach ClinicalTrials.gov right now ({state.msg}). The rest of the page is unaffected.</Callout>}
          {cond && state.kind === "ok" && state.trials.length === 0 && <p className="text-sm text-slate-500">No similar recruiting trials found nearby.</p>}
          {cond && state.kind === "ok" && state.trials.length > 0 && (
            <ul className="grid gap-3 sm:grid-cols-2">
              {state.trials.map((t) => {
                const near = t.sites.filter((s) => s.distanceKm !== null && s.distanceKm <= 100)[0] ?? t.sites[0];
                return (
                  <li key={t.nctId} className="flex flex-col rounded-xl border border-slate-200 bg-white p-3">
                    <a href={t.url} target="_blank" rel="noreferrer" className="group inline-flex items-start gap-1 text-sm font-medium leading-snug text-violet-900 hover:underline">
                      <span className="line-clamp-2">{t.title}</span><ExternalLink className="mt-0.5 h-3 w-3 shrink-0 opacity-60 group-hover:opacity-100" />
                    </a>
                    <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                      <Badge tone={t.status === "RECRUITING" ? "green" : "gray"}>{t.status.replaceAll("_", " ").toLowerCase()}</Badge>
                      <span className="tabular-nums">{t.nctId}</span>
                      {t.phases.length > 0 && <span>{t.phases.map((p) => p.replace("PHASE", "Phase ")).join("/")}</span>}
                    </div>
                    {t.sponsor && <div className="mt-1 truncate text-xs text-slate-600">{t.sponsor}</div>}
                    {near && (
                      <div className="mt-auto pt-1.5 text-xs text-slate-500">
                        {near.facility}{near.city ? `, ${near.city}` : ""}{near.distanceKm !== null ? ` · ${near.distanceKm} km` : ""}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </Card>
  );
}
