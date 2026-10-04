"use client";
import { useEffect, useState } from "react";
import { timeAgo } from "./util";

/** Client-only formatted time (avoids server/client locale hydration mismatches). */
export function When({ iso, relative = false }: { iso: string | null | undefined; relative?: boolean }) {
  const [txt, setTxt] = useState("");
  useEffect(() => {
    if (!iso) return;
    const render = () => setTxt(relative ? timeAgo(iso) : new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
    render();
    if (!relative) return;
    const t = setInterval(render, 30000);
    return () => clearInterval(t);
  }, [iso, relative]);
  return <time dateTime={iso ?? undefined} title={iso ? new Date(iso).toLocaleString() : undefined} suppressHydrationWarning>{txt || " "}</time>;
}
