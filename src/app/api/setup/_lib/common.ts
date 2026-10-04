import { NextResponse } from "next/server";
import { z } from "zod";

export function ok<T extends Record<string, unknown>>(data: T, status = 200) {
  return NextResponse.json({ ok: true, ...data }, { status });
}
export function fail(error: string, status = 400) {
  return NextResponse.json({ ok: false, error }, { status });
}
export function errMsg(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`).join("; ");
  if (e instanceof Error) return e.message;
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}
/** Run a handler body, converting thrown errors to JSON failures. */
export async function guard(fn: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (e) {
    console.error("[setup api]", e);
    return fail(errMsg(e), e instanceof z.ZodError ? 400 : 500);
  }
}
export async function bodyJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new Error("Request body must be valid JSON");
  }
}
export function snakeKey(raw: string, fallback = "field"): string {
  let k = raw.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  if (!k) k = fallback;
  if (/^[0-9]/.test(k)) k = `f_${k}`;
  return k.slice(0, 60);
}
export function uniqueKey(raw: string, used: Set<string>): string {
  const base = snakeKey(raw);
  let k = base, n = 2;
  while (used.has(k)) k = `${base}_${n++}`;
  used.add(k);
  return k;
}
export const Uuid = z.string().uuid();
