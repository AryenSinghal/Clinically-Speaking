"use client";
import clsx from "clsx";
import { useRouter, usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ChevronDown, FolderOpen, Plus } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { STUDY_COOKIE, UUID_RE } from "@/lib/studyCookie";

type StudyItem = { id: string; title: string; status: string; created_at: string };

const STATUS: Record<string, string> = { draft: "Draft", setup_complete: "Setup complete", recruiting: "Recruiting", active: "Active" };

export function readStudyCookie(): string | null {
  try {
    const m = document.cookie.match(new RegExp(`(?:^|; )${STUDY_COOKIE}=([^;]*)`));
    const v = m ? decodeURIComponent(m[1]) : null;
    return v && UUID_RE.test(v) ? v : null;
  } catch { return null; }
}
export function writeStudyCookie(id: string) {
  try { document.cookie = `${STUDY_COOKIE}=${encodeURIComponent(id)}; path=/; max-age=31536000; samesite=lax`; } catch { /* ignore */ }
}

/** Header dropdown listing all studies; picking one switches every page to it and remembers the choice. */
export function StudySwitcher({ current, loading }: { current: { id: string; title: string } | null; loading: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [studies, setStudies] = useState<StudyItem[] | null>(null);
  const [failed, setFailed] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/studies", { cache: "no-store" });
      const j = (await res.json()) as { ok: boolean; studies?: StudyItem[] };
      if (!j.ok || !j.studies) throw new Error("bad response");
      setStudies(j.studies); setFailed(false);
    } catch { setFailed(true); }
  }, []);

  // Refresh the list every time the menu opens so a just-created study shows up.
  useEffect(() => { if (open) void load(); }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  function pick(id: string) {
    setOpen(false);
    if (id === current?.id) return;
    writeStudyCookie(id);
    // A call review belongs to one study, so land on the dashboard; other pages stay where they are.
    const target = pathname.startsWith("/review") ? "/" : pathname;
    router.push(`${target}?study=${encodeURIComponent(id)}`);
  }

  if (loading) return <Skeleton className="h-8 w-32 rounded-full" />;

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={current ? `Study: ${current.title}. Switch study` : "Choose a study"}
        title={current?.title}
        className={clsx("flex h-8 max-w-[12rem] items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition xl:max-w-xs",
          open ? "border-violet-300 bg-violet-50 text-violet-900" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300 hover:bg-slate-100")}
      >
        <FolderOpen className="h-3.5 w-3.5 shrink-0 text-slate-500" aria-hidden />
        <span className="hidden truncate md:block">{current ? current.title : "No study"}</span>
        <ChevronDown className={clsx("h-3.5 w-3.5 shrink-0 text-slate-400 transition", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div role="dialog" aria-label="Switch study" className="absolute left-0 top-10 z-50 w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="border-b border-slate-100 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Studies</div>
          <ul role="listbox" aria-label="Studies" className="max-h-72 overflow-y-auto py-1">
            {studies === null && !failed && [0, 1].map((i) => <li key={i} className="px-3 py-2"><Skeleton className="h-4 w-full" /><Skeleton className="mt-1.5 h-3 w-24" /></li>)}
            {failed && <li className="px-3 py-3 text-sm text-red-700">Could not load studies. <button type="button" onClick={() => void load()} className="font-medium underline">Retry</button></li>}
            {studies?.length === 0 && <li className="px-3 py-3 text-sm text-slate-500">No studies yet.</li>}
            {studies?.map((s) => {
              const sel = s.id === current?.id;
              return (
                <li key={s.id} role="option" aria-selected={sel}>
                  <button type="button" onClick={() => pick(s.id)} className={clsx("flex w-full items-start gap-2 px-3 py-2 text-left transition hover:bg-slate-50", sel && "bg-violet-50/60")}>
                    <span className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center text-violet-700">{sel && <Check className="h-4 w-4" />}</span>
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 text-sm font-medium text-slate-900">{s.title}</span>
                      <span className="mt-0.5 block text-xs text-slate-500">{STATUS[s.status] ?? s.status} &middot; {new Date(s.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <button type="button" onClick={() => { setOpen(false); router.push("/setup?new=1"); }}
            className="flex w-full items-center gap-2 border-t border-slate-100 px-3 py-2.5 text-sm font-medium text-violet-800 transition hover:bg-violet-50">
            <Plus className="h-4 w-4" />New study
          </button>
        </div>
      )}
    </div>
  );
}
