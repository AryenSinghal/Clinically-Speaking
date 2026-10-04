"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, ClipboardList, FileText, Sparkles, Upload, Wand2 } from "lucide-react";
import clsx from "clsx";
import { Button, Callout, Card, Stat, inputCls } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import type { FormField, Questionnaire, Visit } from "@/lib/db/types";
import { api, errText, runGeneration } from "./api";
import { ErrorBanner } from "./bits";
import { INITIAL_STEPS, Stepper, useStepper } from "./Progress";

type Phase = "idle" | "running" | "done";
type Summary = { fields: number; visits: number; questionnaires: number };

const EXPLAIN = [
  { icon: Upload, title: "Add your protocol", body: "Drop a PDF, paste text, or start from our sample." },
  { icon: Wand2, title: "AI drafts everything", body: "Study overview, EDC template, visit timeline and call questionnaires." },
  { icon: ClipboardList, title: "Review and edit", body: "Change anything, then continue to recruitment." },
];

export function UploadPanel() {
  const router = useRouter();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);
  const [text, setText] = useState("");
  const [pasteOpen, setPasteOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("idle");
  const [failed, setFailed] = useState(false);
  const [source, setSource] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [studyId, setStudyId] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const { steps, times, startedAt, setStep, reset } = useStepper();

  async function start(body: FormData, label: string) {
    setPhase("running"); setError(null); setStudyId(null); setSummary(null); setSource(label);
    reset({ ...INITIAL_STEPS, parse: "active" });
    let id: string | null = null;
    try {
      try {
        const r = await api<{ studyId: string }>("/api/setup/ingest", { method: "POST", body });
        id = r.studyId; setStudyId(id);
      } catch (e) { setStep("parse", "error"); throw e; }
      await runGeneration(id, setStep, false);
      setStep("parse", "done");
      let s: Summary = { fields: 0, visits: 0, questionnaires: 0 };
      try {
        const d = await api<{ fields: FormField[]; visits: Visit[]; questionnaires: Questionnaire[] }>(`/api/setup/state?study=${id}`);
        s = { fields: d.fields.length, visits: d.visits.length, questionnaires: d.questionnaires.length };
      } catch { /* summary is cosmetic */ }
      setSummary(s); setPhase("done");
      toast("Study drafted. Review and edit anything before continuing.", "success");
      setTimeout(() => { router.push(`/setup?study=${id}`); router.refresh(); }, 1600);
    } catch (e) {
      setError(errText(e));
      setFailed(true);
    }
  }

  function begin(body: FormData, label: string) { setFailed(false); void start(body, label); }
  function onFile(f: File | undefined | null) {
    if (!f) return;
    const fd = new FormData(); fd.set("file", f); begin(fd, f.name);
  }
  function onText() {
    const fd = new FormData(); fd.set("text", text); begin(fd, "Pasted text");
  }
  async function useSample() {
    setError(null);
    for (const [url, name, type] of [["/sample-protocol.pdf", "sample-protocol.pdf", "application/pdf"], ["/sample-protocol.txt", "sample-protocol.txt", "text/plain"]] as const) {
      try {
        const res = await fetch(url);
        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok || ct.includes("text/html")) continue;
        const blob = await res.blob();
        const fd = new FormData(); fd.set("file", new File([blob], name, { type }));
        begin(fd, "Sample protocol");
        return;
      } catch { /* try next */ }
    }
    setError("No sample protocol is available yet (expected /sample-protocol.pdf). Upload a file or paste text instead.");
  }
  function tryAgain() { setPhase("idle"); setError(null); setFailed(false); setStudyId(null); }

  if (phase !== "idle") {
    const done = phase === "done";
    return (
      <Card>
        <div className="mx-auto max-w-lg py-2">
          <div className="mb-5 flex items-start gap-3">
            <div className={clsx("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", done ? "bg-emerald-100 text-emerald-700" : failed ? "bg-red-100 text-red-700" : "bg-violet-100 text-violet-700")}>
              {done ? <CheckCircle2 className="h-5 w-5" /> : <Sparkles className="h-5 w-5" />}
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-slate-900">{done ? "Your study is ready" : failed ? "Setup did not finish" : "Drafting your study"}</h2>
              <p className="text-sm text-slate-600">
                {done ? "Opening the study for review..." : failed ? "See below for what to try next." : <>Reading <span className="font-medium text-slate-800">{source}</span>. This takes about 10–20 seconds.</>}
              </p>
            </div>
          </div>

          {!done && <Stepper steps={steps} times={times} startedAt={startedAt} />}

          {done && summary && (
            <div className="grid grid-cols-3 gap-3" aria-label="Generation summary">
              <Stat label="EDC fields" value={summary.fields} tone="green" />
              <Stat label="Visits" value={summary.visits} tone="green" />
              <Stat label="Questionnaires" value={summary.questionnaires} tone="green" />
            </div>
          )}

          {failed && error && (
            <div className="mt-5">
              <ErrorBanner error={error} />
              <div className="flex flex-wrap justify-end gap-2">
                {studyId && <Button variant="secondary" onClick={() => router.push(`/setup?study=${studyId}`)}>Open study anyway</Button>}
                <Button onClick={tryAgain}>Try again</Button>
              </div>
            </div>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <ol className="grid gap-3 sm:grid-cols-3">
        {EXPLAIN.map((s, i) => (
          <li key={s.title} className="flex gap-3 rounded-xl border border-slate-200 bg-white p-4">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-violet-100 text-violet-700"><s.icon className="h-4 w-4" /></span>
            <div className="min-w-0">
              <div className="text-sm font-semibold text-slate-900"><span className="mr-1 text-violet-700">{i + 1}.</span>{s.title}</div>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-600">{s.body}</p>
            </div>
          </li>
        ))}
      </ol>

      {error && <ErrorBanner error={error} onClose={() => setError(null)} />}

      <div className="grid gap-4 lg:grid-cols-5">
        <div
          role="button" tabIndex={0} aria-label="Upload protocol: drop a file here or press Enter to browse"
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); onFile(e.dataTransfer.files[0]); }}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileRef.current?.click(); } }}
          className={clsx("flex min-h-64 cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-10 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 lg:col-span-3",
            drag ? "scale-[1.01] border-violet-500 bg-violet-50" : "border-slate-300 bg-white hover:border-violet-400 hover:bg-violet-50/40")}
        >
          <span className={clsx("mb-4 flex h-14 w-14 items-center justify-center rounded-full transition", drag ? "bg-violet-600 text-white" : "bg-violet-100 text-violet-700")}><Upload className="h-6 w-6" /></span>
          <p className="text-lg font-semibold text-slate-900">{drag ? "Release to upload" : "Drop your protocol here"}</p>
          <p className="mt-1 text-sm text-slate-600">or <span className="font-medium text-violet-700 underline underline-offset-2">browse files</span></p>
          <p className="mt-3 text-xs text-slate-500">PDF, .txt or .md, up to 15 MB</p>
          <input ref={fileRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain" className="hidden" tabIndex={-1}
            onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </div>

        <div className="flex flex-col justify-between rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-white p-6 lg:col-span-2">
          <div>
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-violet-700 text-white"><FileText className="h-5 w-5" /></span>
            <h2 className="text-base font-semibold text-slate-900">Try the sample protocol</h2>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">No file handy? Generate a complete study setup from a ready-made protocol in one click.</p>
          </div>
          <Button size="lg" className="mt-5 w-full" onClick={() => void useSample()}>
            Try the sample protocol <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <Card
        title="Or paste protocol text"
        subtitle="Title, condition, eligibility criteria, visit schedule, endpoints"
        actions={<Button variant="ghost" size="sm" aria-expanded={pasteOpen} onClick={() => setPasteOpen((o) => !o)}>{pasteOpen ? "Hide" : "Paste text"}</Button>}
        padded={pasteOpen}
      >
        {pasteOpen && (
          <>
            <textarea className={clsx(inputCls, "h-40 font-mono text-xs")} value={text} onChange={(e) => setText(e.target.value)} aria-label="Protocol text"
              placeholder="Paste the protocol, synopsis or study details here..." autoFocus />
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-xs text-slate-500">{text.trim().length < 40 ? `${Math.max(0, 40 - text.trim().length)} more characters needed` : `${text.trim().length.toLocaleString()} characters`}</span>
              <Button disabled={text.trim().length < 40} onClick={onText}>Generate setup</Button>
            </div>
          </>
        )}
      </Card>

      <Callout tone="info" icon={<Sparkles className="h-4 w-4" />} title="Everything stays editable">
        AI output is a first draft. You can edit, add or remove any field, visit or question before moving on.
      </Callout>
    </div>
  );
}
