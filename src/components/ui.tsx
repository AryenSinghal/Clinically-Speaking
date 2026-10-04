import clsx from "clsx";
import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

/* ---------- Surfaces ---------- */
export function Card({ title, subtitle, actions, children, className, padded = true }: {
  title?: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; padded?: boolean;
}) {
  return (
    <section className={clsx("rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]", className)}>
      {(title || actions) && (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3.5">
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-slate-900">{title}</h2>
            {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={padded ? "p-5" : undefined}>{children}</div>
    </section>
  );
}

export function PageHeader({ eyebrow, title, subtitle, actions }: { eyebrow?: ReactNode; title: ReactNode; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0 max-w-3xl">
        {eyebrow && <div className="mb-1 text-xs font-semibold uppercase tracking-wider text-violet-700">{eyebrow}</div>}
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h1>
        {subtitle && <p className="mt-1 text-sm leading-relaxed text-slate-600">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/* ---------- Controls ---------- */
export function Button({ variant = "primary", size = "md", loading, className, children, disabled, ...p }: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost" | "success"; size?: "sm" | "md" | "lg"; loading?: boolean;
}) {
  return (
    <button
      {...p}
      disabled={disabled || loading}
      className={clsx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-violet-600 disabled:cursor-not-allowed disabled:opacity-50",
        size === "sm" && "px-2.5 py-1 text-xs", size === "md" && "px-3.5 py-1.5 text-sm", size === "lg" && "px-5 py-2.5 text-sm",
        variant === "primary" && "bg-violet-700 text-white shadow-sm hover:bg-violet-800 active:bg-violet-900",
        variant === "secondary" && "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
        variant === "ghost" && "text-slate-600 hover:bg-slate-100",
        variant === "success" && "bg-emerald-600 text-white shadow-sm hover:bg-emerald-700",
        variant === "danger" && "bg-red-600 text-white shadow-sm hover:bg-red-700",
        className,
      )}
    >
      {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
      {children}
    </button>
  );
}

const tones = {
  gray: "bg-slate-100 text-slate-700", green: "bg-emerald-100 text-emerald-800", red: "bg-red-100 text-red-800",
  amber: "bg-amber-100 text-amber-900", violet: "bg-violet-100 text-violet-800", blue: "bg-sky-100 text-sky-800",
} as const;
export type Tone = keyof typeof tones;
export function Badge({ tone = "gray", dot, children }: { tone?: Tone; dot?: boolean; children: ReactNode }) {
  return (
    <span className={clsx("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium", tones[tone])}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />}
      {children}
    </span>
  );
}

export const inputCls = "w-full rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-200";

/* ---------- Feedback ---------- */
export function Spinner({ className }: { className?: string }) { return <Loader2 className={clsx("h-4 w-4 animate-spin text-violet-600", className)} />; }
export function Skeleton({ className }: { className?: string }) { return <div className={clsx("animate-pulse rounded-md bg-slate-200/70", className)} />; }

export function EmptyState({ icon, title, body, action }: { icon?: ReactNode; title: ReactNode; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-12 text-center">
      {icon && <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-violet-100 text-violet-700">{icon}</div>}
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {body && <p className="mt-1 max-w-md text-sm text-slate-600">{body}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

const calloutTone = {
  info: "border-violet-200 bg-violet-50 text-violet-950", success: "border-emerald-200 bg-emerald-50 text-emerald-950",
  warn: "border-amber-200 bg-amber-50 text-amber-950", danger: "border-red-200 bg-red-50 text-red-950",
} as const;
export function Callout({ tone = "info", title, icon, actions, children }: { tone?: keyof typeof calloutTone; title?: ReactNode; icon?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className={clsx("flex gap-3 rounded-xl border p-4", calloutTone[tone])}>
      {icon && <div className="mt-0.5 shrink-0">{icon}</div>}
      <div className="min-w-0 flex-1">
        {title && <div className="text-sm font-semibold">{title}</div>}
        {children && <div className={clsx("text-sm", title && "mt-0.5 opacity-90")}>{children}</div>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Stat({ label, value, hint, tone }: { label: ReactNode; value: ReactNode; hint?: ReactNode; tone?: Tone }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <div className="text-xs font-medium text-slate-500">{label}</div>
      <div className={clsx("mt-0.5 text-2xl font-semibold tabular-nums tracking-tight", tone === "red" ? "text-red-700" : tone === "green" ? "text-emerald-700" : "text-slate-900")}>{value}</div>
      {hint && <div className="text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** Flag/status colour helpers shared across pages so a state always looks the same everywhere. */
export const flagMeta = {
  good: { tone: "green" as Tone, label: "Good candidate" },
  invalid: { tone: "red" as Tone, label: "Not eligible" },
  escalate: { tone: "amber" as Tone, label: "Needs attention" },
};

/** Outcome wording depends on the call type: "Good candidate" only makes sense for screening. */
export function flagLabel(flag: "good" | "invalid" | "escalate", kind?: string | null): string {
  if (flag === "escalate") return "Needs attention";
  if (kind === "survey") return flag === "good" ? "On track" : "Incomplete";
  if (kind === "reminder") return flag === "good" ? "Attending" : "Can't attend";
  if (kind === "confirmation") return flag === "good" ? "Confirmed" : "Declined";
  return flagMeta[flag].label;
}
