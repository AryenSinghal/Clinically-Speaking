import { db } from "@/lib/db/server";
import { extractPdfText } from "@/lib/pdf";
import type { Questionnaire } from "@/lib/db/types";
import { fail, guard, ok, Uuid } from "../../_lib/common";
import { parseUploadedQuestionnaire, relinkVisits } from "../../_lib/generate";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST multipart: studyId, kind ('recruitment'|'follow_up'), and `file` (txt/json/csv/pdf) and/or `text`.
 * Or JSON { studyId, kind, text }. Returns { ok, questionnaire } with origin='uploaded'.
 */
export async function POST(req: Request) {
  return guard(async () => {
    let studyIdRaw: unknown, kindRaw: unknown, raw = "";
    if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
      const form = await req.formData();
      studyIdRaw = form.get("studyId");
      kindRaw = form.get("kind");
      const file = form.get("file");
      const text = form.get("text");
      if (file instanceof File && file.size > 0) {
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        raw = isPdf ? await extractPdfText(Buffer.from(await file.arrayBuffer())) : await file.text();
      } else if (typeof text === "string") raw = text;
    } else {
      const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      studyIdRaw = b.studyId; kindRaw = b.kind;
      raw = typeof b.text === "string" ? b.text : "";
    }
    const studyId = Uuid.safeParse(studyIdRaw);
    if (!studyId.success) return fail("studyId is required");
    const kind = kindRaw === "recruitment" ? "recruitment" : "follow_up";
    raw = raw.trim();
    if (raw.length < 5) return fail("Questionnaire content is empty", 422);

    const draft = await parseUploadedQuestionnaire(raw, studyId.data, kind);
    if (!draft.items.length) return fail("No questions could be found in the upload", 422);
    const { data, error } = await db().from("questionnaire")
      .insert({ study_id: studyId.data, kind, title: draft.title || "Uploaded questionnaire", items: draft.items, origin: "uploaded" })
      .select("*").single();
    if (error) return fail(error.message, 500);
    await relinkVisits(studyId.data);
    return ok({ questionnaire: data as Questionnaire }, 201);
  });
}
