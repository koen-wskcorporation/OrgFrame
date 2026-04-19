begin;

create extension if not exists pg_net;

create or replace function public.enqueue_generate_embeddings_webhook()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb;
  function_url text := 'https://jmihjlikdxfhdnuhypue.supabase.co/functions/v1/generate-embeddings';
begin
  payload := jsonb_build_object(
    'type', tg_op,
    'table', tg_table_name,
    'schema', tg_table_schema,
    'record', case when tg_op = 'DELETE' then null else to_jsonb(new) end,
    'old_record', case when tg_op = 'DELETE' then to_jsonb(old) else null end
  );

  perform net.http_post(
    url := function_url,
    headers := '{"Content-Type": "application/json"}'::jsonb,
    body := payload
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.enable_generate_embeddings_trigger(target_schema text, target_table text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  trigger_name text := format('%s_enqueue_generate_embeddings', target_table);
begin
  execute format('drop trigger if exists %I on %I.%I', trigger_name, target_schema, target_table);
  execute format(
    'create trigger %I after insert or update or delete on %I.%I for each row execute procedure public.enqueue_generate_embeddings_webhook()',
    trigger_name,
    target_schema,
    target_table
  );
end;
$$;

-- Existing vectorized tables.
select public.enable_generate_embeddings_trigger('public', 'players');
select public.enable_generate_embeddings_trigger('public', 'program_teams');
select public.enable_generate_embeddings_trigger('public', 'calendar_items');

commit;
