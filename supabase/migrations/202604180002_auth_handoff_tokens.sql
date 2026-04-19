begin;

create table if not exists public.auth_handoff_tokens (
  nonce text primary key,
  target_origin text not null,
  next_path text not null default '/',
  encrypted_payload bytea not null,
  iv bytea not null,
  auth_tag bytea not null,
  user_id uuid,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz
);

create index if not exists auth_handoff_tokens_expires_at_idx
  on public.auth_handoff_tokens (expires_at);

create index if not exists auth_handoff_tokens_user_id_idx
  on public.auth_handoff_tokens (user_id)
  where consumed_at is null;

alter table public.auth_handoff_tokens enable row level security;
-- No policies. Service role bypasses RLS and is the only caller.

commit;
