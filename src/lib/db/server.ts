import { createClient } from "@supabase/supabase-js";
import ws from "ws";
import { requireEnv } from "@/lib/env";
import type { Database } from "./types";

// Server-only. Uses the service-role key: never import from client components.
let _client: ReturnType<typeof createClient<Database>> | null = null;
export function db() {
  if (!_client) {
    _client = createClient<Database>(
      requireEnv("NEXT_PUBLIC_SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
      { auth: { persistSession: false }, realtime: { transport: ws as unknown as typeof WebSocket } },
    );
  }
  return _client;
}
