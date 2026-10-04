import { z } from "zod";
import { bodyJson, guard, ok, Uuid } from "../_lib/common";
import { fetchFields, fetchQuestionnaires, fetchVisits, loadStudy, runDetails, runEdc, runQuestionnaires, runTimeline } from "../_lib/generate";

export const runtime = "nodejs";
export const maxDuration = 120;

const Body = z.object({ studyId: Uuid, step: z.enum(["details", "edc", "timeline", "questionnaires", "all"]) });

/** POST { studyId, step }. Regenerates AI drafts. 'all' = edc, then timeline + questionnaires in parallel. */
export async function POST(req: Request) {
  return guard(async () => {
    const { studyId, step } = Body.parse(await bodyJson(req));
    await loadStudy(studyId);
    const out: Record<string, unknown> = {};
    if (step === "details") out.study = await runDetails(studyId);
    if (step === "edc" || step === "all") out.fields = await runEdc(studyId);
    if (step === "timeline") out.visits = await runTimeline(studyId);
    if (step === "questionnaires") out.questionnaires = await runQuestionnaires(studyId);
    if (step === "all") {
      await Promise.all([runTimeline(studyId), runQuestionnaires(studyId)]);
      out.visits = await fetchVisits(studyId);
      out.questionnaires = await fetchQuestionnaires(studyId);
      out.fields = await fetchFields(studyId);
    }
    return ok(out);
  });
}
