begin;

-- Allow profiles to live at the account level (no org).
alter table people.profiles
  alter column org_id drop not null;

alter table people.profile_links
  alter column org_id drop not null;

-- Extra fields used by the account-level profile UI.
alter table people.profiles
  add column if not exists avatar_path text,
  add column if not exists sex text,
  add column if not exists school text,
  add column if not exists grade text,
  add column if not exists email text,
  add column if not exists address_json jsonb not null default '{}'::jsonb;

-- Recreate the existing self-uniqueness index so it covers both org-scoped and
-- account-only profile links. NULL values in unique indexes are treated as
-- distinct, so a separate partial index is needed for the account-only case.
create unique index if not exists people_profile_links_self_per_account_no_org_uidx
  on people.profile_links (account_user_id)
  where relationship_type = 'self' and account_user_id is not null and org_id is null;

-- SECURITY DEFINER helper: does the current user have a managing link to this
-- profile? Used inside the profile RLS so we can support guardian/manager
-- access without recursive RLS evaluation on profile_links.
create or replace function people.current_user_manages_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, people
as $$
  select exists (
    select 1 from people.profile_links link
    where link.profile_id = target_profile_id
      and link.account_user_id = auth.uid()
      and link.can_manage = true
  );
$$;

drop policy if exists people_profiles_read on people.profiles;
create policy people_profiles_read on people.profiles
for select
using (
  (org_id is not null and public.has_org_permission(org_id, 'people.read'))
  or person_user_id = auth.uid()
  or people.current_user_manages_profile(people.profiles.id)
);

drop policy if exists people_profiles_write on people.profiles;
create policy people_profiles_write on people.profiles
for all
using (
  (org_id is not null and public.has_org_permission(org_id, 'people.write'))
  or person_user_id = auth.uid()
  or people.current_user_manages_profile(people.profiles.id)
)
with check (
  (org_id is not null and public.has_org_permission(org_id, 'people.write'))
  or person_user_id = auth.uid()
  or people.current_user_manages_profile(people.profiles.id)
);

-- Profile_links policies stay non-recursive: users see their own links plus
-- links on profiles where they are the person. Cross-account share management
-- is performed server-side via service role.
drop policy if exists people_profile_links_read on people.profile_links;
create policy people_profile_links_read on people.profile_links
for select
using (
  (org_id is not null and public.has_org_permission(org_id, 'people.read'))
  or account_user_id = auth.uid()
  or exists (
    select 1 from people.profiles profile
    where profile.id = people.profile_links.profile_id
      and profile.person_user_id = auth.uid()
  )
);

drop policy if exists people_profile_links_write on people.profile_links;
create policy people_profile_links_write on people.profile_links
for all
using (
  (org_id is not null and public.has_org_permission(org_id, 'people.write'))
  or account_user_id = auth.uid()
)
with check (
  (org_id is not null and public.has_org_permission(org_id, 'people.write'))
  or account_user_id = auth.uid()
);

commit;
