"use client";
import { useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ClipboardList, Pencil, Plus, Trash2, Upload } from "lucide-react";
import clsx from "clsx";
import { Badge, Button, Callout, Card, EmptyState, Spinner, inputCls } from "@/components/ui";
import { useToast } from "@/components/toast/Toast";
import type { FormField, Questionnaire } from "@/lib/db/types";
import type { QuestionnaireItem } from "@/lib/schemas";
import { api, errText, plural } from "./api";
import { Chip, ErrorBanner, InlineDelete, Labeled } from "./bits";

type Kind = Questionnaire["kind"];
type Patch = Partial<Pick<Questionnaire, "title" | "kind" | "items">>;
const KIND_LABEL: Record<Kind, string> = { recruitment: "Recruitment", follow_up: "Follow-up" };
const TYPE_LABEL: Record<QuestionnaireItem["response_type"], string> = { yes_no: "Yes / No", number: "Number", scale: "Scale", text: "Free text", choice: "Choice" };

export function QuestionnaireEditor({ studyId, fields, questionnaires, onQuestionnaires }: {
  studyId: string; fields: FormField[]; questionnaires: Questionnaire[]; onQuestionnaires: (q: Questionnaire[]) => void;
}) {
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [text, setText] = useState("");
  const [kind, setKind] = useState<Kind>("follow_up");
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const replace = (q: Questionnaire) => onQuestionnaires(questionnaires.map((x) => (x.id === q.id ? q : x)));

  async function save(id: string, patch: Patch) {
    const r = await api<{ questionnaire: Questionnaire }>("/api/setup/questionnaires", { method: "PATCH", json: { id, patch } });
    replace(r.questionnaire);
    toast("Questionnaire saved", "success");
  }
  async function remove(id: string) {
    try { await api(`/api/setup/questionnaires?id=${id}`, { method: "DELETE" }); onQuestionnaires(questionnaires.filter((q) => q.id !== id)); toast("Questionnaire deleted", "info"); }
    catch (e) { setError(errText(e)); }
  }
  async function create(k: Kind) {
    try {
      const r = await api<{ questionnaire: Questionnaire }>("/api/setup/questionnaires", { method: "POST", json: { studyId, questionnaire: { kind: k, title: `${KIND_LABEL[k]} questionnaire`, items: [] } } });
      onQuestionnaires([...questionnaires, r.questionnaire]);
    } catch (e) { setError(errText(e)); }
  }
  async function upload(file: File | null) {
    if (!file && text.trim().length < 5) return;
    setUploading(true); setError(null);
    try {
      const fd = new FormData();
      fd.set("studyId", studyId); fd.set("kind", kind);
      if (file) fd.set("file", file); else fd.set("text", text);
      const r = await api<{ questionnaire: Questionnaire }>("/api/setup/questionnaires/upload", { method: "POST", body: fd });
      onQuestionnaires([...questionnaires, r.questionnaire]); setText("");
      toast(`Parsed ${plural(r.questionnaire.items.length, "question")} and mapped them to EDC fields`, "success");
    } catch (e) { setError(errText(e)); }
    finally { setUploading(false); }
  }

  const unmapped = questionnaires.flatMap((q) => q.items).filter((i) => !i.target_field_key).length;

  return (
    <div className="space-y-4">
      <ErrorBanner error={error} onClose={() => setError(null)} />
      {unmapped > 0 && (
        <Callout tone="warn" icon={<AlertTriangle className="h-4 w-4" />} title={`${plural(unmapped, "question")} not mapped to an EDC field`}>
          Answers to unmapped questions will not be extracted into the EDC. Open a questionnaire and pick a target field.
        </Callout>
      )}
      {questionnaires.map((q) => <QCard key={q.id} q={q} fields={fields} onSave={(p) => save(q.id, p)} onDelete={() => void remove(q.id)} />)}
      {questionnaires.length === 0 && (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No questionnaires yet" body="Regenerate drafts, start a blank one, or upload your own below." />
      )}

      <Card title="Add your own questionnaire" subtitle="Upload a file or paste text. Gemini structures it and maps answers to EDC fields."
        actions={<Button variant="secondary" size="sm" onClick={() => void create(kind)}><Plus className="h-3.5 w-3.5" />Blank</Button>}>
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <span className="text-xs font-medium text-slate-500">Used for</span>
          <div role="group" aria-label="Questionnaire kind" className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
            {(["follow_up", "recruitment"] as const).map((k) => (
              <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)}
                className={clsx("rounded-md px-3 py-1 text-xs font-medium transition focus-visible:outline-2 focus-visible:outline-violet-600", kind === k ? "bg-violet-700 text-white" : "text-slate-600 hover:bg-slate-50")}>
                {KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <span className="text-xs text-slate-500">{kind === "recruitment" ? "Screening call; can include disqualifying answers" : "Survey calls on the timeline"}</span>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div role="button" tabIndex={0} aria-label="Upload questionnaire file"
            onDragOver={(e) => { e.preventDefault(); setDrag(true); }} onDragLeave={() => setDrag(false)}
            onDrop={(e) => { e.preventDefault(); setDrag(false); const f = e.dataTransfer.files[0]; if (f) void upload(f); }}
            onClick={() => !uploading && fileRef.current?.click()}
            onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !uploading) { e.preventDefault(); fileRef.current?.click(); } }}
            className={clsx("flex min-h-32 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed px-4 py-6 text-center transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600",
              drag ? "border-violet-500 bg-violet-50" : "border-slate-300 hover:border-violet-400 hover:bg-violet-50/40")}>
            {uploading ? <><Spinner className="h-5 w-5" /><p className="mt-2 text-sm text-slate-600">Parsing questionnaire...</p></> : (
              <>
                <Upload className="mb-2 h-5 w-5 text-violet-700" />
                <p className="text-sm font-medium text-slate-800">Drop a file or click to browse</p>
                <p className="mt-0.5 text-xs text-slate-500">.txt, .json, .csv, .md or .pdf</p>
              </>
            )}
            <input ref={fileRef} type="file" accept=".txt,.json,.csv,.md,.pdf" className="hidden" tabIndex={-1}
              onChange={(e) => { const f = e.target.files?.[0] ?? null; e.target.value = ""; if (f) void upload(f); }} />
          </div>
          <div className="flex flex-col">
            <textarea className={inputCls + " min-h-32 flex-1 font-mono text-xs"} value={text} onChange={(e) => setText(e.target.value)} aria-label="Questionnaire text"
              placeholder={"Or paste questions here:\n1. Have you been diagnosed with type 2 diabetes?\n2. On a scale of 0-10, how would you rate your pain today?"} />
            <div className="mt-2 flex justify-end">
              <Button loading={uploading} disabled={text.trim().length < 5} onClick={() => void upload(null)}>{uploading ? "Parsing..." : "Parse pasted text"}</Button>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function TargetChip({ item, keys }: { item: QuestionnaireItem; keys: Set<string> }) {
  if (!item.target_field_key) return <Chip tone="amber"><AlertTriangle className="h-3 w-3" />No EDC field</Chip>;
  if (!keys.has(item.target_field_key)) return <Chip tone="red" mono><AlertTriangle className="h-3 w-3" />{item.target_field_key} (missing)</Chip>;
  return <Chip tone="green" mono>{item.target_field_key}</Chip>;
}

function QCard({ q, fields, onSave, onDelete }: { q: Questionnaire; fields: FormField[]; onSave: (p: Patch) => Promise<void>; onDelete: () => void }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(q.title);
  const [qKind, setQKind] = useState<Kind>(q.kind);
  const [items, setItems] = useState<QuestionnaireItem[]>(q.items);
  const [prev, setPrev] = useState(q);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  if (prev !== q) { setPrev(q); setTitle(q.title); setQKind(q.kind); setItems(q.items); }
  const dirty = title !== q.title || qKind !== q.kind || JSON.stringify(items) !== JSON.stringify(q.items);
  const keys = new Set(fields.map((f) => f.key));
  const problems = q.items.filter((i) => !i.target_field_key || !keys.has(i.target_field_key)).length;

  const setItem = (i: number, p: Partial<QuestionnaireItem>) => setItems(items.map((it, j) => (j === i ? { ...it, ...p } : it)));
  const move = (i: number, d: -1 | 1) => {
    const j = i + d; if (j < 0 || j >= items.length) return;
    const n = [...items]; [n[i], n[j]] = [n[j], n[i]]; setItems(n);
  };
  const addItem = () => {
    let n = items.length + 1; const ids = new Set(items.map((i) => i.id));
    while (ids.has(`q${n}`)) n++;
    setItems([...items, { id: `q${n}`, prompt: "", response_type: "yes_no", choices: null, target_field_key: null, disqualifying_answer: null }]);
  };
  function cancel() { setTitle(q.title); setQKind(q.kind); setItems(q.items); setErr(null); setEditing(false); }
  async function doSave() {
    setSaving(true); setErr(null);
    try {
      await onSave({ title: title.trim() || q.title, kind: qKind, items: items.map((it) => ({ ...it, choices: it.response_type === "choice" ? (it.choices ?? []).map((c) => c.trim()).filter(Boolean) : null, disqualifying_answer: qKind === "recruitment" ? it.disqualifying_answer || null : null })) });
      setEditing(false);
    } catch (e) { setErr(errText(e)); }
    finally { setSaving(false); }
  }

  const heading = editing ? (
    <span className="flex flex-wrap items-center gap-2">
      <input className={inputCls + " !w-64 font-semibold"} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Questionnaire title" />
      <select className={inputCls + " !w-32"} value={qKind} onChange={(e) => setQKind(e.target.value as Kind)} aria-label="Kind">
        <option value="recruitment">Recruitment</option><option value="follow_up">Follow-up</option>
      </select>
    </span>
  ) : (
    <span className="flex flex-wrap items-center gap-2">
      {q.title}
      <Badge tone={q.kind === "recruitment" ? "blue" : "gray"}>{KIND_LABEL[q.kind]}</Badge>
      <Badge tone={q.origin === "uploaded" ? "green" : "violet"}>{q.origin === "uploaded" ? "Uploaded" : "AI suggested"}</Badge>
    </span>
  );

  return (
    <Card title={heading} subtitle={!editing ? `${plural(q.items.length, "question")}${problems ? ` · ${problems} need an EDC field` : ""}` : undefined}
      actions={editing ? (
        <>
          <Button variant="secondary" size="sm" onClick={cancel}>Cancel</Button>
          <Button size="sm" loading={saving} disabled={!dirty} onClick={() => void doSave()}>Save changes</Button>
        </>
      ) : (
        <>
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}><Pencil className="h-3.5 w-3.5" />Edit</Button>
          <InlineDelete label={`Delete ${q.title}`} onDelete={onDelete}><Trash2 className="h-4 w-4" /></InlineDelete>
        </>
      )}>
      <ErrorBanner error={err} onClose={() => setErr(null)} />

      {!editing && (
        q.items.length === 0 ? <p className="text-sm text-slate-500">No questions yet. Click Edit to add some.</p> : (
          <ol className="divide-y divide-slate-100">
            {q.items.map((it, i) => (
              <li key={it.id + i} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-slate-100 text-xs font-medium text-slate-600">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-900">{it.prompt || <span className="text-slate-400">(empty question)</span>}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                    <Badge>{TYPE_LABEL[it.response_type]}</Badge>
                    <span aria-hidden className="text-xs text-slate-300">to</span>
                    <TargetChip item={it} keys={keys} />
                    {it.disqualifying_answer && <Chip tone="red">Disqualifies if: <strong className="font-semibold">{it.disqualifying_answer}</strong></Chip>}
                  </div>
                  {it.response_type === "choice" && it.choices && it.choices.length > 0 && (
                    <p className="mt-1.5 text-xs text-slate-500">Choices: {it.choices.join(", ")}</p>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )
      )}

      {editing && (
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={it.id + i} className={clsx("rounded-xl border p-3", it.disqualifying_answer && qKind === "recruitment" ? "border-red-200 bg-red-50/30" : "border-slate-200")}>
              <div className="flex items-start gap-2">
                <span className="mt-1.5 w-6 shrink-0 text-xs font-medium text-slate-400">{i + 1}.</span>
                <textarea className={inputCls + " flex-1"} rows={2} value={it.prompt} aria-label={`Question ${i + 1}`} onChange={(e) => setItem(i, { prompt: e.target.value })} placeholder="Question as the voice agent would ask it" />
                <div className="flex flex-col text-slate-400">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0} aria-label="Move up" className="rounded p-0.5 hover:text-slate-700 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === items.length - 1} aria-label="Move down" className="rounded p-0.5 hover:text-slate-700 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                </div>
                <button type="button" onClick={() => setItems(items.filter((_, j) => j !== i))} className="mt-1 rounded p-0.5 text-slate-400 hover:text-red-600" aria-label="Delete question"><Trash2 className="h-4 w-4" /></button>
              </div>
              <div className="mt-2 grid gap-2 pl-8 md:grid-cols-3">
                <Labeled label="Answer type">
                  <select className={inputCls} value={it.response_type} onChange={(e) => setItem(i, { response_type: e.target.value as QuestionnaireItem["response_type"] })}>
                    {(Object.keys(TYPE_LABEL) as QuestionnaireItem["response_type"][]).map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}
                  </select>
                </Labeled>
                <Labeled label="Populates EDC field">
                  <select className={inputCls} value={it.target_field_key ?? ""} onChange={(e) => setItem(i, { target_field_key: e.target.value || null })}>
                    <option value="">None</option>
                    {it.target_field_key && !keys.has(it.target_field_key) && <option value={it.target_field_key}>{it.target_field_key} (missing)</option>}
                    {fields.map((f) => <option key={f.id} value={f.key}>{f.section}: {f.label}</option>)}
                  </select>
                </Labeled>
                {qKind === "recruitment" && (
                  <Labeled label="Disqualifying answer">
                    <input className={inputCls} value={it.disqualifying_answer ?? ""} placeholder="e.g. yes" onChange={(e) => setItem(i, { disqualifying_answer: e.target.value || null })} />
                  </Labeled>
                )}
                {it.response_type === "choice" && (
                  <Labeled label="Choices (comma separated)" className="md:col-span-3">
                    <input className={inputCls} value={(it.choices ?? []).join(", ")} onChange={(e) => setItem(i, { choices: e.target.value.split(",").map((s) => s.trimStart()) })} />
                  </Labeled>
                )}
              </div>
            </div>
          ))}
          <Button variant="secondary" size="sm" onClick={addItem}><Plus className="h-3.5 w-3.5" />Add question</Button>
        </div>
      )}
    </Card>
  );
}
