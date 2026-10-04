"use client";
import clsx from "clsx";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, CalendarClock, Check, Clock, Flag, Info, Loader2, Minus, Phone, Plus, UserPlus, Users } from "lucide-react";
import { Badge, Button, Callout, Card, EmptyState, PageHeader, Stat, flagLabel } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import { browserDb } from "@/lib/db/client";
import { buildMatrix, scheduleItems, type CellStatus, type ScheduleItem, type SurveyCell, type SurveyRow } from "@/lib/survey";
import type { Call, Candidate, Study, Visit } from "@/lib/db/types";

const NODE: Record<CellStatus, { label: string; box: string; icon: typeof Check }> = {
  upcoming: { label: "Upcoming", box: "border-slate-200 bg-slate-50 text-slate-500", icon: Clock },
  due: { label: "Due", box: "border-amber-300 bg-amber-50 text-amber-900 ring-1 ring-amber-200", icon: CalendarClock },
  calling: { label: "Calling", box: "border-violet-300 bg-violet-50 text-violet-800 animate-pulse", icon: Phone },
  complete: { label: "Done", box: "border-emerald-200 bg-emerald-50 text-emerald-800", icon: Check },
  flagged: { label: "Flagged", box: "border-red-300 bg-red-50 text-red-800 ring-1 ring-red-200", icon: Flag },
  skipped: { label: "Visit passed", box: "border-slate-200 bg-white text-slate-400", icon: Minus },
};

export function SurveyBoard({ study, visits, candidates, calls }: { study: Study; visits: Visit[]; candidates: Candidate[]; calls: Call[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const items = useMemo(() => scheduleItems(visits), [visits]);
  const itemByKey = useMemo(() => new Map<string, ScheduleItem>(items.map((it) => [it.key, it])), [items]);
  const maxDay = useMemo(() => {
    const fromItems = items.reduce((m, it) => Math.max(m, it.dueDay + it.windowDays, it.visit.day_offset), 0);
    return Math.max(study.details?.duration_days ?? 0, fromItems, 1);
  }, [items, study.details]);
  const [day, setDay] = useState(0);
  const [pending, setPending] = useState<Set<string>>(new Set());
  const [enrolling, setEnrolling] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Realtime: any change to this study's calls refreshes server data.
  useEffect(() => {
    let channel: ReturnType<ReturnType<typeof browserDb>["channel"]> | null = null;
    try {
      channel = browserDb()
        .channel(`survey-${study.id}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "call", filter: `study_id=eq.${study.id}` }, () => {
          if (timer.current) clearTimeout(timer.current);
          timer.current = setTimeout(() => router.refresh(), 300);
        })
        .subscribe();
    } catch {
      /* no realtime: manual refresh after actions */
    }
    return () => {
      if (timer.current) clearTimeout(timer.current);
      try { if (channel) void browserDb().removeChannel(channel); } catch { /* ignore */ }
    };
  }, [study.id, router]);

  const { today, rows } = useMemo(() => buildMatrix(candidates, visits, calls, day), [candidates, visits, calls, day]);
  const dueCount = rows.reduce((n, r) => n + r.cells.filter((c) => c.status === "due").length, 0);
  const doneCount = rows.reduce((n, r) => n + r.cells.filter((c) => c.status === "complete" || c.status === "flagged").length, 0);
  const flaggedCount = rows.reduce((n, r) => n + r.cells.filter((c) => c.status === "flagged").length, 0);
  const busyAny = pending.size > 0 || rows.some((r) => r.cells.some((c) => c.status === "calling"));

  async function callNow(candidate: Candidate, cell: SurveyCell) {
    const key = `${candidate.id}:${cell.key}`;
    setPending((p) => new Set(p).add(key));
    try {
      const res = await fetch("/api/calls/start", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ candidateId: candidate.id, kind: cell.kind, visitId: cell.visitId }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; callId?: string; error?: string };
      if (res.status === 409) {
        toast("Another call is already in progress. Demo calls run one at a time, so wait for it to finish and try again.", "info");
      } else if (!res.ok || !json.ok) {
        toast(`Call to ${candidate.name} failed to start: ${json.error ?? "unknown error"}`, "error");
      } else {
        toast(`Calling ${candidate.name} now. Your phone should ring shortly.`, "success");
        router.refresh();
      }
    } catch (e) {
      toast(`Call failed to start: ${e instanceof Error ? e.message : "network error"}`, "error");
    } finally {
      setPending((p) => { const n = new Set(p); n.delete(key); return n; });
    }
  }

  async function demoEnroll() {
    setEnrolling(true);
    try {
      const res = await fetch("/api/survey/demo-enroll", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ studyId: study.id }) });
      const json = (await res.json()) as { ok: boolean; error?: string; candidate?: Candidate };
      if (!json.ok) throw new Error(json.error ?? "Enroll failed");
      toast(`Enrolled ${json.candidate?.name ?? "a participant"} for the demo.`, "success");
      router.refresh();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Enroll failed", "error");
    } finally {
      setEnrolling(false);
    }
  }

  function nextSummary(r: SurveyRow): { text: string; tone: "amber" | "green" | "gray" | "violet" } {
    const live = r.cells.find((c) => c.status === "calling");
    if (live) return { text: "Call in progress", tone: "violet" };
    // A reminder for a visit that is tomorrow is more urgent than an overdue survey call.
    const due = r.cells.find((c) => c.status === "due" && c.kind === "reminder") ?? r.cells.find((c) => c.status === "due");
    if (due) return { text: `${itemByKey.get(due.key)?.label ?? "Call"} due now`, tone: "amber" };
    const up = r.cells.map((c) => ({ c, it: itemByKey.get(c.key) })).find((x) => x.c.status === "upcoming" && x.it);
    if (up?.it) { const d = Math.max(0, up.it.dueDay - up.it.windowDays - r.day); return { text: `Next: ${up.it.label} in ${d} day${d === 1 ? "" : "s"}`, tone: "gray" }; }
    return { text: "All scheduled calls complete", tone: "green" };
  }

  function node(candidate: Candidate, cell: SurveyCell) {
    const it = itemByKey.get(cell.key);
    if (!it) return null;
    const reminder = it.kind === "reminder";
    const busy = pending.has(`${candidate.id}:${cell.key}`);
    const status: CellStatus = busy ? "calling" : cell.status;
    const st = NODE[status];
    const Icon = busy ? Loader2 : st.icon;
    const outcome = cell.flag && (status === "complete" || status === "flagged") ? flagLabel(cell.flag, it.kind) : null;
    const when = reminder ? `Day ${it.dueDay} \u00b7 visit on day ${it.visit.day_offset}` : `Day ${it.visit.day_offset}`;
    const detail = `${it.label}, ${when}${!reminder && it.windowDays ? ` (window +/-${it.windowDays})` : ""}: ${st.label}${cell.overdue && status === "due" ? ", overdue" : ""}`;
    return (
      <li key={cell.key} title={detail} className={clsx("flex w-40 flex-col gap-1.5 rounded-xl border p-2.5", st.box)}>
        <div className="flex items-center gap-1.5 text-xs font-semibold">
          <Icon className={clsx("h-3.5 w-3.5", busy && "animate-spin")} aria-hidden />
          <span>{outcome ?? st.label}{cell.overdue && status === "due" ? " (overdue)" : ""}</span>
        </div>
        <div className="min-w-0">
          {reminder && <p className="mb-0.5 inline-flex items-center gap-1 rounded-full bg-sky-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800"><Bell className="h-2.5 w-2.5" aria-hidden />Reminder</p>}
          <p className="truncate text-xs font-medium text-slate-900">{reminder ? it.visit.name : it.label}</p>
          <p className="text-[11px] text-slate-500">{when}</p>
        </div>
        {cell.status === "due" && (
          <Button size="sm" loading={busy} disabled={busy} onClick={() => void callNow(candidate, cell)} aria-label={`${reminder ? "Send reminder call to" : "Call"} ${candidate.name} now for ${it.visit.name}`}>
            {!busy && <Phone className="h-3 w-3" />} {reminder ? "Remind now" : "Call now"}
          </Button>
        )}
        {cell.callId && cell.status !== "due" && cell.status !== "skipped" && (
          <Link href={`/review/${cell.callId}`} className="text-xs font-medium text-violet-700 hover:underline">{cell.status === "calling" ? "Watch live" : "Review call"}</Link>
        )}
      </li>
    );
  }

  const header = (
    <PageHeader
      eyebrow="Step 3"
      title="Survey pipeline"
      subtitle={`${study.title}. Follow-up surveys and clinic-visit reminders, driven by the visit timeline.`}
      actions={rows.length > 0 ? <Button variant="secondary" loading={enrolling} onClick={() => void demoEnroll()}><UserPlus className="h-4 w-4" /> Demo enroll a participant</Button> : undefined}
    />
  );

  if (rows.length === 0) {
    return (
      <div>
        {header}
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title="No enrolled participants yet"
          body="Participants appear here once they are enrolled in Recruitment. To try the survey pipeline right away, enroll a demo participant."
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Button loading={enrolling} onClick={() => void demoEnroll()}><UserPlus className="h-4 w-4" /> Demo enroll a participant</Button>
              <Link href={`/recruitment?study=${study.id}`}><Button variant="secondary">Go to Recruitment</Button></Link>
            </div>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {header}

      <Callout tone="info" icon={<Info className="h-4 w-4" />} title="Simulate day: a virtual clock for the demo">
        Real follow-ups happen over weeks. Drag the slider to jump forward in study time. Survey calls turn <strong>Due</strong> when their window opens, and every clinic visit gets a <strong>Reminder</strong> call the day before. Press <strong>Call now</strong> or <strong>Remind now</strong> to phone the participant (calls to the demo phone run one at a time).
      </Callout>

      <Card>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={() => setDay((d) => Math.max(0, d - 1))} disabled={day <= 0} aria-label="Previous day"><Minus className="h-4 w-4" /></Button>
            <div className="w-24 text-center">
              <p className="text-2xl font-semibold tabular-nums leading-none text-slate-900">Day {day}</p>
              <p className="mt-1 text-xs text-slate-500">{today}</p>
            </div>
            <Button variant="secondary" onClick={() => setDay((d) => Math.min(maxDay, d + 1))} disabled={day >= maxDay} aria-label="Next day"><Plus className="h-4 w-4" /></Button>
          </div>
          <input type="range" min={0} max={maxDay} value={day} onChange={(e) => setDay(Number(e.target.value))} className="h-2 min-w-40 flex-1 accent-violet-700" aria-label={`Simulated day, 0 to ${maxDay}`} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <span className="mr-1 text-xs font-medium text-slate-500">Jump to</span>
          {[{ id: "start", label: "Enrollment", d: 0 }, ...items.map((it) => ({ id: it.key, label: it.label, d: it.dueDay })), { id: "end", label: "Study end", d: maxDay }].map((j) => (
            <button key={j.id} type="button" onClick={() => setDay(j.d)}
              className={clsx("rounded-full border px-2.5 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-violet-600",
                day === j.d ? "border-violet-300 bg-violet-100 text-violet-900" : "border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-800")}>
              {j.label} <span className="text-slate-400">day {j.d}</span>
            </button>
          ))}
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Participants" value={rows.length} />
        <Stat label="Due now" value={dueCount} hint={busyAny ? "a call is in progress" : dueCount > 0 ? "ready to call" : "nothing due"} />
        <Stat label="Calls completed" value={doneCount} tone={doneCount > 0 ? "green" : undefined} />
        <Stat label="Flagged" value={flaggedCount} tone={flaggedCount > 0 ? "red" : undefined} hint={flaggedCount > 0 ? "need review" : undefined} />
      </div>

      {items.length === 0 ? (
        <Card><p className="py-4 text-center text-sm text-slate-500">This study has no follow-up survey calls or clinic visits to remind about. Add some in Setup.</p></Card>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const sum = nextSummary(r);
            return (
              <Card key={r.candidate.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate text-sm font-semibold text-slate-900">{r.candidate.name}</h3>
                    <p className="text-xs text-slate-500">Enrolled {r.candidate.enrolled_at?.slice(0, 10)} &middot; study day {r.day}</p>
                  </div>
                  <Badge tone={sum.tone} dot>{sum.text}</Badge>
                </div>
                <ol className="mt-3 flex flex-wrap gap-2" aria-label={`Call schedule for ${r.candidate.name}`}>
                  {r.cells.map((cell) => node(r.candidate, cell))}
                </ol>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
