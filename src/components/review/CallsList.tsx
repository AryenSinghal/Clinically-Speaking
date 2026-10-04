"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { browserDb } from "@/lib/db/client";
import type { Call } from "@/lib/db/types";
import { Badge, EmptyState, Skeleton } from "@/components/ui";
import { EscalationBadge } from "./EscalationBadge";
import { isLive, kindLabel } from "./util";
import { When } from "./Time";

type Row = Call & { candidateName: string | null };

/** Realtime list of calls for a study (or all). Each row links to /review/[callId]. */
export function CallsList({ studyId, escalationsOnly = false, onlyUnresolved = false, children }: {
  studyId?: string | null; escalationsOnly?: boolean; onlyUnresolved?: boolean;
  children?: (row: Row) => React.ReactNode;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    const sb = browserDb();
    let q = sb.from("call").select("*").order("created_at", { ascending: false }).limit(100);
    if (studyId) q = q.eq("study_id", studyId);
    if (escalationsOnly) q = q.eq("flag", "escalate");
    if (onlyUnresolved) q = q.eq("escalation_resolved", false);
    const { data } = await q;
    const calls = (data ?? []) as Call[];
    const ids = [...new Set(calls.map((c) => c.candidate_id).filter((x): x is string => !!x))];
    const names = new Map<string, string>();
    if (ids.length) {
      const { data: cs } = await sb.from("candidate").select("id,name").in("id", ids);
      for (const c of (cs ?? []) as { id: string; name: string }[]) names.set(c.id, c.name);
    }
    setRows(calls.map((c) => ({ ...c, candidateName: c.candidate_id ? names.get(c.candidate_id) ?? null : null })));
  }, [studyId, escalationsOnly, onlyUnresolved]);

  useEffect(() => {
    const sb = browserDb();
    void load();
    const ch = sb.channel(`calls-list-${studyId ?? "all"}-${escalationsOnly}-${onlyUnresolved}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "call" }, () => { void load(); })
      .subscribe();
    const t = setInterval(() => { void load(); }, 8000);
    return () => { clearInterval(t); void sb.removeChannel(ch); };
  }, [load, studyId, escalationsOnly, onlyUnresolved]);

  if (rows === null) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full rounded-xl" />)}</div>;
  if (!rows.length) return <EmptyState title="No calls yet" body="Calls will appear here as soon as they start." />;
  return (
    <ul className="space-y-2">
      {rows.map((r) => {
        const red = r.flag === "escalate" && !r.escalation_resolved;
        return (
          <li key={r.id} className={red ? "rounded-xl border-2 border-red-400 bg-red-50 p-3" : "rounded-xl border border-slate-200 bg-white p-3"}>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={`/review/${r.id}`} className="font-medium text-violet-800 hover:underline">{r.candidateName ?? "Unknown candidate"}</Link>
              <Badge tone="violet">{kindLabel[r.kind]}</Badge>
              <Badge tone={isLive(r.status) ? "red" : "gray"}>{r.status}</Badge>
              <EscalationBadge call={r} />
              <span className="ml-auto text-xs text-slate-500"><When iso={r.created_at} /></span>
            </div>
            {(r.flag_reason || r.summary) && <p className="mt-1 text-sm text-slate-700">{r.flag_reason ?? r.summary}</p>}
            {children && <div className="mt-2">{children(r)}</div>}
          </li>
        );
      })}
    </ul>
  );
}
