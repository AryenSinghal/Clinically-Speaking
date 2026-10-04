import { db } from "@/lib/db/server";
import { getCurrentStudy } from "@/lib/study";
import type { FormField, Questionnaire, Study, Visit } from "@/lib/db/types";
import { Callout, PageHeader } from "@/components/ui";
import { SetupClient } from "@/components/setup/SetupClient";
import { UploadPanel } from "@/components/setup/UploadPanel";

export const dynamic = "force-dynamic";

export default async function SetupPage({ searchParams }: { searchParams: Promise<{ [k: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  const forceNew = sp.new === "1";
  let study: Study | null = null;
  let loadError: string | null = null;
  if (!forceNew) {
    try { study = await getCurrentStudy(sp.study); } catch (e) { loadError = e instanceof Error ? e.message : String(e); }
  }

  if (!study) {
    return (
      <main className="mx-auto w-full max-w-4xl px-4 py-8">
        <PageHeader
          eyebrow="Study setup"
          title="Turn a protocol into a ready-to-run study"
          subtitle="Add your protocol and we will draft the study overview, EDC template, visit timeline and call questionnaires for you to review."
        />
        {loadError && <div className="mb-4"><Callout tone="danger" title="Could not load existing studies">{loadError}</Callout></div>}
        <UploadPanel />
      </main>
    );
  }

  const d = db();
  const [f, v, q] = await Promise.all([
    d.from("form_field").select("*").eq("study_id", study.id).order("position"),
    d.from("visit").select("*").eq("study_id", study.id).order("position"),
    d.from("questionnaire").select("*").eq("study_id", study.id).order("created_at"),
  ]);
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-6">
      <SetupClient
        key={study.id}
        study={study}
        fields={(f.data ?? []) as FormField[]}
        visits={(v.data ?? []) as Visit[]}
        questionnaires={(q.data ?? []) as Questionnaire[]}
      />
    </main>
  );
}
