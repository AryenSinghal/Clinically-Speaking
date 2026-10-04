"use client";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "./types";

// Browser client (anon key). Use only for Realtime subscriptions / public reads.
let _client: ReturnType<typeof createClient<Database>> | null = null;
export function browserDb() {
  if (!_client) {
    _client = createClient<Database>(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return _client;
}
