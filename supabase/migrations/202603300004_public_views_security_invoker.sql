begin;

-- Views do not support ALTER TABLE ... ENABLE ROW LEVEL SECURITY.
-- Equivalent hardening: make views run with caller privileges so underlying
-- table RLS policies are enforced for anon/authenticated users.

do $$
declare
  r record;
begin
  for r in
    select schemaname, viewname
    from pg_catalog.pg_views
    where schemaname = 'public'
  loop
    execute format('alter view %I.%I set (security_invoker = true)', r.schemaname, r.viewname);
  end loop;
end
$$;

commit;
