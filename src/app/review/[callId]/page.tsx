import { notFound } from "next/navigation";
import { db } from "@/lib/db/server";
import type { Call, Candidate, FieldValue, FormField, TranscriptEvent } from "@/lib/db/types";
import { ReviewClient } from "@/components/review/ReviewClient";

export const dynamic = "force-dynamic";

export default async function ReviewPage({ params }: { params: Promise<{ callId: string }> }) {
  const { callId } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(callId)) notFound();
  const sb = db();
  const { data: c } = await sb.from("call").select("*").eq("id", callId).maybeSingle();
  const call = c as Call | null;
  if (!call) notFound();
  const [ev, vals, ff, cand] = await Promise.all([
    sb.from("transcript_event").select("*").eq("call_id", callId).order("seq", { ascending: true }),
    sb.from("field_value").select("*").eq("call_id", callId),
    call.study_id ? sb.from("form_field").select("*").eq("study_id", call.study_id).order("position", { ascending: true }) : Promise.resolve({ data: [] }),
    call.candidate_id ? sb.from("candidate").select("name,age,sex,city,state").eq("id", call.candidate_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  return (
    <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
      <ReviewClient
        initial={{
          call,
          events: (ev.data ?? []) as TranscriptEvent[],
          values: (vals.data ?? []) as FieldValue[],
          fields: (ff.data ?? []) as FormField[],
          candidateName: (cand.data as Pick<Candidate, "name"> | null)?.name ?? null,
          candidate: (cand.data as Pick<Candidate, "name" | "age" | "sex" | "city" | "state"> | null) ?? null,
        }}
      />
    </main>
  );
}
