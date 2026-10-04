import { cookies } from "next/headers";
import { db } from "@/lib/db/server";
import type { Study } from "@/lib/db/types";
import { STUDY_COOKIE, UUID_RE } from "@/lib/studyCookie";

/**
 * Resolve the current study: `?study=` wins, then the remembered study cookie (set by the header study switcher),
 * then the most recent study. A stale or unknown id falls through to the next option. Server-only.
 */
export async function getCurrentStudy(studyParam?: string | string[] | null): Promise<Study | null> {
  const param = Array.isArray(studyParam) ? studyParam[0] : studyParam;
  let remembered: string | undefined;
  try { remembered = (await cookies()).get(STUDY_COOKIE)?.value; } catch { /* no request context */ }

  for (const id of [param, remembered]) {
    if (!id || !UUID_RE.test(id)) continue;
    const { data } = await db().from("study").select("*").eq("id", id).maybeSingle();
    if (data) return data as Study;
  }
  const { data } = await db().from("study").select("*").order("created_at", { ascending: false }).limit(1).maybeSingle();
  return (data as Study | null) ?? null;
}
