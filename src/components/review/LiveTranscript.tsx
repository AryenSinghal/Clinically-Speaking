"use client";
import type { TranscriptEvent } from "@/lib/db/types";
import { TranscriptPane } from "./TranscriptPane";

export function LiveIndicator() {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
      <span className="relative flex h-2 w-2"><span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" /><span className="relative inline-flex h-2 w-2 rounded-full bg-red-600" /></span>
      Live
    </span>
  );
}

export function LiveTranscript({ events, status }: { events: TranscriptEvent[]; status: string }) {
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-slate-100 px-4 py-2"><span className="text-xs text-slate-500">{status === "queued" ? "Dialing..." : status === "ringing" ? "Ringing..." : "Call in progress"}</span></div>
      <TranscriptPane events={events} activeSeq={null} evidence={null} live />
    </div>
  );
}
