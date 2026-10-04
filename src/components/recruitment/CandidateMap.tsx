"use client";
import "maplibre-gl/dist/maplibre-gl.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Map, { Layer, Marker, NavigationControl, Popup, Source, type MapRef } from "react-map-gl/maplibre";
import type { StyleSpecification } from "maplibre-gl";
import { scoreColor, type LatLng } from "@/lib/scoring";
import type { Row } from "./types";

// Turbopack cannot bundle MapLibre's web worker, so serve it from /public (copied from node_modules/maplibre-gl/dist).
const mapLib = import("maplibre-gl").then((m) => { m.setWorkerUrl("/maplibre/maplibre-gl-worker.mjs"); return m; });

// Basemap: OpenStreetMap standard tiles, no API key needed (Carto's free tiles now require a key).
// Optional override: NEXT_PUBLIC_MAP_STYLE_URL (any MapLibre style URL, e.g. MapTiler/Stadia with your key).
const CUSTOM_STYLE = process.env.NEXT_PUBLIC_MAP_STYLE_URL || null;
const OSM: StyleSpecification = {
  version: 8,
  sources: { osm: { type: "raster", tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"], tileSize: 256, maxzoom: 19, attribution: "&copy; OpenStreetMap contributors" } },
  layers: [{ id: "osm", type: "raster", source: "osm" }],
};

function circlePolygon(center: LatLng, km: number) {
  const pts: [number, number][] = [];
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([center.lng + (km / (111 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(a), center.lat + (km / 111) * Math.cos(a)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

export default function CandidateMap({ site, siteName, rows, selected, selectable, maxKm, onToggle }: {
  site: LatLng; siteName: string; rows: Row[]; selected: Set<string>; selectable: Set<string>; maxKm: number; onToggle: (id: string) => void;
}) {
  const mapRef = useRef<MapRef>(null);
  const [hover, setHover] = useState<string | null>(null);
  const ring = useMemo(() => circlePolygon(site, maxKm), [site, maxKm]);
  const hovered = rows.find((x) => x.c.id === hover);
  const dense = rows.length > 40;

  // Re-fit whenever the set of visible people (i.e. the filters) changes, not on selection or call updates.
  const fitKey = `${rows.map(({ c }) => c.id).join(",")}|${maxKm}|${site.lat},${site.lng}`;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const fit = useCallback((animate: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    const pts: [number, number][] = [[site.lng, site.lat], ...rowsRef.current.map(({ c }): [number, number] => [c.lng, c.lat])];
    if (pts.length === 1) pts.push(...ring.geometry.coordinates[0].filter((_, i) => i % 16 === 0)); // nothing visible: frame the radius
    let w = Infinity, s = Infinity, e = -Infinity, n = -Infinity;
    for (const [x, y] of pts) { w = Math.min(w, x); e = Math.max(e, x); s = Math.min(s, y); n = Math.max(n, y); }
    map.fitBounds([[w, s], [e, n]], { padding: { top: 48, bottom: 48, left: 48, right: 48 }, maxZoom: 12, duration: animate ? 700 : 0 });
  }, [site.lat, site.lng, ring]);
  useEffect(() => { fit(true); }, [fitKey, fit]);

  return (
    <Map
      ref={mapRef}
      mapLib={mapLib}
      scrollZoom={false}
      cooperativeGestures={false}
      initialViewState={{ latitude: site.lat, longitude: site.lng, zoom: 8.6 }}
      mapStyle={CUSTOM_STYLE ?? OSM}
      style={{ width: "100%", height: "100%" }}
      attributionControl={{ compact: true }}
      onLoad={() => fit(false)}
    >
      <NavigationControl position="top-right" showCompass={false} />
      <Source id="radius" type="geojson" data={ring}>
        <Layer id="radius-fill" type="fill" paint={{ "fill-color": "#6d28d9", "fill-opacity": 0.05 }} />
        <Layer id="radius-line" type="line" paint={{ "line-color": "#6d28d9", "line-width": 1.5, "line-dasharray": [3, 2] }} />
      </Source>
      <Marker latitude={site.lat} longitude={site.lng} anchor="center" style={{ zIndex: 5 }}>
        <div title={siteName} className="flex h-7 w-7 items-center justify-center rounded-md bg-violet-800 text-sm font-bold text-white shadow ring-2 ring-white">+</div>
      </Marker>
      {rows.map(({ c, r }) => {
        const size = Math.round((dense ? 9 : 12) + (r.score / 100) * (dense ? 8 : 12));
        const sel = selected.has(c.id);
        const can = selectable.has(c.id);
        return (
          <Marker key={c.id} latitude={c.lat} longitude={c.lng} anchor="center" style={{ zIndex: sel ? 4 : hover === c.id ? 3 : Math.round(r.score / 25) }}
            onClick={(e) => { e.originalEvent.stopPropagation(); onToggle(c.id); }}>
            <button
              type="button"
              aria-label={`${c.name}, fit ${r.score.toFixed(0)}${sel ? ", selected" : ""}`}
              aria-pressed={sel}
              disabled={!can && !sel}
              onMouseEnter={() => setHover(c.id)} onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(c.id)} onBlur={() => setHover(null)}
              style={{ width: sel ? size + 4 : size, height: sel ? size + 4 : size, background: scoreColor(r.score), opacity: can || sel ? 1 : 0.45 }}
              className={`block rounded-full border-2 shadow-sm transition-[width,height,box-shadow] focus-visible:outline-2 focus-visible:outline-violet-600 ${
                sel ? "border-white ring-[3px] ring-violet-700" : "border-white"} ${can || sel ? "cursor-pointer" : "cursor-default"}`}
            />
          </Marker>
        );
      })}
      {hovered && (
        <Popup latitude={hovered.c.lat} longitude={hovered.c.lng} closeButton={false} closeOnClick={false} offset={14} anchor="bottom" maxWidth="260px">
          <div className="min-w-44 text-xs text-slate-800">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold">{hovered.c.name}</span>
              <span className="rounded-full px-1.5 py-0.5 font-semibold text-white" style={{ background: scoreColor(hovered.r.score) }}>{hovered.r.score.toFixed(0)}</span>
            </div>
            <div className="mt-0.5 text-slate-600">{hovered.c.age} y, {hovered.c.sex} · {hovered.r.distanceKm.toFixed(0)} km from site</div>
            <div className="mt-0.5 text-slate-500">{hovered.c.conditions.join(", ") || "No listed conditions"}</div>
            <div className="mt-1 text-[11px] font-medium text-violet-800">{selectable.has(hovered.c.id) ? (selected.has(hovered.c.id) ? "Click to deselect" : "Click to select") : "Already in the pipeline"}</div>
          </div>
        </Popup>
      )}
    </Map>
  );
}
