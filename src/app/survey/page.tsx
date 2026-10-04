import { Button, EmptyState, PageHeader } from "@/components/ui";
import Link from "next/link";
import { Database, FileText } from "lucide-react";
import { db } from "@/lib/db/server";
import { getCurrentStudy } from "@/lib/study";
import { SurveyBoard } from "@/components/survey/SurveyBoard";
import type { Call, Candidate, Study, Visit } from "@/lib/db/types";

export const dynamic = "force-dynamic";

export default async function SurveyPage({ searchParams }: { searchParams: Promise<{ [key: string]: string | string[] | undefined }> }) {
  const sp = await searchParams;
  let study: Study | null = null;
  let visits: Visit[] = [];
  let candidates: Candidate[] = [];
  let calls: Call[] = [];
  let failed = false;
  try {
    study = await getCurrentStudy(sp.study);
    if (study) {
      const c = db();
      const [v, cand, cl] = await Promise.all([
        c.from("visit").select("*").eq("study_id", study.id).order("position").order("day_offset"),
        c.from("candidate").select("*").eq("study_id", study.id).eq("status", "enrolled").order("name"),
        c.from("call").select("*").eq("study_id", study.id).in("kind", ["survey", "reminder"]).order("created_at", { ascending: false }),
      ]);
      visits = (v.data ?? []) as Visit[];
      candidates = (cand.data ?? []) as Candidate[];
      calls = (cl.data ?? []) as Call[];
    }
  } catch {
    failed = true;
  }

  if (failed || !study) {
    return (
      <div>
        <PageHeader eyebrow="Step 3" title="Survey pipeline" />
        <EmptyState
          icon={failed ? <Database className="h-5 w-5" /> : <FileText className="h-5 w-5" />}
          title={failed ? "Could not reach the database" : "No study yet"}
          body={failed ? "Check your Supabase env vars and try again." : "Create a study in Setup first, then enroll participants to run follow-up surveys."}
          action={failed ? undefined : <Link href="/setup"><Button>Go to Setup</Button></Link>}
        />
      </div>
    );
  }
  return <SurveyBoard study={study} visits={visits} candidates={candidates} calls={calls} />;
}
