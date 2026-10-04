# EPRO Automation

AI-assisted clinical study operations in one app: turn a protocol PDF into an EDC and visit timeline, recruit participants with an AI voice agent, and run scheduled follow-up surveys by phone. Every extracted answer links to the exact audio and quote that supports it, and risky calls land in a human escalation queue.

> Hackathon prototype. All data is synthetic. Not for real patients.

## The three pipelines

1. **Setup** (`/setup`): upload a protocol PDF. Gemini drafts study details, the EDC form (fields, types, validation), the visit timeline and questionnaires. The researcher edits or overrides everything.
2. **Recruitment** (`/recruitment`): rank seeded candidates on a map with sliders, select, and place a Vapi screening call. The transcript is extracted into EDC fields with evidence quotes and a flag (`invalid` / `good` / `escalate`). Accepted candidates get a confirmation call and first-visit booking.
3. **Survey** (`/survey`): enrolled participants x survey visits matrix. "Simulate day N" shows which follow-up calls are due; "Call now" starts the same call, extract and review path.

Cross-cutting: `/review/[callId]` (audio, transcript, tagged EDC fields; click a field and the audio jumps to the evidence) and `/escalations` (queue of flagged calls, live red badge in the header).

## Architecture

```
            +----------------------+
 Browser -->|  Next.js 16 (App     |--- Realtime (anon key) ---+
            |  Router, Tailwind 4) |                           |
            +----------+-----------+                           v
                       | server routes / components     +--------------+
                       | (service-role key, server only)|  Supabase    |
                       +--------------------------------+  Postgres,   |
                       |                                |  Realtime,   |
        protocol text  |   transcript                   |  Storage     |
                       v                                +------^-------+
                 +-----------+                                 |
                 |  Gemini   |  structured JSON (zod)          |
                 |  (genai)  |                                 |
                 +-----------+                                 |
                                                               |
 Participant phone <--> Vapi voice agent --webhook (PUBLIC_URL)+
                         POST /api/vapi/webhook: transcript, recording, end-of-call
```

Call lifecycle: `queued -> ringing -> in_progress -> ended -> extracting -> complete`. Our `call.id` travels in Vapi `metadata.callId`; the webhook stores the transcript and recording, Gemini extracts fields and a flag, and Realtime pushes the status to the UI.

## Stack

Next.js 16 (App Router, TypeScript), Tailwind 4, Supabase (Postgres, Realtime, Storage), `@google/genai` (only LLM path, `src/lib/gemini.ts`), Vapi (`src/lib/vapi.ts`), zod, maplibre-gl, wavesurfer.js.

## Environment variables

Copy `.env.example` to `.env.local`.

| Variable | Purpose |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Anon key, browser Realtime only |
| `SUPABASE_SERVICE_ROLE_KEY` | Service key, server only, never exposed to the client |
| `GEMINI_API_KEY` | Google AI Studio key |
| `GEMINI_MODEL` | Gemini model name (default `gemini-3.8-flash`); change it if the API rejects the name |
| `VAPI_API_KEY` | Vapi private API key |
| `VAPI_PHONE_NUMBER_ID` | Vapi outbound phone number id |
| `PUBLIC_URL` | Public https URL of this app (ngrok or cloudflared) for Vapi webhooks |
| `VAPI_LLM_MODEL` | Optional model for Vapi's voice agent (defaults to `GEMINI_MODEL`) |
| `DEMO_PHONE_OVERRIDE` | E.164 number; when set, every outbound call is redirected there |

## Setup

See [docs/SETUP.md](docs/SETUP.md) for the checklist. In short:

1. Create a Supabase project. Run `supabase/migrations/0001_init.sql` in the SQL editor (or `npx supabase db push` after `supabase link`).
2. Fill `.env.local`.
3. `npm install`, then `npm run seed` to load synthetic candidates.
4. Buy or import a Vapi phone number, put its id in `VAPI_PHONE_NUMBER_ID`.
5. Start a tunnel (`ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000`) and set `PUBLIC_URL` to the https URL.
6. Set `DEMO_PHONE_OVERRIDE` to your own phone.
7. `npm run dev`, open http://localhost:3000.

## Project layout

```
src/app/                 pages and API routes (setup, recruitment, survey, review, escalations, api/*)
src/components/shell/    top nav, pipeline stepper, live status hook
src/components/survey/   survey matrix and simulate-day control
src/components/ui.tsx    shared primitives (Card, Button, Badge)
src/lib/schemas.ts       zod schemas used for Gemini structured output
src/lib/db/              Supabase clients and row types
src/lib/survey.ts        pure "which survey calls are due" logic
src/lib/gemini.ts        the only LLM entry point
src/lib/vapi.ts          Vapi call start and webhook helpers
supabase/migrations/     database schema
docs/                    demo script and setup checklist
```
