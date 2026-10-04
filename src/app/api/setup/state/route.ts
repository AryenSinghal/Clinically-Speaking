import { guard, fail, ok, Uuid } from "../_lib/common";
import { fetchFields, fetchQuestionnaires, fetchVisits, loadStudy } from "../_lib/generate";

export const runtime = "nodejs";

/** GET ?study=<uuid> -> { ok, study, fields, visits, questionnaires } */
export async function GET(req: Request) {
  return guard(async () => {
    const id = Uuid.safeParse(new URL(req.url).searchParams.get("study"));
    if (!id.success) return fail("study query param required");
    const [study, fields, visits, questionnaires] = await Promise.all([
      loadStudy(id.data), fetchFields(id.data), fetchVisits(id.data), fetchQuestionnaires(id.data),
    ]);
    return ok({ study, fields, visits, questionnaires });
  });
}
