import { extractText, getDocumentProxy } from "unpdf";

/** Extract text from a PDF buffer (server-only). unpdf bundles a serverless pdf.js build, so no DOM globals are needed. */
export async function extractPdfText(buf: Buffer | Uint8Array): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buf));
  const { text } = await extractText(pdf, { mergePages: true });
  return text.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
