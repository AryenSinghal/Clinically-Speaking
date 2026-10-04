// Deterministically generates data/seed-candidates.json and supabase/seed.sql.
// Run: npx tsx scripts/gen-seed.ts
import { writeFileSync } from "node:fs";

type C = { id: string; name: string; phone: string; age: number; sex: string; conditions: string[]; city: string; state: string; lat: number; lng: number; notes: string | null };

let s = 20260314;
const rnd = () => { s = (s * 1664525 + 1013904223) % 4294967296; return s / 4294967296; };
const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)];
const int = (a: number, b: number) => a + Math.floor(rnd() * (b - a + 1));
const jitter = (v: number, km: number, lat?: number) => v + ((rnd() - 0.5) * 2 * km) / (lat === undefined ? 111 : 111 * Math.cos((lat * Math.PI) / 180));
const r5 = (n: number) => Math.round(n * 1e5) / 1e5;

const first = ["Aiden","Priya","Marcus","Sofia","Wei","Fatima","Liam","Chloe","Omar","Hannah","Diego","Grace","Kwame","Elena","Noah","Aisha","Ethan","Mei","Jonas","Rosa","Tariq","Nora","Caleb","Imani","Lucas","Anya","Samuel","Bianca","Raj","Molly","Victor","Yara","Owen","Daria","Isaac","Leila","Patrick","Camila","Dennis","Joan"];
const last = ["Nguyen","Patel","Johnson","Garcia","Chen","Ali","Murphy","Kim","Haddad","Cohen","Reyes","Foster","Mensah","Petrova","Walsh","Rahman","Sullivan","Zhang","Larsen","Alvarez","Khan","Doyle","Brooks","Okoye","Silva","Ivanova","Kelly","Costa","Sharma","Flynn","Romero","Hassan","Quinn","Novak","Bernard","Farah","Byrne","Lopez","Maguire","Park"];

const places = [
  { city: "Boston", state: "MA", lat: 42.3601, lng: -71.0589, area: "617", n: 20, km: 6 },
  { city: "Cambridge", state: "MA", lat: 42.3736, lng: -71.1097, area: "617", n: 7, km: 3 },
  { city: "Somerville", state: "MA", lat: 42.3876, lng: -71.0995, area: "617", n: 4, km: 2 },
  { city: "Quincy", state: "MA", lat: 42.2529, lng: -71.0023, area: "617", n: 4, km: 3 },
  { city: "Newton", state: "MA", lat: 42.337, lng: -71.2092, area: "617", n: 4, km: 3 },
  { city: "Worcester", state: "MA", lat: 42.2626, lng: -71.8023, area: "508", n: 8, km: 5 },
  { city: "Providence", state: "RI", lat: 41.824, lng: -71.4128, area: "401", n: 8, km: 5 },
];
const profiles: { w: number; c: string[] }[] = [
  { w: 5, c: ["type 2 diabetes", "hypertension"] },
  { w: 5, c: ["type 2 diabetes"] },
  { w: 5, c: ["hypertension"] },
  { w: 3, c: ["type 2 diabetes", "hypertension", "obesity"] },
  { w: 3, c: ["asthma"] },
  { w: 2, c: ["depression"] },
  { w: 2, c: ["obesity"] },
  { w: 2, c: ["hypertension", "hyperlipidemia"] },
  { w: 2, c: ["depression", "anxiety"] },
  { w: 2, c: ["migraine"] },
  { w: 1, c: ["type 1 diabetes"] },
  { w: 4, c: [] },
];
const bag = profiles.flatMap((p) => Array(p.w).fill(p.c) as string[][]);

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let n = 0, phoneN = 0;
const phone = (area: string) => `+1${area}555${String(100 + phoneN++ * 7 % 900).padStart(4, "0")}`;

const stars: Omit<C, "id" | "phone">[] = [
  { name: "Maria Santos", age: 52, sex: "female", conditions: ["type 2 diabetes", "hypertension"], city: "Boston", state: "MA", lat: 42.3398, lng: -71.0892, notes: "DEMO STAR: ideal match, 2 km from site." },
  { name: "James Whitfield", age: 58, sex: "male", conditions: ["type 2 diabetes", "hypertension"], city: "Cambridge", state: "MA", lat: 42.3662, lng: -71.1048, notes: "DEMO STAR: strong match, on stable metformin and lisinopril." },
  { name: "Tyler Brooks", age: 24, sex: "male", conditions: ["type 2 diabetes", "hypertension"], city: "Boston", state: "MA", lat: 42.3467, lng: -71.0972, notes: "DEMO DECOY: right conditions but outside the 30-70 age window." },
  { name: "Eleanor Hayes", age: 78, sex: "female", conditions: ["type 2 diabetes", "hypertension"], city: "Brookline", state: "MA", lat: 42.3318, lng: -71.1212, notes: "DEMO DECOY: right conditions, above the age window." },
  { name: "David Okafor", age: 61, sex: "male", conditions: ["type 2 diabetes", "hypertension", "depression"], city: "Brookline", state: "MA", lat: 42.3434, lng: -71.1265, notes: "DEMO ESCALATION: relevant comorbidity (depression), history of occasional chest tightness; should escalate on screening." },
  { name: "Linda Perez", age: 55, sex: "female", conditions: ["type 2 diabetes", "hypertension"], city: "Providence", state: "RI", lat: 41.8236, lng: -71.4222, notes: "DEMO STAR: perfect clinically but ~80 km from site; shows the distance slider." },
  { name: "Robert Kowalski", age: 45, sex: "male", conditions: [], city: "Boston", state: "MA", lat: 42.3505, lng: -71.0763, notes: "DEMO DECOY: healthy, no target conditions." },
  { name: "Aisha Rahman", age: 41, sex: "female", conditions: ["type 2 diabetes"], city: "Boston", state: "MA", lat: 42.3312, lng: -71.0719, notes: "DEMO: partial match (diabetes only); good for the weighting sliders." },
];

const out: C[] = [];
for (const st of stars) { const area = st.state === "RI" ? "401" : "617"; out.push({ id: uuid(++n), phone: phone(area), ...st }); }
for (const p of places) {
  for (let i = 0; i < p.n; i++) {
    const conds = pick(bag);
    const sex = rnd() < 0.5 ? "female" : "male";
    const base = conds.some((c) => c === "type 2 diabetes" || c === "hypertension") ? int(38, 80) : int(18, 85);
    const lat = jitter(p.lat, p.km), lng = jitter(p.lng, p.km, p.lat);
    out.push({
      id: uuid(++n), name: `${pick(first)} ${pick(last)}`, phone: phone(p.area), age: base, sex,
      conditions: [...conds], city: p.city, state: p.state, lat: r5(lat), lng: r5(lng), notes: null,
    });
  }
}
for (const c of out) { c.lat = r5(c.lat); c.lng = r5(c.lng); }

writeFileSync("data/seed-candidates.json", JSON.stringify(out, null, 2) + "\n");

const q = (v: string) => `'${v.replace(/'/g, "''")}'`;
const arr = (a: string[]) => (a.length ? `array[${a.map(q).join(",")}]::text[]` : "'{}'::text[]");
const rows = out.map((c) => `  (${q(c.id)}, null, ${q(c.name)}, ${q(c.phone)}, ${c.age}, ${q(c.sex)}, ${arr(c.conditions)}, ${q(c.city)}, ${q(c.state)}, ${c.lat}, ${c.lng}, 'suggested', ${c.notes ? q(c.notes) : "null"})`);
writeFileSync("supabase/seed.sql", `-- Synthetic demo registry (fake people, fake 555 numbers). Mirrors data/seed-candidates.json.
-- Generated by scripts/gen-seed.ts. Idempotent: existing ids are left untouched.
insert into candidate (id, study_id, name, phone, age, sex, conditions, city, state, lat, lng, status, notes) values
${rows.join(",\n")}
on conflict (id) do nothing;
`);
console.log(out.length, "candidates");
