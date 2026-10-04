"use client";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { browserDb } from "@/lib/db/client";

/** Renders nothing; refreshes the current server component tree when any `call` row changes. */
export function LiveRefresh() {
  const router = useRouter();
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | null = null;
    let channel: ReturnType<ReturnType<typeof browserDb>["channel"]> | null = null;
    try {
      channel = browserDb()
        .channel(`live-refresh-${Math.random().toString(36).slice(2)}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "call" }, () => {
          if (t) clearTimeout(t);
          t = setTimeout(() => router.refresh(), 500);
        })
        .subscribe();
    } catch { /* no realtime */ }
    return () => {
      if (t) clearTimeout(t);
      try { if (channel) void browserDb().removeChannel(channel); } catch { /* ignore */ }
    };
  }, [router]);
  return null;
}
