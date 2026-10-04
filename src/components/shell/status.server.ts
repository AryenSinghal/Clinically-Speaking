import { db } from "@/lib/db/server";
import { getCurrentStudy } from "@/lib/study";
import { EMPTY_STATUS, type ShellStatus } from "./types";

const SCREENED = ["screened", "invalid", "good", "accepted", "enrolled"];

/** Never throws: returns empty status if Supabase is unconfigured or empty. */
export async function getShellStatus(studyParam?: string | null): Promise<ShellStatus> {
  try {
    const study = await getCurrentStudy(studyParam);
    const client = db();
    if (!study) return { ...EMPTY_STATUS };
    // Scope to the current study so the badge always matches the escalation queue (which is per study).
    const esc = await client.from("call").select("id", { count: "exact", head: true }).eq("study_id", study.id).eq("flag", "escalate").eq("escalation_resolved", false);
    const escalations = esc.count ?? 0;
    const [f, v, c] = await Promise.all([
      client.from("form_field").select("id", { count: "exact", head: true }).eq("study_id", study.id),
      client.from("visit").select("id", { count: "exact", head: true }).eq("study_id", study.id),
      client.from("candidate").select("status").eq("study_id", study.id),
    ]);
    const statuses = (c.data ?? []).map((r) => r.status as string);
    return {
      study: { id: study.id, title: study.title },
      setup: { fields: f.count ?? 0, visits: v.count ?? 0 },
      recruitment: {
        selected: statuses.filter((s) => s !== "suggested").length,
        screened: statuses.filter((s) => SCREENED.includes(s)).length,
        accepted: statuses.filter((s) => s === "accepted" || s === "enrolled").length,
      },
      survey: { enrolled: statuses.filter((s) => s === "enrolled").length },
      escalations,
    };
  } catch {
    return EMPTY_STATUS;
  }
}
