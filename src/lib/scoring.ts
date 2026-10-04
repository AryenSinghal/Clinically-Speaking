// Pure scoring helpers: safe to import from client and server components.
import type { StudyDetails } from "@/lib/schemas";

export type ScorableCandidate = {
  id: string; age: number; sex: string; conditions: string[]; lat: number; lng: number;
};
export type Weights = { condition: number; geography: number; demographics: number };
export type Filters = { ageMin: number; ageMax: number; maxKm: number; minScore: number };
export type Eligibility = StudyDetails["eligibility"];
export type LatLng = { lat: number; lng: number };

export const DEFAULT_WEIGHTS: Weights = { condition: 50, geography: 25, demographics: 25 };
export const DEFAULT_SITE: LatLng = { lat: 42.3355, lng: -71.105 };
export const AGE_BOUNDS = { min: 18, max: 90 } as const;

export type ScoreResult = {
  score: number; // 0..100
  condition: number; geography: number; demographics: number; // each 0..1
  distanceKm: number;
  matched: string[]; // target conditions this candidate matches
  eligibleAge: boolean; eligibleSex: boolean;
};

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

const SYNONYMS: Record<string, string[]> = {
  "type 2 diabetes": ["t2dm", "diabetes", "type 2 diabetes mellitus", "type ii diabetes"],
  hypertension: ["high blood pressure", "htn", "essential hypertension"],
};
function norm(s: string) { return s.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(); }
function termVariants(t: string): string[] {
  const n = norm(t);
  const extra = Object.entries(SYNONYMS).flatMap(([k, v]) => (n === k || v.includes(n) ? [k, ...v] : []));
  return Array.from(new Set([n, ...extra.map(norm)]));
}

/** Which of the study's target conditions does this candidate have (keyword overlap)? */
export function matchConditions(candidateConditions: string[], targets: string[]): string[] {
  const have = candidateConditions.map(norm).filter(Boolean);
  return targets.filter((t) => {
    const vs = termVariants(t);
    return have.some((h) => vs.some((v) => h === v || h.includes(v) || v.includes(h)));
  });
}

export function scoreCandidate(
  c: ScorableCandidate,
  ctx: { site: LatLng; eligibility: Eligibility | null; weights: Weights; maxKm: number },
): ScoreResult {
  const targets = (ctx.eligibility?.target_conditions ?? []).filter((t) => t.trim());
  const matched = matchConditions(c.conditions, targets);
  const condition = targets.length ? matched.length / targets.length : 0.5;

  const distanceKm = haversineKm(ctx.site, c);
  const geography = Math.max(0, 1 - distanceKm / Math.max(1, ctx.maxKm));

  const amin = ctx.eligibility?.age_min ?? null, amax = ctx.eligibility?.age_max ?? null;
  const eligibleAge = (amin == null || c.age >= amin) && (amax == null || c.age <= amax);
  const ageGap = Math.max(amin != null ? amin - c.age : 0, amax != null ? c.age - amax : 0, 0);
  const ageScore = Math.max(0, 1 - ageGap / 10);
  const sexPref = ctx.eligibility?.sex ?? "any";
  const eligibleSex = sexPref === "any" || c.sex.toLowerCase() === sexPref;
  const demographics = ageScore * 0.75 + (eligibleSex ? 0.25 : 0);

  const w = ctx.weights;
  const total = w.condition + w.geography + w.demographics;
  let raw = total > 0 ? (condition * w.condition + geography * w.geography + demographics * w.demographics) / total : 0;
  // Hard-ish eligibility penalty so decoys sink even if the sliders favour geography.
  if (!eligibleAge || !eligibleSex) raw *= 0.6;
  return { score: Math.round(raw * 1000) / 10, condition, geography, demographics, distanceKm, matched, eligibleAge, eligibleSex };
}

export function passesFilters(r: ScoreResult, c: ScorableCandidate, f: Filters): boolean {
  return c.age >= f.ageMin && c.age <= f.ageMax && r.distanceKm <= f.maxKm && r.score >= f.minScore;
}

export function defaultFilters(e: Eligibility | null): Filters {
  return {
    ageMin: Math.max(AGE_BOUNDS.min, e?.age_min ?? AGE_BOUNDS.min),
    ageMax: Math.min(AGE_BOUNDS.max, e?.age_max ?? AGE_BOUNDS.max),
    maxKm: 100,
    minScore: 0,
  };
}

/** Color ramp for fit score: slate -> amber -> emerald. */
export function scoreColor(score: number): string {
  if (score >= 75) return "#059669";
  if (score >= 50) return "#d97706";
  if (score >= 25) return "#94a3b8";
  return "#cbd5e1";
}
