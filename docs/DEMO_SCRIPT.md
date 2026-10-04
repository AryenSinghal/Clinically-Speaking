# 5 minute demo script

Before going on stage: DB seeded, tunnel running, `PUBLIC_URL` set, `DEMO_PHONE_OVERRIDE` set to the presenter phone, phone on loud. Open the app on `/`.

## 0:00 Hook (30s)
"Running a trial means paperwork before the first patient and endless phone calls after. We automate both, with a human in the loop where it matters." Show the home page: three pipelines, header stepper.

## 0:30 Setup (60s)
1. Go to **Setup**, upload the sample protocol PDF.
2. While Gemini works, say: it drafts study details, the EDC form with validation, a visit timeline and questionnaires.
3. Show an edit: change a field label or range. "The researcher always has the last word."
4. Stepper in the header now shows fields and visits counts.

## 1:30 Recruitment (90s)
1. **Recruitment**: map and sliders re-rank candidates live (age, distance, condition match).
2. Select the candidate whose number is your phone, click **Call**.
3. Answer the screening call. Give one clearly eligible answer set.
4. Watch the status chip go ringing, in progress, extracting, complete.

## 3:00 Review (60s)
Open the call in **/review/<id>**. Click an EDC field: the audio jumps to the evidence quote. Point out the flag and confidence. "Every value is traceable."

## 4:00 Survey and escalation (60s)
1. **Survey**. If nobody is enrolled yet, click **Demo: enroll a candidate**.
2. Drag **Simulate day** to the first follow-up. The cell turns **Due**. Click **Call now**.
3. During the call say something worrying ("chest pain since yesterday").
4. The Escalations badge in the header turns red. Open **Escalations**, show the reason, resolve it.

## 4:45 Close (15s)
"Same data model, three pipelines, human review. Compliance (HIPAA, TCPA, Part 11) is the next step."

## Fallback plan

| Problem | Fallback |
| --- | --- |
| Gemini slow or rejects model | Set `GEMINI_MODEL` to a working model and restart; or use a pre-created study (Setup page keeps it) |
| Phone call does not connect (tunnel, Vapi, carrier) | Call `POST /api/calls/seed-demo` to create a finished demo call with transcript and extraction, then open it in `/review/<id>` |
| No candidate enrolled | Survey page, **Demo: enroll a candidate** |
| Realtime not updating | Refresh the page; status also polls every 15s |
| Wi-Fi dead | Show a pre-recorded run of the same flow |

Tip: run the seed-demo endpoint once before the demo so Escalations and Recent calls are never empty.

## Bonus: visit reminder call

On the Survey page, use "Jump to > Reminder: Week 6 Clinic Visit" (study day 41). The participant's reminder turns
**Due**; press **Remind now**. The agent reminds them their visit is tomorrow and asks if they can attend. Say "yes" to see
**Attending**, or "I can't make it" to see **Can't attend** (flagged for the team to reschedule).
