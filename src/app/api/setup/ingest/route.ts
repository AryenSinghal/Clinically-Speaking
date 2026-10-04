import { db } from "@/lib/db/server";
import { extractPdfText } from "@/lib/pdf";
import { fail, guard, ok } from "../_lib/common";
import { runDetails } from "../_lib/generate";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_BYTES = 15 * 1024 * 1024;

/** POST multipart (field `file`: PDF/txt/md; optional `text`) OR JSON `{ text }`. Returns { ok, studyId, details, site }. */
export async function POST(req: Request) {
  return guard(async () => {
    let text = "";
    const ct = req.headers.get("content-type") ?? "";
    if (ct.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const pasted = form.get("text");
      if (file instanceof File && file.size > 0) {
        if (file.size > MAX_BYTES) return fail("File too large (max 15 MB)", 413);
        const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
        if (isPdf) {
          try {
            text = await extractPdfText(Buffer.from(await file.arrayBuffer()));
          } catch (e) {
            return fail(`Could not read PDF: ${e instanceof Error ? e.message : String(e)}`, 422);
          }
        } else {
          text = await file.text();
        }
      } else if (typeof pasted === "string") {
        text = pasted;
      }
    } else {
      const body: unknown = await req.json().catch(() => null);
      if (body && typeof body === "object" && "text" in body && typeof (body as { text: unknown }).text === "string") {
        text = (body as { text: string }).text;
      }
    }
    text = text.trim();
    if (text.length < 40) {
      return fail("No readable protocol text found. If the PDF is a scan, paste the text instead.", 422);
    }

    const ins = await db().from("study").insert({ title: "Untitled study", protocol_text: text, status: "draft" }).select("id").single();
    if (ins.error || !ins.data) return fail(ins.error?.message ?? "Could not create study", 500);
    const studyId = ins.data.id;
    try {
      const study = await runDetails(studyId);
      return ok({ studyId, details: study.details, site: study.site });
    } catch (e) {
      await db().from("study").delete().eq("id", studyId);
      throw e;
    }
  });
}
