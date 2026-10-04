"use client";
import clsx from "clsx";
import { CheckCircle2, ChevronRight, ShieldAlert, Undo2 } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserDb } from "@/lib/db/client";
import type { Call } from "@/lib/db/types";
import { Badge, Button, Card, EmptyState, Skeleton } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import { When } from "./Time";
import { kindLabel } from "./util";

type Row = Call & { candidateName: string | null };

export function EscalationQueue({ studyId }: { studyId: string | null }) {
  const { toast } = useToast();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [tab, setTab] = useState<"open" | "resolved">("open");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    const sb = browserDb();
    let q = sb.from("call").select("*").eq("flag", "escalate").order("created_at", { ascending: false }).limit(200);
    if (studyId) q = q.eq("study_id", studyId);
    const { data } = await q;
    const calls = (data ?? []) as Call[];
    const ids = [...new Set(calls.map((c) => c.candidate_id).filter((x): x is string => !!x))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: cs } = await sb.from("candidate").select("id,name").in("id", ids);
      for (const c of (cs ?? []) as { id: string; name: string }[]) names.set(c.id, c.name);
    }
    setRows(calls.map((c) => ({ ...c, candidateName: c.candidate_id ? names.get(c.candidate_id) ?? null : null })));
  }, [studyId]);

  useEffect(() => {
    const sb = browserDb();
    void load();
    const ch = sb.channel(`escalations-${studyId ?? "all"}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "call" }, () => { void load(); })
      .subscribe();
    const t = setInterval(() => { void load(); }, 8000);
    return () => { clearInterval(t); void sb.removeChannel(ch); };
  }, [load, studyId]);

  async function setResolved(r: Row, resolved: boolean) {
    setBusy(r.id);
    setRows((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, escalation_resolved: resolved } : x)));
    try {
      const res = await fetch("/api/escalations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId: r.id, resolved }) });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast(resolved ? `Resolved escalation for ${r.candidateName ?? "participant"}` : "Escalation reopened", "success");
    } catch (e) {
      setRows((rs) => rs && rs.map((x) => (x.id === r.id ? { ...x, escalation_resolved: !resolved } : x)));
      toast(e instanceof Error ? e.message : "Could not update escalation", "error");
    } finally { setBusy(null); }
  }

  if (rows === null) {
    return <div className="space-y-3">{[0, 1, 2].map((i) => <Card key={i}><div className="space-y-2"><Skeleton className="h-5 w-48" /><Skeleton className="h-4 w-full" /><Skeleton className="h-8 w-52" /></div></Card>)}</div>;
  }

  const open = rows.filter((r) => !r.escalation_resolved);
  const resolved = rows.filter((r) => r.escalation_resolved);
  const list = tab === "open" ? open : resolved;
  const tabs = [{ id: "open" as const, label: "Open", n: open.length }, { id: "resolved" as const, label: "Resolved", n: resolved.length }];

  return (
    <div className="space-y-4">
      <div role="tablist" aria-label="Escalation status" className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
        {tabs.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={clsx("inline-flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-violet-600", tab === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-600 hover:text-slate-900")}>
            {t.label}
            <span className={clsx("rounded-full px-1.5 text-xs tabular-nums", t.id === "open" && t.n > 0 ? "bg-red-600 text-white" : "bg-slate-200 text-slate-700")}>{t.n}</span>
          </button>
        ))}
      </div>

      {list.length === 0 ? (
        tab === "open"
          ? <EmptyState icon={<CheckCircle2 className="h-5 w-5" />} title="All clear: no open escalations" body="When a participant raises a safety concern or gives an unexpected answer, it shows up here for follow-up." />
          : <EmptyState title="Nothing resolved yet" body="Resolved escalations will be listed here." />
      ) : (
        <ul className="space-y-3">
          {list.map((r) => {
            const isOpen = !r.escalation_resolved;
            return (
              <li key={r.id} className={clsx("rounded-2xl border bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]", isOpen ? "border-red-200 border-l-4 border-l-red-500" : "border-slate-200")}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  {isOpen && <ShieldAlert className="h-4 w-4 text-red-600" aria-hidden />}
                  <Link href={`/review/${r.id}`} className="text-base font-semibold text-slate-900 hover:text-violet-700">{r.candidateName ?? "Unknown participant"}</Link>
                  <Badge tone="violet">{kindLabel[r.kind]}</Badge>
                  <span className="text-xs text-slate-500"><When iso={r.created_at} relative /></span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-800">{r.flag_reason ?? r.summary ?? "Flagged for human review."}</p>
                {isOpen && <p className="mt-1 text-xs text-slate-500">Suggested action: a study nurse should call the participant.</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link href={`/review/${r.id}`} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-violet-600">Review call<ChevronRight className="h-4 w-4" /></Link>
                  {isOpen
                    ? <Button variant="danger" loading={busy === r.id} onClick={() => setResolved(r, true)}><CheckCircle2 className="h-4 w-4" />Mark resolved</Button>
                    : <Button variant="secondary" loading={busy === r.id} onClick={() => setResolved(r, false)}><Undo2 className="h-4 w-4" />Reopen</Button>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
