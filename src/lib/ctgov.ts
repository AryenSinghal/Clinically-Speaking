// ClinicalTrials.gov API v2 helper. Server-side use (called from /api/ctgov); types are shareable.
export type CtgovSite = { facility: string; city: string | null; state: string | null; lat: number | null; lng: number | null; distanceKm: number | null };
export type CtgovTrial = {
  nctId: string; title: string; status: string; phases: string[]; sponsor: string | null;
  sites: CtgovSite[]; url: string;
};

const BASE = "https://clinicaltrials.gov/api/v2/studies";
const FIELDS = "NCTId,BriefTitle,OverallStatus,Phase,LeadSponsorName,LocationFacility,LocationCity,LocationState,LocationGeoPoint";

type Raw = {
  protocolSection?: {
    identificationModule?: { nctId?: string; briefTitle?: string };
    statusModule?: { overallStatus?: string };
    sponsorCollaboratorsModule?: { leadSponsor?: { name?: string } };
    designModule?: { phases?: string[] };
    contactsLocationsModule?: { locations?: { facility?: string; city?: string; state?: string; geoPoint?: { lat?: number; lon?: number } }[] };
  };
};

function km(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const r = (d: number) => (d * Math.PI) / 180;
  const h = Math.sin(r(b.lat - a.lat) / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(r(b.lng - a.lng) / 2) ** 2;
  return 12742 * Math.asin(Math.sqrt(h));
}

export async function fetchNearbyTrials(opts: { cond: string; lat: number; lng: number; radiusKm: number; pageSize?: number }): Promise<CtgovTrial[]> {
  const miles = Math.max(1, Math.round(opts.radiusKm / 1.609));
  const p = new URLSearchParams({
    "query.cond": opts.cond,
    "filter.geo": `distance(${opts.lat},${opts.lng},${miles}mi)`,
    "filter.overallStatus": "RECRUITING|NOT_YET_RECRUITING",
    pageSize: String(opts.pageSize ?? 8),
    fields: FIELDS,
    format: "json",
  });
  const res = await fetch(`${BASE}?${p.toString()}`, { signal: AbortSignal.timeout(9000), headers: { accept: "application/json" } });
  if (!res.ok) throw new Error(`ClinicalTrials.gov responded ${res.status}`);
  const json = (await res.json()) as { studies?: Raw[] };
  const origin = { lat: opts.lat, lng: opts.lng };
  return (json.studies ?? []).flatMap((s): CtgovTrial[] => {
    const ps = s.protocolSection;
    const nctId = ps?.identificationModule?.nctId;
    if (!nctId) return [];
    const sites = (ps?.contactsLocationsModule?.locations ?? []).map((l): CtgovSite => {
      const g = l.geoPoint;
      const has = typeof g?.lat === "number" && typeof g?.lon === "number";
      return {
        facility: l.facility ?? "Unnamed site", city: l.city ?? null, state: l.state ?? null,
        lat: has ? g!.lat! : null, lng: has ? g!.lon! : null,
        distanceKm: has ? Math.round(km(origin, { lat: g!.lat!, lng: g!.lon! })) : null,
      };
    }).sort((a, b) => (a.distanceKm ?? 1e9) - (b.distanceKm ?? 1e9));
    return [{
      nctId, title: ps?.identificationModule?.briefTitle ?? nctId, status: ps?.statusModule?.overallStatus ?? "UNKNOWN",
      phases: ps?.designModule?.phases ?? [], sponsor: ps?.sponsorCollaboratorsModule?.leadSponsor?.name ?? null,
      sites: sites.slice(0, 4), url: `https://clinicaltrials.gov/study/${nctId}`,
    }];
  });
}
