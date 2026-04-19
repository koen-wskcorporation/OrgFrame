# `generate-embeddings` (Supabase Edge Function)

Generates embeddings for table change events and stores them in **Supabase Vector Buckets**.

## Architecture

- Embeddings are stored in a Vector Bucket/index, not in Postgres `pgvector` tables.
- Record updates are handled by deleting the existing vector key and writing a fresh vector.
- Record deletes remove the vector key.

## Expected Payload

Use a Supabase Database Webhook (or Realtime-forwarded payload) with this shape:

```json
{
  "type": "INSERT",
  "table": "players",
  "schema": "public",
  "record": {
    "id": "...",
    "first_name": "..."
  },
  "old_record": null
}
```

`DELETE` events should include `old_record`.

## Environment Variables

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AI_GATEWAY_API_KEY`

Optional:

- `AI_GATEWAY_BASE_URL` (default: `https://ai-gateway.vercel.sh/v1`)
- `AI_EMBEDDING_MODEL` (fallback chain: `AI_EMBEDDING_MODEL` -> `AI_MODEL` -> `google/gemini-embedding-001`)
- `VECTOR_BUCKET` (default: `orgframe-embeddings`)
- `VECTOR_INDEX` (default: `orgframe-documents`)
- `VECTOR_DISTANCE_METRIC` (default: `cosine`)
- `EMBEDDINGS_WEBHOOK_SECRET` (if set, request must include `Authorization: Bearer <secret>`)

## Deploy

```bash
supabase functions deploy generate-embeddings
```

## Sync Wiring

Current synced tables:

- `public.players`
- `public.program_teams`
- `public.calendar_items` (source table behind `org_events` view)

Function URL:

```text
https://<project-ref>.functions.supabase.co/generate-embeddings
```

Headers:

- `Authorization: Bearer <EMBEDDINGS_WEBHOOK_SECRET>` (if secret is configured)

Body template: use the default webhook payload (`type/table/schema/record/old_record`).

If your project uses DB triggers (recommended here), you do not need the Dashboard Webhooks integration toggle.

## Notes

- The function auto-creates the vector bucket and index if they are missing.
- If the index already exists with a different dimension than the generated embedding, the function returns an error.
- `organization_id` is stored in vector metadata for security-scoped querying.
- For future tables, run `select public.enable_generate_embeddings_trigger('public', '<table_name>');` after creating the table.
