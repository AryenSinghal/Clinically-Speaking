# EPRO Automation: architecture (hackathon)

END GOAL: an impressive live demo of three pipelines sharing one data model.
1. SETUP: upload protocol PDF -> Gemini -> StudyDetails, EDC template (form_field), timeline (visit), questionnaires. Researcher can edit/override everything.
2. RECRUITMENT: map + sliders to rank seeded candidates -> coordinator selects -> Vapi screening call -> transcript -> Gemini fills EDC fields with evidence quotes + flag (invalid/good/escalate) -> call accepted candidates to confirm + book first visit.
3. SURVEY: timeline-driven follow-up calls ("Simulate day N" button), same call->extract->review path.
Cross-cutting: human review page (audio + transcript + tagged EDC fields; click field -> audio jumps to evidence) and an escalation queue.

STACK: Next.js 16 (App Router, TS, Tailwind 4), Supabase (Postgres/Realtime/Storage), `@google/genai` via `src/lib/gemini.ts` (ONLY allowed LLM path; model from GEMINI_MODEL), Vapi via `src/lib/vapi.ts`.
NOTE: Next 16 has breaking changes. Read `node_modules/next/dist/docs/` before writing routes/pages (params are async Promises, etc).

SHARED CONTRACTS (do not change without asking the orchestrator):
- DB: `supabase/migrations/0001_init.sql`; row types in `src/lib/db/types.ts`; server client `db()` from `@/lib/db/server`, browser client `browserDb()` from `@/lib/db/client` (Realtime only).
- Zod/LLM schemas: `src/lib/schemas.ts`. LLM calls: `generateJSON({system,prompt,schema})`.
- Voice: `startVapiCall()`; our `call.id` travels in Vapi `metadata.callId`; webhook at `/api/vapi/webhook`.
- UI primitives: `src/components/ui.tsx` (Card, Button, Badge, inputCls). Plain Tailwind otherwise. Accent color violet.
- Current study: pages take `?study=<uuid>`; if absent, fall back to the most recent study (`order by created_at desc limit 1`). Helper: `src/lib/study.ts` (`getCurrentStudy(searchParams)`).
- API routes return JSON `{ ok: true, ... }` or `{ ok: false, error }` with proper status codes.
- Fake data only. All outbound calls pass through `DEMO_PHONE_OVERRIDE` when set.
