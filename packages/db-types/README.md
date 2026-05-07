# @orgframe/db-types

Generated TypeScript types for the Supabase schema.

## Regenerate

```sh
npm run db:types        # from repo root (writes packages/db-types/src/index.ts)
# or
npm run generate -w @orgframe/db-types
```

Requires `supabase login` and a linked project (`supabase link`). Re-run after
applying migrations so feature code can import row shapes from a single source
of truth instead of hand-rolled `features/*/types.ts`.
