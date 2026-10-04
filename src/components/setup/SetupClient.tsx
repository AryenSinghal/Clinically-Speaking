"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowRight, ChevronDown, FileSearch, Plus, RefreshCw } from "lucide-react";
import clsx from "clsx";
import { Badge, Button, Card, PageHeader } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import type { FormField, Questionnaire, Study, Visit } from "@/lib/db/types";
import { api, errText, plural, runGeneration } from "./api";
import { ConfirmDialog, ErrorBanner } from "./bits";
import { EdcEditor } from "./EdcEditor";
import { INITIAL_STEPS, Stepper, useStepper } from "./Progress";
import { QuestionnaireEditor } from "./QuestionnaireEditor";
import { StudyDetailsCard } from "./StudyDetailsCard";
import { TimelineEditor } from "./TimelineEditor";

type Tab = "overview" | "edc" | "timeline" | "questionnaires";
const TABS: { id: Tab; label: string }[] = [
  { id: "overview", label: "Overview" }, { id: "edc", label: "EDC Template" },
  { id: "timeline", label: "Timeline" }, { id: "questionnaires", label: "Questionnaires" },
];
const STATUS_TONE = { draft: "amber", setup_complete: "green", recruiting: "blue", active: "violet" } as const;

type State = { study: Study; fields: FormField[]; visits: Visit[]; questionnaires: Questionnaire[] };
function fetchState(studyId: string) {
  return api<State>(`/api/setup/state?study=${studyId}`);
}

function ClampedTitle({ title }: { title: string }) {
  const [open, setOpen] = useState(false);
  const long = title.length > 80;
  return (
    <span className="block">
      <span className={clsx("block", !open && "line-clamp-2")}>{title}</span>
      {long && <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className="mt-1 text-xs font-medium text-violet-700 hover:underline">{open ? "Show less" : "Show full title"}</button>}
    </span>
  );
}

export function SetupClient(props: { study: Study; fields: FormField[]; visits: Visit[]; questionnaires: Questionnaire[] }) {
  const router = useRouter();
  const { toast } = useToast();
  const [study, setStudy] = useState(props.study);
  const [fields, setFields] = useState(props.fields);
  const [visits, setVisits] = useState(props.visits);
  const [questionnaires, setQuestionnaires] = useState(props.questionnaires);
  const [tab, setTab] = useState<Tab>("overview");
  const [error, setError] = useState<string | null>(null);
  const [regen, setRegen] = useState(false);
  const [confirm, setConfirm] = useState<"all" | "parse" | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [rev, setRev] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const { steps, times, startedAt, setStep, reset } = useStepper();

  useEffect(() => {
    if (!menuOpen) return;
    const down = (e: MouseEvent) => { if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", down); document.addEventListener("keydown", key);
    return () => { document.removeEventListener("mousedown", down); document.removeEventListener("keydown", key); };
  }, [menuOpen]);

  async function refreshAll() {
    const d = await fetchState(study.id);
    setStudy(d.study); setFields(d.fields); setVisits(d.visits); setQuestionnaires(d.questionnaires); setRev((n) => n + 1);
  }

  async function selectTab(t: Tab) {
    setTab(t);
    if (t === "timeline") { // questionnaire changes may have re-linked visits server-side
      try {
        const d = await fetchState(study.id);
        setVisits(d.visits);
      } catch { /* keep local state */ }
    }
  }

  async function regenerateAll() {
    setConfirm(null); setRegen(true); setError(null); reset({ ...INITIAL_STEPS, parse: "done" });
    let ok = true;
    try { await runGeneration(study.id, setStep); }
    catch (e) { ok = false; setError(errText(e)); }
    try { await refreshAll(); if (ok) toast("Drafts regenerated", "success"); } catch (e) { setError(errText(e)); }
    setRegen(false);
  }
  async function reparse() {
    setConfirm(null); setRegen(true); setError(null); reset({ ...INITIAL_STEPS, parse: "active" });
    try {
      await api("/api/setup/generate", { method: "POST", json: { studyId: study.id, step: "details" } });
      setStep("parse", "done"); await refreshAll(); toast("Protocol re-parsed", "success");
    } catch (e) { setStep("parse", "error"); setError(errText(e)); }
    setRegen(false);
  }
  async function complete() {
    setFinishing(true); setError(null);
    try {
      await api("/api/setup/study", { method: "PATCH", json: { studyId: study.id, status: "setup_complete" } });
      router.push(`/recruitment?study=${study.id}`);
    } catch (e) { setError(errText(e)); setFinishing(false); }
  }

  const counts: Record<Tab, number | null> = { overview: null, edc: fields.length, timeline: visits.length, questionnaires: questionnaires.length };
  const blockers = [fields.length === 0 && "EDC fields", visits.length === 0 && "visits"].filter((x): x is string => !!x);
  const canFinish = blockers.length === 0 && !regen && !finishing;

  return (
    <div>
      <PageHeader
        eyebrow="Study setup"
        title={<ClampedTitle title={study.title} />}
        subtitle={<span className="flex flex-wrap items-center gap-2">
          <Badge tone={STATUS_TONE[study.status]} dot>{study.status.replace("_", " ")}</Badge>
          <span className="text-xs text-slate-500">{plural(fields.length, "field")} · {plural(visits.length, "visit")} · {plural(questionnaires.length, "questionnaire")}</span>
        </span>}
        actions={<Link href="/setup?new=1" className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600"><Plus className="h-4 w-4" />New study</Link>}
      />

      <ErrorBanner error={error} onClose={() => setError(null)} />
      {regen && (
        <div className="mb-4">
          <Card title="Regenerating" subtitle="This takes about 10–20 seconds"><div className="max-w-lg"><Stepper steps={steps} times={times} startedAt={startedAt} /></div></Card>
        </div>
      )}

      <div role="tablist" aria-label="Setup sections" className="mb-4 flex gap-1 overflow-x-auto border-b border-slate-200">
        {TABS.map((t) => (
          <button key={t.id} role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls={`panel-${t.id}`} onClick={() => void selectTab(t.id)}
            className={clsx("-mb-px flex shrink-0 items-center gap-1.5 border-b-2 px-4 py-2.5 text-sm font-medium transition focus-visible:outline-2 focus-visible:outline-violet-600",
              tab === t.id ? "border-violet-700 text-violet-800" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.label}
            {counts[t.id] != null && <span className={clsx("rounded-full px-1.5 text-xs tabular-nums", tab === t.id ? "bg-violet-100 text-violet-800" : "bg-slate-100 text-slate-600")}>{counts[t.id]}</span>}
          </button>
        ))}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`} className="pb-24">
        {tab === "overview" && <StudyDetailsCard key={`d${rev}`} study={study} visitCount={visits.length} onStudy={setStudy} />}
        {tab === "edc" && <EdcEditor studyId={study.id} fields={fields} onFields={setFields} />}
        {tab === "timeline" && <TimelineEditor key={`t${rev}`} studyId={study.id} visits={visits} questionnaires={questionnaires} onVisits={setVisits} />}
        {tab === "questionnaires" && <QuestionnaireEditor studyId={study.id} fields={fields} questionnaires={questionnaires} onQuestionnaires={setQuestionnaires} />}
      </div>

      <div className="sticky bottom-3 z-30 -mx-1 rounded-2xl border border-slate-200 bg-white/90 p-3 shadow-lg backdrop-blur">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="min-w-0 flex-1 text-sm text-slate-600" aria-live="polite">
            {canFinish || regen || finishing
              ? (regen ? "Regenerating drafts..." : "Review the tabs above, then continue to recruitment.")
              : <>To continue, add {blockers.join(" and ")} first.</>}
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative" ref={menuRef}>
              <Button variant="secondary" disabled={regen} aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((o) => !o)}>
                <RefreshCw className={clsx("h-4 w-4", regen && "animate-spin")} />Regenerate...<ChevronDown className="h-3.5 w-3.5" />
              </Button>
              {menuOpen && (
                <div role="menu" className="absolute bottom-full right-0 z-40 mb-2 w-72 rounded-xl border border-slate-200 bg-white p-1 shadow-xl">
                  <button role="menuitem" type="button" disabled={!study.details} onClick={() => { setMenuOpen(false); setConfirm("all"); }}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
                    <RefreshCw className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                    <span><span className="block text-sm font-medium text-slate-900">Regenerate drafts</span><span className="block text-xs text-slate-500">New EDC, timeline and questionnaire drafts</span></span>
                  </button>
                  <button role="menuitem" type="button" disabled={!study.protocol_text} onClick={() => { setMenuOpen(false); setConfirm("parse"); }}
                    className="flex w-full items-start gap-2 rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:opacity-50">
                    <FileSearch className="mt-0.5 h-4 w-4 shrink-0 text-violet-700" />
                    <span><span className="block text-sm font-medium text-slate-900">Re-parse protocol</span><span className="block text-xs text-slate-500">Re-read the protocol into the overview</span></span>
                  </button>
                </div>
              )}
            </div>
            <Button size="lg" disabled={!canFinish} loading={finishing} onClick={() => void complete()}>
              Setup complete: go to Recruitment <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      <ConfirmDialog open={confirm === "all"} title="Regenerate drafts?" confirmLabel="Regenerate" tone="danger" onCancel={() => setConfirm(null)} onConfirm={() => void regenerateAll()}>
        <p><strong className="font-semibold text-slate-800">Replaced:</strong> AI-drafted EDC fields, the whole visit timeline (including any visit edits) and AI-suggested questionnaires.</p>
        <p><strong className="font-semibold text-slate-800">Kept:</strong> fields you edited or added, uploaded questionnaires, and the study overview.</p>
      </ConfirmDialog>
      <ConfirmDialog open={confirm === "parse"} title="Re-parse the protocol?" confirmLabel="Re-parse" tone="danger" onCancel={() => setConfirm(null)} onConfirm={() => void reparse()}>
        <p><strong className="font-semibold text-slate-800">Replaced:</strong> the study overview, including any edits you made to it.</p>
        <p><strong className="font-semibold text-slate-800">Kept:</strong> EDC fields, timeline and questionnaires.</p>
      </ConfirmDialog>
    </div>
  );
}
