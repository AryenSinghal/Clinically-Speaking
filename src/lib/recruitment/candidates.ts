import { db } from "@/lib/db/server";
import type { Candidate } from "@/lib/db/types";

const UUID = /^[0-9a-f-]{36}$/i;

/** Shared registry (study_id null) plus candidates already linked to this study. Server-only. */
export async function listCandidates(studyId: string | null): Promise<Candidate[]> {
  let q = db().from("candidate").select("*");
  q = studyId && UUID.test(studyId) ? q.or(`study_id.is.null,study_id.eq.${studyId}`) : q.is("study_id", null);
  const { data, error } = await q.order("created_at", { ascending: true }).order("id", { ascending: true }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Candidate[];
}
