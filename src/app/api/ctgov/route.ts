import { NextResponse } from "next/server";
import { fetchNearbyTrials, type CtgovTrial } from "@/lib/ctgov";

const TTL = 10 * 60_000;
const cache = new Map<string, { at: number; trials: CtgovTrial[] }>();

export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const cond = (sp.get("cond") ?? "").trim().slice(0, 120);
  const lat = Number(sp.get("lat")), lng = Number(sp.get("lng"));
  const radiusKm = Math.min(500, Math.max(5, Number(sp.get("radiusKm") ?? 80) || 80));
  if (!cond || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return NextResponse.json({ ok: false, error: "cond, lat and lng are required" }, { status: 400 });
  }
  const key = `${cond.toLowerCase()}|${lat.toFixed(2)}|${lng.toFixed(2)}|${Math.round(radiusKm)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return NextResponse.json({ ok: true, trials: hit.trials, cached: true });
  try {
    const trials = await fetchNearbyTrials({ cond, lat, lng, radiusKm, pageSize: 8 });
    cache.set(key, { at: Date.now(), trials });
    return NextResponse.json({ ok: true, trials, cached: false });
  } catch (e) {
    // Degrade gracefully: serve stale cache if we have it, else report the failure (UI shows a soft message).
    if (hit) return NextResponse.json({ ok: true, trials: hit.trials, cached: true, stale: true });
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : "ClinicalTrials.gov unavailable" }, { status: 502 });
  }
}
