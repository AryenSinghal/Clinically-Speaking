// Seeds the synthetic candidate registry. Run: npx tsx --env-file=.env.local scripts/seed.ts [--reset]
// Idempotent: stable ids; existing rows are left alone unless --reset (which restores seed fields and status).
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import ws from "ws";

type Seed = { id: string; name: string; phone: string; age: number; sex: string; conditions: string[]; city: string; state: string; lat: number; lng: number; notes: string | null };

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)");
  const reset = process.argv.includes("--reset");
  const seeds = JSON.parse(readFileSync(new URL("../data/seed-candidates.json", import.meta.url), "utf8")) as Seed[];
  const sb = createClient(url, key, { auth: { persistSession: false }, realtime: { transport: ws as unknown as typeof WebSocket } });
  const rows = seeds.map((c) => reset
    ? { ...c, study_id: null, status: "suggested", fit_score: null, enrolled_at: null }
    : { ...c, study_id: null, status: "suggested" });
  const { error } = await sb.from("candidate").upsert(rows, { onConflict: "id", ignoreDuplicates: !reset });
  if (error) throw error;
  const { count } = await sb.from("candidate").select("id", { count: "exact", head: true });
  console.log(`Seeded ${seeds.length} candidates (${reset ? "reset" : "insert-missing"}); candidate table now has ${count} rows.`);
}
main().catch((e) => { console.error(e); process.exit(1); });
