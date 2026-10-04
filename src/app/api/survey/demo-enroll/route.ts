import { NextResponse } from "next/server";
import { db } from "@/lib/db/server";
import { todayStr } from "@/lib/survey";
import type { Candidate } from "@/lib/db/types";

export const dynamic = "force-dynamic";

/** POST {studyId}: enroll a candidate (existing or created) so the survey demo can run without recruitment. */
export async function POST(req: Request) {
  try {
    const { studyId } = (await req.json().catch(() => ({}))) as { studyId?: string };
    if (!studyId) return NextResponse.json({ ok: false, error: "studyId required" }, { status: 400 });
    const c = db();
    const { data: study } = await c.from("study").select("id, site").eq("id", studyId).maybeSingle();
    if (!study) return NextResponse.json({ ok: false, error: "study not found" }, { status: 404 });

    // Preference: furthest-along candidate already in this study, then any free candidate in the registry.
    const { data: mine } = await c.from("candidate").select("*").eq("study_id", studyId).neq("status", "enrolled");
    const rank = ["accepted", "good", "screened", "selected", "suggested", "invalid"];
    let pick = ((mine ?? []) as Candidate[]).sort((a, b) => rank.indexOf(a.status) - rank.indexOf(b.status))[0] ?? null;
    if (!pick) {
      const { data: free } = await c.from("candidate").select("*").is("study_id", null).neq("status", "enrolled").limit(1);
      pick = ((free ?? []) as Candidate[])[0] ?? null;
    }

    const enrolled_at = todayStr();
    let candidate: Candidate | null = null;
    if (pick) {
      const { data, error } = await c.from("candidate").update({ study_id: studyId, status: "enrolled", enrolled_at }).eq("id", pick.id).select("*").single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      candidate = data as Candidate;
    } else {
      const site = study.site as { lat: number; lng: number; city: string; state: string } | null;
      const { data, error } = await c.from("candidate").insert({
        study_id: studyId, name: "Demo Participant", phone: process.env.DEMO_PHONE_OVERRIDE || "+15555550100",
        age: 52, sex: "female", conditions: [], city: site?.city ?? null, state: site?.state ?? null,
        lat: site?.lat ?? 40.7128, lng: site?.lng ?? -74.006, status: "enrolled", enrolled_at,
        notes: "Created by survey demo-enroll",
      }).select("*").single();
      if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      candidate = data as Candidate;
    }
    await c.from("study").update({ status: "active" }).eq("id", studyId);
    return NextResponse.json({ ok: true, candidate });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "error" }, { status: 500 });
  }
}
