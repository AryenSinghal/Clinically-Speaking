"use client";
import clsx from "clsx";
import { CheckCircle2, Info, X, XCircle } from "lucide-react";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type T = { id: number; tone: "success" | "error" | "info"; text: string };
const Ctx = createContext<{ toast: (text: string, tone?: T["tone"]) => void } | null>(null);

/** Page-level feedback: `const { toast } = useToast(); toast("Saved", "success")`. */
export function useToast() {
  const c = useContext(Ctx);
  return c ?? { toast: () => undefined };
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<T[]>([]);
  const toast = useCallback((text: string, tone: T["tone"] = "info") => {
    const id = Date.now() + Math.random();
    setItems((s) => [...s.slice(-3), { id, tone, text }]);
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), tone === "error" ? 8000 : 4500);
  }, []);
  const value = useMemo(() => ({ toast }), [toast]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div aria-live="polite" className="pointer-events-none fixed bottom-4 right-4 z-50 flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2">
        {items.map((t) => (
          <div key={t.id} className={clsx("pointer-events-auto flex items-start gap-2 rounded-xl border bg-white p-3 text-sm shadow-lg",
            t.tone === "success" && "border-emerald-200", t.tone === "error" && "border-red-200", t.tone === "info" && "border-slate-200")}>
            {t.tone === "success" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" /> : t.tone === "error" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />}
            <span className="flex-1 text-slate-800">{t.text}</span>
            <button aria-label="Dismiss" onClick={() => setItems((s) => s.filter((x) => x.id !== t.id))} className="text-slate-400 hover:text-slate-700"><X className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}
