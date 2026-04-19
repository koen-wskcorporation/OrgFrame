-- marketing_leads: inbound contact/demo form submissions from the public site.
-- Writes happen server-side via a Next.js server action using the anon
-- publishable key (same client as the rest of the web app), so an explicit
-- insert-only policy for anon is required. Reads are admin-only via the
-- Supabase dashboard or a future internal tool — no anon select policy.

create table if not exists public.marketing_leads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  name text not null check (char_length(name) between 1 and 200),
  email text not null check (char_length(email) between 3 and 320),
  org_name text check (org_name is null or char_length(org_name) <= 200),
  org_type text check (org_type is null or char_length(org_type) <= 80),
  topic text not null check (topic in ('demo', 'sales', 'roadmap', 'other')),
  message text check (message is null or char_length(message) <= 5000),
  source_path text check (source_path is null or char_length(source_path) <= 500),
  user_agent text check (user_agent is null or char_length(user_agent) <= 500),
  referrer text check (referrer is null or char_length(referrer) <= 500)
);

create index if not exists marketing_leads_created_at_idx
  on public.marketing_leads (created_at desc);

create index if not exists marketing_leads_topic_idx
  on public.marketing_leads (topic);

alter table public.marketing_leads enable row level security;

-- Insert-only policy for anonymous submissions from the public site.
drop policy if exists "marketing_leads_insert_anon" on public.marketing_leads;
create policy "marketing_leads_insert_anon"
  on public.marketing_leads
  for insert
  to anon, authenticated
  with check (true);

-- No select/update/delete policies: only service-role / dashboard access.
