-- Reminder calls: an automated call the day before each clinic visit.
-- Run once in the Supabase SQL editor on an existing project (fresh setups already include this via 0001).
alter table call drop constraint if exists call_kind_check;
alter table call add constraint call_kind_check check (kind in ('screening','confirmation','survey','reminder'));
