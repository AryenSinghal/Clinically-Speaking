import { GoogleGenAI } from "@google/genai";
import { z } from "zod";
import { GEMINI_MODEL, requireEnv } from "@/lib/env";

let _ai: GoogleGenAI | null = null;
function ai() {
  if (!_ai) _ai = new GoogleGenAI({ apiKey: requireEnv("GEMINI_API_KEY") });
  return _ai;
}

/**
 * Single entry point for every LLM call in the app.
 * Returns data validated against `schema`; retries once on malformed output.
 */
export async function generateJSON<T extends z.ZodType>(opts: {
  system?: string;
  prompt: string;
  schema: T;
  temperature?: number;
}): Promise<z.infer<T>> {
  const { $schema: _omit, ...jsonSchema } = z.toJSONSchema(opts.schema, { target: "draft-7" }) as Record<string, unknown>;
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await ai().models.generateContent({
        model: GEMINI_MODEL(),
        contents: opts.prompt,
        config: {
          systemInstruction: opts.system,
          temperature: opts.temperature ?? 0.2,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
        },
      });
      const text = res.text;
      if (!text) throw new Error("Empty Gemini response");
      return opts.schema.parse(JSON.parse(text));
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(`Gemini JSON generation failed: ${(lastErr as Error)?.message ?? lastErr}`);
}
