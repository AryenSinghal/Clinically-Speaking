-- EPRO Automation: hackathon schema. RLS intentionally off (demo, fake data, service-role key server-side).

create extension if not exists "pgcrypto";

create table study (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  protocol_text text,
  protocol_pdf_url text,
  details jsonb,                 -- StudyDetails (see src/lib/schemas.ts)
  site jsonb,                    -- { name, city, state, lat, lng }
  status text not null default 'draft',   -- draft | setup_complete | recruiting | active
  created_at timestamptz not null default now()
);

create table questionnaire (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references study(id) on delete cascade,
  kind text not null check (kind in ('recruitment','follow_up')),
  title text not null,
  items jsonb not null default '[]',      -- QuestionnaireItem[]
  origin text not null default 'suggested' check (origin in ('suggested','uploaded')),
  created_at timestamptz not null default now()
);

create table visit (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references study(id) on delete cascade,
  name text not null,
  type text not null check (type in ('clinic','survey_call')),
  day_offset int not null,                -- days from enrollment (day 0)
  window_days int not null default 0,
  questionnaire_id uuid references questionnaire(id) on delete set null,
  notes text,
  position int not null default 0
);

create table form_field (
  id uuid primary key default gen_random_uuid(),
  study_id uuid not null references study(id) on delete cascade,
  section text not null,
  key text not null,                      -- snake_case, unique per study
  label text not null,
  type text not null check (type in ('text','number','integer','boolean','date','select','multiselect')),
  unit text,
  required boolean not null default false,
  options jsonb,                          -- string[] for select/multiselect
  validation jsonb,                       -- { min, max, regex, note }
  source text not null default 'ai_draft' check (source in ('ai_draft','researcher_edited','uploaded')),
  position int not null default 0,
  unique (study_id, key)
);

create table candidate (
  id uuid primary key default gen_random_uuid(),
  study_id uuid references study(id) on delete cascade,
  name text not null,
  phone text not null,                    -- E.164; demo: team phones only
  age int not null,
  sex text not null,
  conditions text[] not null default '{}',
  city text,
  state text,
  lat double precision not null,
  lng double precision not null,
  fit_score double precision,             -- 0..100, computed by recruitment scoring
  status text not null default 'suggested'
    check (status in ('suggested','selected','screened','invalid','good','accepted','enrolled')),
  enrolled_at date,                       -- day 0 for survey timeline
  notes text,
  created_at timestamptz not null default now()
);

create table call (
  id uuid primary key default gen_random_uuid(),
  study_id uuid references study(id) on delete cascade,
  candidate_id uuid references candidate(id) on delete cascade,
  kind text not null check (kind in ('screening','confirmation','survey','reminder')),
  visit_id uuid references visit(id) on delete set null,
  vapi_call_id text unique,
  status text not null default 'queued'
    check (status in ('queued','ringing','in_progress','ended','failed','extracting','complete')),
  recording_url text,
  transcript text,
  summary text,
  flag text check (flag in ('invalid','good','escalate')),
  flag_reason text,
  escalation_resolved boolean not null default false,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz not null default now()
);

create table transcript_event (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references call(id) on delete cascade,
  seq int not null,
  role text not null check (role in ('agent','participant')),
  text text not null,
  start_ms int,
  end_ms int,
  unique (call_id, seq)
);

create table field_value (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references call(id) on delete cascade,
  field_id uuid not null references form_field(id) on delete cascade,
  value text,                             -- stringified; parse by form_field.type
  evidence_quote text,
  evidence_start_ms int,
  evidence_end_ms int,
  confidence double precision,
  review_status text not null default 'pending' check (review_status in ('pending','confirmed','corrected')),
  unique (call_id, field_id)
);

create index on visit (study_id, position);
create index on form_field (study_id, position);
create index on call (study_id, created_at desc);
create index on call (candidate_id);
create index on transcript_event (call_id, seq);
create index on field_value (call_id);

-- Realtime for live transcript / escalation badges
alter publication supabase_realtime add table call;
alter publication supabase_realtime add table transcript_event;
alter publication supabase_realtime add table field_value;

-- Storage bucket for call recordings (public: fake data only)
insert into storage.buckets (id, name, public) values ('recordings','recordings', true)
  on conflict (id) do nothing;

-- Demo: make sure RLS is off so the browser (anon key) can read for Realtime / live views.
alter table study            disable row level security;
alter table questionnaire    disable row level security;
alter table visit            disable row level security;
alter table form_field       disable row level security;
alter table candidate        disable row level security;
alter table call             disable row level security;
alter table transcript_event disable row level security;
alter table field_value      disable row level security;
