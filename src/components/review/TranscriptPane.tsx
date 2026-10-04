"use client";
import clsx from "clsx";
import { useEffect, useRef } from "react";
import type { TranscriptEvent } from "@/lib/db/types";
import { fmtMs } from "./util";

/** Chat-style transcript. Auto-scrolls to the evidence/active turn, or to the newest turn while live. */
export function TranscriptPane({ events, activeSeq, evidence, onSelect, live = false, tall = false }: {
  events: TranscriptEvent[];
  activeSeq: number | null;
  evidence: { start: number; end: number } | null;
  onSelect?: (e: TranscriptEvent) => void;
  live?: boolean;
  tall?: boolean;
}) {
  const box = useRef<HTMLDivElement>(null);
  const refs = useRef<Map<number, HTMLElement>>(new Map());
  const evSeqs = new Set(
    evidence ? events.filter((e) => e.start_ms != null && e.end_ms != null && e.start_ms <= evidence.end && e.end_ms >= evidence.start).map((e) => e.seq) : [],
  );
  const firstEv = evSeqs.size ? Math.min(...evSeqs) : null;

  useEffect(() => {
    const c = box.current;
    if (!c) return;
    if (live) { c.scrollTo({ top: c.scrollHeight, behavior: "smooth" }); return; }
    const seq = firstEv ?? activeSeq;
    const el = seq != null ? refs.current.get(seq) : null;
    if (el) c.scrollTo({ top: Math.max(0, el.offsetTop - c.clientHeight / 3), behavior: "smooth" });
  }, [firstEv, activeSeq, live, events.length]);

  return (
    <div ref={box} className={clsx("relative space-y-3 overflow-y-auto scroll-smooth p-4", tall ? "max-h-[calc(100vh-15rem)] min-h-[20rem]" : "max-h-[min(55vh,520px)]")} role="log" aria-label="Call transcript">
      {events.length === 0 && <p className="py-6 text-center text-sm text-slate-500">{live ? "Waiting for the conversation to start..." : "No transcript for this call."}</p>}
      {events.map((e) => {
        const agent = e.role === "agent";
        const isEv = evSeqs.has(e.seq);
        return (
          <article
            key={e.seq}
            ref={(el) => { if (el) refs.current.set(e.seq, el); else refs.current.delete(e.seq); }}
            className={clsx("flex flex-col", agent ? "items-start" : "items-end")}
          >
            <div className={clsx("mb-0.5 flex items-center gap-2 text-[11px] font-medium text-slate-500", !agent && "flex-row-reverse")}>
              <span>{agent ? "Study assistant" : "Participant"}</span>
              <span className="tabular-nums text-slate-400">{fmtMs(e.start_ms)}</span>
            </div>
            <button
              type="button"
              disabled={!onSelect || e.start_ms == null}
              onClick={() => onSelect?.(e)}
              className={clsx(
                "max-w-[88%] rounded-2xl px-3.5 py-2 text-left text-sm leading-relaxed transition",
                agent ? "rounded-tl-sm bg-slate-100 text-slate-800" : "rounded-tr-sm bg-violet-600 text-white",
                onSelect && e.start_ms != null && "cursor-pointer hover:brightness-95",
                isEv && "ring-2 ring-amber-400 ring-offset-2",
                activeSeq === e.seq && !isEv && "ring-2 ring-violet-400 ring-offset-2",
                !onSelect || e.start_ms == null ? "cursor-default" : "",
              )}
            >
              {e.text}
            </button>
          </article>
        );
      })}
    </div>
  );
}
