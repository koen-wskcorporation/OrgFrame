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

drop trigger if exists players_enqueue_generate_embeddings on public.players;
create trigger players_enqueue_generate_embeddings
after insert or update or delete on public.players
for each row execute procedure public.enqueue_generate_embeddings_webhook();

commit;
