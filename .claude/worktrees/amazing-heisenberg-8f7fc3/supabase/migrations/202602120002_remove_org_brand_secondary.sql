do $$
begin
  execute 'alter table public.orgs drop column if exists ' || quote_ident('brand' || '_' || 'secondary');
end
$$;
