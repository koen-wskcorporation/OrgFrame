begin;

create or replace function public.has_org_permission(target_org_id uuid, required_permission text)
returns boolean
language sql
stable
security definer
set search_path = public, core
as $$
  with membership as (
    select membership.role
    from core.org_memberships membership
    where membership.org_id = target_org_id
      and membership.user_id = auth.uid()
    limit 1
  ),
  role_permissions as (
    select
      case membership.role
        when 'admin' then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.branding.write',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'events.read',
          'events.write',
          'facilities.read',
          'facilities.write',
          'calendar.read',
          'calendar.write',
          'communications.read',
          'communications.write'
        ]::text[]
        when 'member' then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read',
          'programs.read',
          'forms.read',
          'events.read',
          'calendar.read',
          'facilities.read',
          'communications.read'
        ]::text[]
        when 'user' then array[
          'org.dashboard.read',
          'org.branding.read',
          'org.pages.read',
          'programs.read',
          'forms.read',
          'events.read',
          'calendar.read',
          'facilities.read',
          'communications.read'
        ]::text[]
        when 'manager' then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'calendar.read',
          'calendar.write',
          'events.read',
          'events.write'
        ]::text[]
        when 'owner' then array[
          'org.dashboard.read',
          'org.manage.read',
          'org.branding.read',
          'org.branding.write',
          'org.pages.read',
          'org.pages.write',
          'programs.read',
          'programs.write',
          'forms.read',
          'forms.write',
          'events.read',
          'events.write',
          'facilities.read',
          'facilities.write',
          'calendar.read',
          'calendar.write',
          'communications.read',
          'communications.write'
        ]::text[]
        else coalesce(
          (
            select custom_role.permissions
            from core.org_custom_roles custom_role
            where custom_role.org_id = target_org_id
              and custom_role.role_key = membership.role
            limit 1
          ),
          array[]::text[]
        )
      end as permissions
    from membership
  )
  select exists (
    select 1
    from role_permissions
    where required_permission = any(role_permissions.permissions)
  );
$$;

grant execute on function public.has_org_permission(uuid, text) to anon, authenticated, service_role;

commit;
