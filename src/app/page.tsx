import Link from "next/link";
import { AlertTriangle, ArrowRight, FileText, PhoneCall, Sparkles, Users, Check } from "lucide-react";
import clsx from "clsx";
import { Badge, Button, Card, EmptyState, Stat, flagLabel, flagMeta } from "@/components/ui";
import { db } from "@/lib/db/server";
import { getShellStatus } from "@/components/shell/status.server";
import { LiveRefresh } from "@/components/shell/LiveRefresh";
import type { Call } from "@/lib/db/types";

export const dynamic = "force-dynamic";

type RecentCall = Pick<Call, "id" | "kind" | "status" | "flag" | "summary" | "created_at"> & { candidate_name: string | null };

async function loadCalls(studyId: string | null): Promise<{ recent: RecentCall[]; surveyCalls: number }> {
  try {
    let q = db().from("call").select("id, kind, status, flag, summary, created_at, candidate:candidate_id(name)").order("created_at", { ascending: false }).limit(8);
    let sq = db().from("call").select("id", { count: "exact", head: true }).eq("kind", "survey");
    if (studyId) { q = q.eq("study_id", studyId); sq = sq.eq("study_id", studyId); }
    const [{ data }, s] = await Promise.all([q, sq]);
    const recent = (data ?? []).map((r) => {
      const cand = r.candidate as unknown as { name: string } | { name: string }[] | null;
      const name = Array.isArray(cand) ? cand[0]?.name : cand?.name;
      return { id: r.id, kind: r.kind, status: r.status, flag: r.flag, summary: r.summary, created_at: r.created_at, candidate_name: name ?? null } as RecentCall;
    });
    return { recent, surveyCalls: s.count ?? 0 };
  } catch {
    return { recent: [], surveyCalls: 0 };
  }
}

function timeAgo(iso: string): string {
  const s = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hr ago`;
  return `${Math.round(h / 24)} d ago`;
}

const KIND_LABEL: Record<Call["kind"], string> = { screening: "Screening", confirmation: "Confirmation", survey: "Survey", reminder: "Reminder" };

export default async function Home({ searchParams }: PageProps<"/">) {
  const sp = await searchParams;
  const studyParam = typeof sp.study === "string" ? sp.study : null;
  const status = await getShellStatus(studyParam);
  const { recent, surveyCalls } = await loadCalls(status.study?.id ?? null);
  const qs = status.study ? `?study=${status.study.id}` : "";

  const setupDone = status.setup.fields > 0 && status.setup.visits > 0;
  const next = (() => {
    if (!status.study) return { tone: "violet", title: "Start with Setup", body: "Upload a protocol PDF, or try the sample protocol, and Gemini will draft the EDC form and visit timeline.", cta: "Open Setup", href: "/setup", icon: FileText };
    if (status.escalations > 0) return { tone: "red", title: `Review ${status.escalations} escalation${status.escalations === 1 ? "" : "s"}`, body: "Calls flagged for a human are waiting. Listen to the evidence and resolve them.", cta: "Open escalation queue", href: "/escalations", icon: AlertTriangle };
    if (!setupDone) return { tone: "violet", title: "Finish study setup", body: "The study exists but has no EDC fields or visits yet. Review and complete the draft.", cta: "Continue Setup", href: "/setup", icon: FileText };
    if (status.recruitment.screened === 0) return { tone: "violet", title: "Pick candidates to screen", body: "Rank candidates on the map, select a few, and let the AI voice agent screen them by phone.", cta: "Go to Recruitment", href: "/recruitment", icon: Users };
    if (status.survey.enrolled > 0 && surveyCalls === 0) return { tone: "violet", title: "Run a follow-up survey", body: "Participants are enrolled. Simulate a day, then call everyone who is due.", cta: "Open Survey", href: "/survey", icon: PhoneCall };
    if (status.survey.enrolled === 0) return { tone: "violet", title: "Enroll your first participant", body: "Confirm accepted candidates in Recruitment, or demo-enroll one in Survey to try follow-ups right away.", cta: "Open Survey", href: "/survey", icon: PhoneCall };
    return { tone: "green", title: "Everything is on track", body: "No open escalations. Keep screening candidates or simulate the next study day.", cta: "Open Survey", href: "/survey", icon: Check };
  })();

  const pipelines = [
    { n: 1, icon: FileText, title: "Setup", href: "/setup", state: setupDone ? "done" : status.study ? "active" : "idle", line: status.study ? `${status.setup.fields} EDC fields, ${status.setup.visits} visits` : "No study yet", cta: setupDone ? "Review study" : "Create study" },
    { n: 2, icon: Users, title: "Recruitment", href: "/recruitment", state: status.recruitment.accepted > 0 ? "done" : status.recruitment.selected > 0 ? "active" : "idle", line: `${status.recruitment.selected} selected, ${status.recruitment.screened} screened, ${status.recruitment.accepted} accepted`, cta: status.recruitment.selected > 0 ? "Continue screening" : "Pick candidates" },
    { n: 3, icon: PhoneCall, title: "Survey", href: "/survey", state: status.survey.enrolled > 0 ? "active" : "idle", line: `${status.survey.enrolled} enrolled, ${surveyCalls} follow-up calls`, cta: status.survey.enrolled > 0 ? "Run follow-ups" : "Set up survey" },
  ] as const;
  const stateBadge = { idle: <Badge>Not started</Badge>, active: <Badge tone="violet" dot>In progress</Badge>, done: <Badge tone="green" dot>Done</Badge> };

  const NextIcon = next.icon;
  return (
    <div className="space-y-6">
      <LiveRefresh />
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Mission control</h1>
        <p className="mt-1 text-sm text-slate-600">Protocol to EDC, AI voice screening and follow-up surveys, with a human in the loop for risky calls.</p>
      </div>

      <div className={clsx("flex flex-col gap-4 rounded-2xl border p-5 shadow-sm sm:flex-row sm:items-center sm:p-6",
        next.tone === "red" ? "border-red-200 bg-red-50" : next.tone === "green" ? "border-emerald-200 bg-emerald-50" : "border-violet-200 bg-gradient-to-br from-violet-50 to-white")}>
        <div className={clsx("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white",
          next.tone === "red" ? "bg-red-600" : next.tone === "green" ? "bg-emerald-600" : "bg-violet-700")}>
          <NextIcon className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500"><Sparkles className="h-3.5 w-3.5" /> Next best action</div>
          <h2 className="mt-0.5 text-xl font-semibold tracking-tight text-slate-900">{next.title}</h2>
          <p className="mt-0.5 text-sm text-slate-600">{next.body}</p>
        </div>
        <Link href={`${next.href}${qs}`} className="shrink-0">
          <Button size="lg" variant={next.tone === "red" ? "danger" : "primary"}>{next.cta} <ArrowRight className="h-4 w-4" /></Button>
        </Link>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        {pipelines.map((p) => (
          <Link key={p.href} href={`${p.href}${qs}`} className="group block focus-visible:outline-2 focus-visible:outline-violet-600 rounded-2xl">
            <Card className="h-full transition group-hover:border-violet-300 group-hover:shadow-md">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-violet-700">
                  <p.icon className="h-5 w-5" />
                  <span className="text-xs font-semibold uppercase tracking-wide">Step {p.n}</span>
                </div>
                {stateBadge[p.state]}
              </div>
              <h3 className="mt-2 text-lg font-semibold text-slate-900">{p.title}</h3>
              <p className="mt-0.5 text-sm tabular-nums text-slate-600">{p.line}</p>
              <div className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-violet-700 group-hover:gap-2 transition-all">{p.cta} <ArrowRight className="h-4 w-4" /></div>
            </Card>
          </Link>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="EDC fields" value={status.setup.fields} hint={`${status.setup.visits} visits`} />
        <Stat label="Visits" value={status.setup.visits} hint={status.study ? "in timeline" : "no study"} />
        <Stat label="Candidates screened" value={status.recruitment.screened} hint={`${status.recruitment.accepted} accepted`} />
        <Stat label="Open escalations" value={status.escalations} tone={status.escalations > 0 ? "red" : "green"} hint={status.escalations > 0 ? "need review" : "all clear"} />
      </div>

      <Card title="Recent calls" subtitle={status.study?.title} padded={false}
        actions={status.escalations > 0 ? <Link href={`/escalations${qs}`}><Button size="sm" variant="secondary">Escalations</Button></Link> : undefined}>
        {recent.length === 0 ? (
          <div className="p-5"><EmptyState icon={<PhoneCall className="h-5 w-5" />} title="No calls yet" body="Calls appear here the moment they start, with their outcome once reviewed." /></div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {recent.map((c) => (
              <li key={c.id}>
                <Link href={`/review/${c.id}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">{c.candidate_name ?? "Unknown participant"}</p>
                    <p className="truncate text-xs text-slate-500">{KIND_LABEL[c.kind]} call &middot; {timeAgo(c.created_at)}</p>
                  </div>
                  {c.flag ? <Badge tone={flagMeta[c.flag].tone} dot>{flagLabel(c.flag, c.kind)}</Badge> : <Badge tone={c.status === "failed" ? "red" : "gray"}>{c.status.replace("_", " ")}</Badge>}
                  <ArrowRight className="hidden h-4 w-4 text-slate-300 sm:block" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
