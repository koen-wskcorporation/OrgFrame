begin;

-- AI-first workspace touchpoints (verification/hardening pass).
-- Keep RLS explicitly enabled on all mutation/query surfaces used by
-- `ai-workspace-actions` and `vector-retrieve`.

alter table if exists people.profiles enable row level security;
alter table if exists programs.program_teams enable row level security;
alter table if exists programs.program_team_members enable row level security;
alter table if exists calendar.calendar_items enable row level security;
alter table if exists calendar.calendar_item_occurrences enable row level security;
alter table if exists calendar.calendar_item_space_allocations enable row level security;
alter table if exists ai.audit_logs enable row level security;

commit;
