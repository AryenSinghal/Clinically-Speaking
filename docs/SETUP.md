# Setup checklist

## Accounts
- [ ] Supabase project created
- [ ] Google AI Studio API key
- [ ] Vapi account, API key, and an outbound phone number
- [ ] ngrok or cloudflared installed

## Database
- [ ] Run `supabase/migrations/0001_init.sql` in the Supabase SQL editor (or `npx supabase link` then `npx supabase db push`)
- [ ] Confirm `call`, `transcript_event`, `field_value` are in the `supabase_realtime` publication (the migration does this)
- [ ] Confirm storage bucket `recordings` exists

## Environment
- [ ] `cp .env.example .env.local`
- [ ] `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (Project settings, API)
- [ ] `GEMINI_API_KEY`, and `GEMINI_MODEL` if the default is rejected
- [ ] `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID`
- [ ] `DEMO_PHONE_OVERRIDE` set to your phone in E.164 (e.g. +14155550123)

## Run
- [ ] `npm install`
- [ ] `npm run seed` (synthetic candidates)
- [ ] Start tunnel: `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`
- [ ] Put the https tunnel URL in `PUBLIC_URL`
- [ ] `npm run dev`, open http://localhost:3000
- [ ] Restart `npm run dev` whenever the tunnel URL or env changes

## Smoke test
- [ ] Home page loads with "Start with Setup" (empty DB) and no errors
- [ ] `POST /api/calls/seed-demo` creates a call; it appears under Recent calls and opens in `/review/<id>`
- [ ] Survey page: "Demo: enroll a candidate", drag Simulate day, a cell shows Due
- [ ] A real call rings `DEMO_PHONE_OVERRIDE`

## Troubleshooting
- Header badge or live status never updates: check anon key and that Realtime is enabled for `call`.
- Vapi cannot reach webhook: `PUBLIC_URL` must be https and the tunnel running; open it in a browser to verify.
- Gemini 404 or model error: change `GEMINI_MODEL`.

## Existing project? Enable reminder calls (one-time)

Reminder calls (an automated call the day before each clinic visit) add a new call type. If you created your database
before this feature, run `supabase/migrations/0002_reminder_calls.sql` once in the Supabase SQL editor:

```sql
alter table call drop constraint if exists call_kind_check;
alter table call add constraint call_kind_check check (kind in ('screening','confirmation','survey','reminder'));
```

Fresh projects already include it via `0001_init.sql`.

## "Daily outbound call limit" from Vapi

Phone numbers bought through Vapi have a small daily outbound call cap (reportedly about 10/day; check your Vapi dashboard).
Every test call, including failed rehearsals, counts. To remove the cap, import a Twilio number into Vapi
(Vapi dashboard > Phone Numbers > Import > Twilio), then set `VAPI_PHONE_NUMBER_ID` in `.env.local` to the new number's ID and restart.
A Twilio trial account can only call numbers you have verified and plays a short "trial account" message first; upgrading removes both.
Budget your calls before a demo, and keep `POST /api/calls/seed-demo` ready as a fallback.
