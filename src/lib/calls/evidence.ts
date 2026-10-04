import type { TranscriptEvent } from "@/lib/db/types";

export type TimedEvent = Pick<TranscriptEvent, "seq" | "role" | "text" | "start_ms" | "end_ms">;
export type Located = { startMs: number | null; endMs: number | null; seq: number | null };

export function norm(s: string): string {
  return s.toLowerCase().replace(/[‘’]/g, "'").replace(/[^a-z0-9'\s]/g, " ").replace(/\s+/g, " ").trim();
}

/** Fill missing timings by proportional estimate over the whole call. */
export function withEstimatedTimings(events: TimedEvent[], totalMsHint?: number | null): { start: number; end: number }[] {
  const lens = events.map((e) => Math.max(1, e.text.length));
  const totalChars = lens.reduce((a, b) => a + b, 0);
  const knownEnd = Math.max(0, ...events.map((e) => e.end_ms ?? 0));
  const total = Math.max(knownEnd, totalMsHint ?? 0, totalChars * 65);
  let acc = 0;
  return events.map((e, i) => {
    const estStart = Math.round((acc / totalChars) * total);
    acc += lens[i];
    const estEnd = Math.round((acc / totalChars) * total);
    return { start: e.start_ms ?? estStart, end: e.end_ms ?? estEnd };
  });
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter++;
  return inter / (a.size + b.size - inter);
}

/** Locate a (supposedly verbatim) quote in the transcript events. */
export function locateQuote(quote: string | null | undefined, events: TimedEvent[], totalMsHint?: number | null, turnSeq?: number | null): Located {
  const none: Located = { startMs: null, endMs: null, seq: null };
  if (!quote || !events.length) return none;
  const q = norm(quote);
  if (!q) return none;
  const times = withEstimatedTimings(events, totalMsHint);
  const normed = events.map((e) => norm(e.text));
  const result = (i: number, j = i): Located => ({
    startMs: Math.max(0, times[i].start - 200),
    endMs: times[j].end,
    seq: events[i].seq,
  });

  // 0. the model told us which turn it quoted: trust it if the quote plausibly lives there (disambiguates "Yes.")
  if (turnSeq != null) {
    const ti = events.findIndex((e) => e.seq === turnSeq);
    if (ti >= 0 && events[ti].role === "participant") {
      const qt0 = new Set(q.split(" "));
      const tt = new Set(normed[ti].split(" "));
      if (normed[ti].includes(q) || normed[ti] === q || jaccard(qt0, tt) >= 0.5) return result(ti);
    }
  }
  // 1. exact substring within one event (prefer participant turns)
  const order = events.map((_, i) => i).sort((a, b) => Number(events[b].role === "participant") - Number(events[a].role === "participant"));
  for (const i of order) if (normed[i].includes(q)) return result(i);
  // 2. event text contained in the quote (quote spans turns) -> first/last overlapping
  for (let i = 0; i < events.length; i++) {
    for (let j = i + 1; j < Math.min(events.length, i + 4); j++) {
      if (normed.slice(i, j + 1).join(" ").includes(q)) return result(i, j);
    }
  }
  // 3. fuzzy: best token overlap over windows of 1..2 events
  const qt = new Set(q.split(" "));
  let best = 0, bi = -1, bj = -1;
  for (let i = 0; i < events.length; i++) {
    for (let j = i; j < Math.min(events.length, i + 2); j++) {
      const w = new Set(normed.slice(i, j + 1).join(" ").split(" "));
      // containment-biased score
      let inter = 0;
      for (const t of qt) if (w.has(t)) inter++;
      const score = Math.max(jaccard(qt, w), (inter / qt.size) * 0.9);
      const bonus = events[i].role === "participant" ? 0.02 : 0;
      if (score + bonus > best) { best = score + bonus; bi = i; bj = j; }
    }
  }
  if (best >= 0.6 && bi >= 0) return result(bi, bj);
  return none;
}
