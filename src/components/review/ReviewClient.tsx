"use client";
import { AlertTriangle, CheckCircle2, ChevronLeft, Clock, Loader2, PhoneCall, RefreshCw, ShieldAlert, User, XCircle } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { browserDb } from "@/lib/db/client";
import type { Call, Candidate, FieldValue, FormField, TranscriptEvent } from "@/lib/db/types";
import { Badge, Button, Callout, Card, flagLabel, flagMeta } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import { EdcFieldList, type FieldRow } from "./EdcFieldList";
import { LiveIndicator, LiveTranscript } from "./LiveTranscript";
import { TranscriptPane } from "./TranscriptPane";
import { When } from "./Time";
import { fmtDuration, hasAnswer, isLive, kindLabel } from "./util";

export type ReviewInitial = {
  call: Call; events: TranscriptEvent[]; values: FieldValue[]; fields: FormField[];
  candidateName: string | null; candidate?: Pick<Candidate, "name" | "age" | "sex" | "city" | "state"> | null;
};

const statusLabel: Record<Call["status"], string> = {
  queued: "Dialing", ringing: "Ringing", in_progress: "In progress", ended: "Ended", failed: "Failed", extracting: "Analysing", complete: "Complete",
};

/** Headline for a non-escalated outcome, worded for the type of call. */
function outcomeTitle(kind: Call["kind"], flag: NonNullable<Call["flag"]>): string {
  const good = flag === "good";
  if (kind === "reminder") return good ? "Confirmed they will attend the visit" : "Cannot attend: the study team should reschedule";
  if (kind === "survey") return good ? "Check-in completed, nothing concerning" : "Check-in not completed";
  if (kind === "confirmation") return good ? "Confirmed and enrolled" : "Declined to join";
  return good ? "Eligible and willing to continue" : "Not eligible or declined";
}

export function ReviewClient({ initial }: { initial: ReviewInitial }) {
  const { toast } = useToast();
  const [call, setCall] = useState(initial.call);
  const [events, setEvents] = useState(initial.events);
  const [values, setValues] = useState(initial.values);
  const fields = initial.fields;
  const [selected, setSelected] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<{ start: number; end: number } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const callId = initial.call.id;

  const refetch = useCallback(async () => {
    const sb = browserDb();
    const [c, e, v] = await Promise.all([
      sb.from("call").select("*").eq("id", callId).maybeSingle(),
      sb.from("transcript_event").select("*").eq("call_id", callId).order("seq", { ascending: true }),
      sb.from("field_value").select("*").eq("call_id", callId),
    ]);
    if (c.data) setCall(c.data as Call);
    if (e.data) setEvents(e.data as TranscriptEvent[]);
    if (v.data) setValues(v.data as FieldValue[]);
  }, [callId]);

  // Realtime (debounced refetch) + slow poll safety net while the call is not finished.
  useEffect(() => {
    const sb = browserDb();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const schedule = () => { if (timer) clearTimeout(timer); timer = setTimeout(() => { void refetch(); }, 250); };
    const ch = sb.channel(`review-${callId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "transcript_event", filter: `call_id=eq.${callId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "field_value", filter: `call_id=eq.${callId}` }, schedule)
      .on("postgres_changes", { event: "*", schema: "public", table: "call", filter: `id=eq.${callId}` }, schedule)
      .subscribe();
    void refetch();
    return () => { if (timer) clearTimeout(timer); void sb.removeChannel(ch); };
  }, [callId, refetch]);

  const done = call.status === "complete" || call.status === "failed";
  useEffect(() => {
    if (done) return;
    const t = setInterval(() => { void refetch(); }, 4000);
    return () => clearInterval(t);
  }, [done, refetch]);

  const rows: FieldRow[] = useMemo(() => {
    const byField = new Map(values.map((v) => [v.field_id, v]));
    return fields.map((f) => ({ field: f, value: byField.get(f.id) ?? null }));
  }, [fields, values]);

  function selectRow(r: FieldRow) {
    const v = r.value;
    if (!v) return;
    setSelected(r.field.id);
    let start = v.evidence_start_ms, end = v.evidence_end_ms;
    if (start == null && v.evidence_quote) {
      const q = v.evidence_quote.toLowerCase().trim();
      const hit = events.find((e) => e.text.toLowerCase().includes(q));
      if (hit?.start_ms != null) { start = hit.start_ms; end = hit.end_ms ?? hit.start_ms; }
    }
    if (start != null) {
      setEvidence({ start, end: end ?? start });
    } else setEvidence(null);
  }

  async function patchValue(valueId: string, value: string, status: "confirmed" | "corrected") {
    const res = await fetch("/api/review/field-value", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: valueId, value: status === "corrected" ? value : undefined, review_status: status }) });
    const j = (await res.json()) as { ok: boolean; error?: string };
    if (!j.ok) throw new Error(j.error ?? "Failed");
  }
  const apply = (valueId: string, value: string, status: "confirmed" | "corrected") =>
    setValues((vs) => vs.map((v) => (v.id === valueId ? { ...v, value: status === "corrected" ? value : v.value, review_status: status } : v)));

  async function review(valueId: string, value: string, status: "confirmed" | "corrected") {
    setBusyId(valueId);
    const prev = values;
    apply(valueId, value, status);
    try {
      await patchValue(valueId, value, status);
      toast(status === "corrected" ? "Answer corrected" : "Answer confirmed", "success");
    } catch (e) {
      setValues(prev);
      toast(e instanceof Error ? `Could not save: ${e.message}` : "Could not save", "error");
    } finally { setBusyId(null); }
  }

  async function confirmAll() {
    const todo = values.filter((v) => hasAnswer(v) && v.review_status === "pending");
    if (!todo.length) return;
    setConfirmingAll(true);
    const prev = values;
    todo.forEach((v) => apply(v.id, v.value ?? "", "confirmed"));
    const results = await Promise.allSettled(todo.map((v) => patchValue(v.id, v.value ?? "", "confirmed")));
    const failedIds = new Set(todo.filter((_, i) => results[i].status === "rejected").map((v) => v.id));
    if (failedIds.size) setValues((vs) => vs.map((v) => (failedIds.has(v.id) ? prev.find((p) => p.id === v.id) ?? v : v)));
    toast(failedIds.size ? `${todo.length - failedIds.size} confirmed, ${failedIds.size} failed` : `Confirmed ${todo.length} answer${todo.length === 1 ? "" : "s"}`, failedIds.size ? "error" : "success");
    setConfirmingAll(false);
  }

  async function resolve(resolved: boolean) {
    setResolving(true);
    const prev = call.escalation_resolved;
    setCall((c) => ({ ...c, escalation_resolved: resolved }));
    try {
      const res = await fetch("/api/escalations", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ callId, resolved }) });
      const j = (await res.json()) as { ok: boolean; error?: string };
      if (!j.ok) throw new Error(j.error ?? "Failed");
      toast(resolved ? "Escalation marked resolved" : "Escalation reopened", "success");
    } catch (e) {
      setCall((c) => ({ ...c, escalation_resolved: prev }));
      toast(e instanceof Error ? e.message : "Could not update escalation", "error");
    } finally { setResolving(false); }
  }

  async function retry() {
    setRetrying(true);
    const res = await fetch(`/api/calls/${callId}/retry-extraction`, { method: "POST" }).catch(() => null);
    if (!res || !res.ok) toast("Could not start extraction", "error");
    else { toast("Re-running extraction", "info"); void refetch(); }
    setRetrying(false);
  }

  const live = isLive(call.status);
  const escalate = call.flag === "escalate";
  const escalated = escalate && !call.escalation_resolved;
  const studyQ = call.study_id ? `?study=${call.study_id}` : "";
  const crumb = escalate ? { href: `/escalations${studyQ}`, label: "Escalations" }
    : call.kind === "survey" ? { href: `/survey${studyQ}`, label: "Survey" } : { href: `/recruitment${studyQ}`, label: "Recruitment" };
  const name = initial.candidate?.name ?? initial.candidateName;
  const duration = fmtDuration(call.started_at, call.ended_at);
  const sub = [initial.candidate?.age ? `${initial.candidate.age} y` : null, initial.candidate?.sex, [initial.candidate?.city, initial.candidate?.state].filter(Boolean).join(", ") || null].filter(Boolean).join(" / ");

  return (
    <div className="space-y-5">
      <header>
        <Link href={crumb.href} className="mb-2 inline-flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-violet-700"><ChevronLeft className="h-4 w-4" />{crumb.label}</Link>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700"><User className="h-4 w-4" /></span>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{name ?? "Unknown participant"}</h1>
              {call.flag && <Badge tone={escalate ? (escalated ? "red" : "gray") : flagMeta[call.flag].tone} dot>{escalate && !escalated ? "Escalation resolved" : flagLabel(call.flag, call.kind)}</Badge>}
              {live && <LiveIndicator />}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-600">
              <span className="inline-flex items-center gap-1"><PhoneCall className="h-3.5 w-3.5 text-slate-400" />{kindLabel[call.kind]} call</span>
              <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5 text-slate-400" /><When iso={call.started_at ?? call.created_at} />{duration && <span className="text-slate-400">&middot; {duration}</span>}</span>
              {!live && <Badge tone={call.status === "failed" ? "red" : call.status === "complete" ? "green" : "violet"}>{statusLabel[call.status]}</Badge>}
              {sub && <span className="text-slate-500">{sub}</span>}
            </div>
          </div>
          {(call.status === "ended" || call.status === "complete") && (
            <Button variant="secondary" size="sm" loading={retrying} onClick={retry}><RefreshCw className="h-3 w-3" />Re-run extraction</Button>
          )}
        </div>
      </header>

      {escalate && (
        <Callout
          tone={escalated ? "danger" : "success"}
          icon={escalated ? <ShieldAlert className="h-5 w-5 text-red-600" /> : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
          title={escalated ? "Escalation: needs human attention" : "Escalation resolved"}
          actions={<Button variant={escalated ? "danger" : "secondary"} loading={resolving} onClick={() => resolve(!call.escalation_resolved)}>{escalated ? "Mark resolved" : "Reopen"}</Button>}
        >
          {call.flag_reason && <p className="font-medium">{call.flag_reason}</p>}
          {call.summary && <p className="mt-1 opacity-90">{call.summary}</p>}
          {escalated && <p className="mt-2 text-xs font-semibold uppercase tracking-wide opacity-80">Suggested action: a study nurse should call the participant to follow up.</p>}
        </Callout>
      )}
      {call.flag && !escalate && (
        <Callout tone={call.flag === "good" ? "success" : "warn"} icon={call.flag === "good" ? <CheckCircle2 className="h-5 w-5 text-emerald-600" /> : <XCircle className="h-5 w-5 text-amber-600" />} title={outcomeTitle(call.kind, call.flag)}>
          {call.flag_reason && <p className="font-medium">{call.flag_reason}</p>}
          {call.summary && <p className="mt-1 opacity-90">{call.summary}</p>}
        </Callout>
      )}
      {!call.flag && call.summary && <Callout title="Summary">{call.summary}</Callout>}

      {call.status === "extracting" && (
        <Callout icon={<Loader2 className="h-4 w-4 animate-spin text-violet-600" />}>Extracting answers from the transcript&hellip;</Callout>
      )}
      {call.status === "failed" && (
        <Callout tone="danger" icon={<AlertTriangle className="h-4 w-4 text-red-600" />} title="This call failed">{call.flag_reason ?? "The call did not complete."}</Callout>
      )}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="order-2 lg:sticky lg:top-20 lg:order-1">
          <Card title="Transcript" subtitle={live ? undefined : "The highlighted turn shows where the selected answer came from"} padded={false}>
            {live
              ? <LiveTranscript events={events} status={call.status} />
              : <TranscriptPane tall events={events} activeSeq={null} evidence={evidence} />}
          </Card>
        </div>
        <div className="order-1 lg:order-2">
          <EdcFieldList rows={rows} loading={call.status === "extracting"} selectedFieldId={selected} onSelect={selectRow} onReview={review} onConfirmAll={confirmAll} busyId={busyId} confirmingAll={confirmingAll} />
        </div>
      </div>
    </div>
  );
}
