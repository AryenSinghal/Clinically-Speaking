import { NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db/server";

export const runtime = "nodejs";
const Body = z.object({ id: z.string().uuid(), value: z.string().nullable().optional(), review_status: z.enum(["pending", "confirmed", "corrected"]) });

export async function PATCH(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  const { id, value, review_status } = parsed.data;
  const patch: { review_status: typeof review_status; value?: string | null } = { review_status };
  if (value !== undefined) patch.value = value;
  const { data, error } = await db().from("field_value").update(patch).eq("id", id).select("*").maybeSingle();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, fieldValue: data });
}
