"use client";
import clsx from "clsx";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { AlertTriangle, Check, FileText, PhoneCall, Phone, Users } from "lucide-react";
import { Skeleton } from "@/components/ui";
import { StudySwitcher, readStudyCookie, writeStudyCookie } from "./StudySwitcher";
import { useShellStatus } from "./useShellStatus";
import type { ShellStatus } from "./types";

type StepState = "idle" | "active" | "done";

function steps(s: ShellStatus | null) {
  const setupDone = !!s && s.setup.fields > 0 && s.setup.visits > 0;
  const recDone = !!s && s.recruitment.accepted > 0;
  return [
    {
      href: "/setup", label: "Setup", icon: FileText,
      state: (setupDone ? "done" : s?.study ? "active" : "idle") as StepState,
      count: s ? (s.study ? `${s.setup.fields} fields` : "") : null,
    },
    {
      href: "/recruitment", label: "Recruitment", icon: Users,
      state: (recDone ? "done" : s && s.recruitment.selected > 0 ? "active" : "idle") as StepState,
      count: s ? (s.recruitment.selected > 0 ? `${s.recruitment.accepted}/${s.recruitment.selected}` : "") : null,
    },
    {
      href: "/survey", label: "Survey", icon: PhoneCall,
      state: (s && s.survey.enrolled > 0 ? "active" : "idle") as StepState,
      count: s ? (s.survey.enrolled > 0 ? `${s.survey.enrolled} enrolled` : "") : null,
    },
  ];
}

const STATE_LABEL: Record<StepState, string> = { idle: "not started", active: "in progress", done: "done" };

function Inner() {
  const pathname = usePathname();
  const sp = useSearchParams();
  const param = sp.get("study");
  // The study in the URL wins; otherwise the remembered one. Keep the cookie in sync with the URL so server pages agree.
  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => {
    if (param) { writeStudyCookie(param); setRemembered(param); } else setRemembered(readStudyCookie());
  }, [param]);
  const study = param ?? remembered;
  const qs = study ? `?study=${encodeURIComponent(study)}` : "";
  const status = useShellStatus(study);
  const onEsc = pathname.startsWith("/escalations");
  const esc = status?.escalations ?? 0;

  return (
    <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-4 sm:px-6">
      <Link href={`/${qs}`} className="flex shrink-0 items-center gap-2 font-semibold tracking-tight text-slate-900" aria-label="EPRO Automation home">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-700 text-white shadow-sm"><Phone className="h-4 w-4" /></span>
        <span className="hidden lg:inline">Clinically Speaking</span>
      </Link>

      <div className="shrink-0">
        <StudySwitcher current={status?.study ?? null} loading={status === null} />
      </div>

      <span className="hidden h-5 w-px shrink-0 bg-slate-200 md:block" aria-hidden />

      <nav aria-label="Pipeline" className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 flex min-w-0 flex-1 items-center gap-1 overflow-x-auto px-1">
        {steps(status).map((st, i) => {
          const active = pathname.startsWith(st.href);
          return (
            <Link
              key={st.href}
              href={`${st.href}${qs}`}
              aria-current={active ? "page" : undefined}
              title={`${st.label}: ${STATE_LABEL[st.state]}`}
              className={clsx(
                "group flex shrink-0 items-center gap-1.5 rounded-full border py-1 pl-1.5 pr-2.5 text-sm font-medium transition",
                active ? "border-violet-300 bg-violet-50 text-violet-900" : "border-transparent text-slate-600 hover:bg-slate-100",
              )}
            >
              <span className={clsx(
                "flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold",
                status === null ? "bg-slate-200 text-slate-400"
                  : st.state === "done" ? "bg-emerald-500 text-white" : st.state === "active" ? "bg-violet-700 text-white" : "bg-slate-200 text-slate-500",
              )}>
                {st.state === "done" && status ? <Check className="h-3 w-3" /> : i + 1}
              </span>
              <span>{st.label}</span>
              {status === null ? (
                <Skeleton className="hidden h-3.5 w-9 sm:block" />
              ) : st.count ? (
                <span className="hidden text-xs font-normal tabular-nums text-slate-500 lg:inline">{st.count}</span>
              ) : null}
              <span className="sr-only">{STATE_LABEL[st.state]}</span>
            </Link>
          );
        })}
      </nav>

      <Link
        href={`/escalations${qs}`}
        aria-label={`Escalations${esc ? `, ${esc} open` : ""}`}
        className={clsx("flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-sm font-medium transition",
          onEsc ? "border-red-200 bg-red-50 text-red-800" : "border-transparent text-slate-600 hover:bg-slate-100")}
      >
        <AlertTriangle className="h-4 w-4" />
        <span className="hidden sm:inline">Escalations</span>
        {status === null ? (
          <Skeleton className="h-5 w-5 rounded-full" />
        ) : esc > 0 ? (
          <span className="min-w-5 rounded-full bg-red-600 px-1.5 text-center text-xs font-semibold leading-5 text-white tabular-nums">{esc}</span>
        ) : null}
      </Link>
    </div>
  );
}

export function TopNav() {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/85 backdrop-blur">
      <Suspense fallback={<div className="h-14" />}>
        <Inner />
      </Suspense>
    </header>
  );
}
