import { NextResponse } from "next/server";
import { db } from "@/lib/db/server";

export const dynamic = "force-dynamic";

/** GET -> studies, newest first, for the header study switcher. */
export async function GET() {
  const { data, error } = await db().from("study").select("id, title, status, created_at").order("created_at", { ascending: false }).limit(50);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, studies: data ?? [] });
}
