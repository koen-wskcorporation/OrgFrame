begin;

create table if not exists public.players (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  date_of_birth date,
  gender text,
  jersey_size text,
  medical_notes text,
  metadata_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint players_name_nonempty check (
    char_length(trim(first_name)) > 0 and char_length(trim(last_name)) > 0
  )
);

create table if not exists public.player_guardians (
  id uuid primary key default gen_random_uuid(),
  player_id uuid not null references public.players(id) on delete cascade,
  guardian_user_id uuid not null references auth.users(id) on delete cascade,
  relationship text,
  can_manage boolean not null default true,
  created_at timestamptz not null default now(),
  unique (player_id, guardian_user_id)
);

create index if not exists players_owner_idx on public.players (owner_user_id, created_at desc);
create index if not exists players_name_idx on public.players (last_name, first_name);
create index if not exists player_guardians_user_idx on public.player_guardians (guardian_user_id, created_at desc);
create index if not exists player_guardians_player_idx on public.player_guardians (player_id, created_at desc);

drop trigger if exists players_set_updated_at on public.players;
create trigger players_set_updated_at before update on public.players for each row execute procedure public.set_updated_at();

create or replace function public.is_player_guardian(target_player_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.player_guardians guardian
    where guardian.player_id = target_player_id
      and guardian.guardian_user_id = auth.uid()
  );
$$;

alter table public.players enable row level security;
alter table public.player_guardians enable row level security;

drop policy if exists players_guardian_read on public.players;
create policy players_guardian_read on public.players
  for select
  using (
    owner_user_id = auth.uid()
    or public.is_player_guardian(id)
  );

drop policy if exists players_guardian_insert on public.players;
create policy players_guardian_insert on public.players
  for insert
  with check (
    owner_user_id = auth.uid()
  );

drop policy if exists players_guardian_update on public.players;
create policy players_guardian_update on public.players
  for update
  using (
    owner_user_id = auth.uid()
    or public.is_player_guardian(id)
  )
  with check (
    owner_user_id = auth.uid()
    or public.is_player_guardian(id)
  );

drop policy if exists players_guardian_delete on public.players;
create policy players_guardian_delete on public.players
  for delete
  using (owner_user_id = auth.uid());

drop policy if exists player_guardians_read on public.player_guardians;
create policy player_guardians_read on public.player_guardians
  for select
  using (
    guardian_user_id = auth.uid()
    or exists (
      select 1
      from public.players player
      where player.id = player_guardians.player_id
        and player.owner_user_id = auth.uid()
    )
    or public.is_player_guardian(player_id)
  );

drop policy if exists player_guardians_insert on public.player_guardians;
create policy player_guardians_insert on public.player_guardians
  for insert
  with check (
    guardian_user_id = auth.uid()
    or exists (
      select 1
      from public.players player
      where player.id = player_guardians.player_id
        and (
          player.owner_user_id = auth.uid()
          or public.is_player_guardian(player.id)
        )
    )
  );

drop policy if exists player_guardians_update on public.player_guardians;
create policy player_guardians_update on public.player_guardians
  for update
  using (
    guardian_user_id = auth.uid()
    or exists (
      select 1
      from public.players player
      where player.id = player_guardians.player_id
        and (
          player.owner_user_id = auth.uid()
          or public.is_player_guardian(player.id)
        )
    )
  )
  with check (
    guardian_user_id = auth.uid()
    or exists (
      select 1
      from public.players player
      where player.id = player_guardians.player_id
        and (
          player.owner_user_id = auth.uid()
          or public.is_player_guardian(player.id)
        )
    )
  );

drop policy if exists player_guardians_delete on public.player_guardians;
create policy player_guardians_delete on public.player_guardians
  for delete
  using (
    guardian_user_id = auth.uid()
    or exists (
      select 1
      from public.players player
      where player.id = player_guardians.player_id
        and (
          player.owner_user_id = auth.uid()
          or public.is_player_guardian(player.id)
        )
    )
  );

-- Ensure each player automatically includes the owner as a guardian.
insert into public.player_guardians (player_id, guardian_user_id, relationship, can_manage)
select
  player.id,
  player.owner_user_id,
  'owner',
  true
from public.players player
on conflict (player_id, guardian_user_id) do nothing;

commit;
