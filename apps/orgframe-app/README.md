# Sports SaaS

Early-stage Next.js App Router project for multi-tenant sports organizations.

## Temporary Auth Verification (Production)

1. Deploy.
2. Visit `/api/auth/debug` before login. `hasSbCookies` should be `false`.
3. Login via the `/auth` form (server action).
4. Open `/api/auth/debug` after login and verify:
   - `hasSbCookies` is `true`
   - `sbCookieNames` contains `sb-*`
   - `getUserSucceeded` is `true`
   - `supabaseUserId` is non-null
5. If any check fails, use `host` and `x-forwarded-proto` from `/api/auth/debug` (and `/debug/headers` if needed) to diagnose proxy/protocol cookie handling.

## Supabase Auth Redirect Checklist

- In Supabase Dashboard, include exact redirect URLs for every environment:
  - `https://<production-domain>/auth/callback`
  - `http://localhost:3000/auth/callback`
- Ensure Site URL matches your production app origin.
- Keep auth cookies on app domain defaults (no custom cookie domain override in app code).

## Stack

- Next.js + TypeScript
- Tailwind CSS semantic tokens
- Supabase (Auth, Postgres, Storage)

## Branching + Deployment Setup

Use this branch strategy:

- `main` = production
- `develop` = staging/test environment
- `feature/*` = short-lived feature branches that merge into `develop`

### GitHub settings

1. Keep `main` as default branch.
2. Protect `main`:
   - Require pull request before merge
   - Require status checks to pass
   - Require branches to be up to date before merging
3. Protect `develop` with at least required status checks.
4. CI checks for both branches are defined in `.github/workflows/ci.yml`.

### Vercel settings

1. Connect this repository to one Vercel project.
2. Production branch: set to `main`.
3. Create/confirm a Preview deployment flow for `develop` and PR branches.
4. In Vercel Environment Variables:
   - Production: set production Supabase keys/URLs
   - Preview (used by `develop` and PR branches): set staging Supabase keys/URLs

### Supabase settings

1. Keep separate Supabase projects for production and staging.
2. In staging Supabase Auth settings:
   - Add staging callback URL: `https://<staging-domain>/auth/callback`
   - Include local callback URL: `http://localhost:3000/auth/callback`
3. In production Supabase Auth settings:
   - Add production callback URL: `https://<production-domain>/auth/callback`
4. Never reuse production service-role/secret keys in staging.

### Local environment files

- `.env.local`: local development values
- `.env.production`: production values template/source for deployment env setup
- `.env.develop.example`: develop/staging values template for dev branch deploys
- `.env.staging.example`: staging values template/source for deployment env setup

### Dev branch DB workflow

When shipping changes to `develop`, keep database changes isolated to staging:

1. Link Supabase CLI to staging project:
   - `supabase link --project-ref <staging-project-ref>`
2. Apply new migrations to staging:
   - `supabase db push`
3. Validate app behavior on `develop` deployment.
4. Promote to production only through `develop` -> `main`.

### Release flow

1. Branch from `develop` (`feature/*`).
2. Open PR into `develop`.
3. Validate in staging deployment.
4. Open PR `develop` -> `main` for release.
5. Merge to `main` to deploy production.

## Canonical Routes

Global routes:

- `/`
- `/auth`
- `/auth/logout`
- `/auth/reset`
- `/auth/callback`
- `/account`
- `/account/players`
- `/forbidden`
- `/api/auth/debug`

Org routes (`orgSlug` is always first segment):

- `/[orgSlug]`
- `/[orgSlug]/[pageSlug]`
- `/[orgSlug]/icon`
- `/[orgSlug]/manage`
- `/[orgSlug]/manage/site`
- `/[orgSlug]/manage/info`
- `/[orgSlug]/manage/branding`
- `/[orgSlug]/manage/access`
- `/[orgSlug]/manage/billing`
- `/[orgSlug]/manage/programs`
- `/[orgSlug]/manage/programs/[programId]`
- `/[orgSlug]/manage/forms`
- `/[orgSlug]/manage/forms/[formId]`
- `/[orgSlug]/manage/forms/[formId]/submissions`
- `/[orgSlug]/programs`
- `/[orgSlug]/programs/[programSlug]`
- `/[orgSlug]/register/[formSlug]`

## Branding Model

- App default accent: `#00EAFF`
- Org override: accent only (`brand_primary` in DB)
- Org accent is scoped inside org layout only

## Development

```bash
npm install
npm run dev
```

Quality checks:

```bash
npm run typecheck
npm run lint
```

## AI Assistant

Environment variables:

- `OPENAI_API_KEY` (required, server-only)
- `OPENAI_MODEL` (optional, defaults to `gpt-4.1-mini`)

API contract:

- `POST /api/ai`
- Request body:
  - `orgSlug?: string`
  - `userMessage: string`
  - `mode: "ask" | "act"`
  - `conversation: { role: "user" | "assistant"; content: string }[]`
  - `phase?: "plan" | "confirm" | "cancel"`
  - `proposalId?: string`
  - `entitySelections?: Record<string, string>`
- Response is SSE with events:
  - `assistant.delta`
  - `assistant.done`
  - `tool.call`
  - `tool.result`
  - `proposal.ready`
  - `execution.result`
  - `error`

Execution model:

1. User requests action in `act` mode.
2. Assistant resolves entities and produces a dry-run proposal + changeset.
3. UI shows **Confirm & Run**.
4. Server executes only after explicit confirm (`phase="confirm"`).
5. All act interactions are written to `audit_logs`.

### Adding a new AI Tool/Intent

1. Add a Zod input schema in [`modules/ai/schemas.ts`](/Users/koenstewart/Documents/Sports SaaS/modules/ai/schemas.ts).
2. Implement tool handler in [`modules/ai/tools/`](/Users/koenstewart/Documents/Sports SaaS/modules/ai/tools).
3. Define required permission(s), dry-run behavior, and execute behavior.
4. Register in [`modules/ai/tools/registry.ts`](/Users/koenstewart/Documents/Sports SaaS/modules/ai/tools/registry.ts) and expose JSON schema for OpenAI tool calling.
5. For executable actions, emit a versioned `AiChangesetV1` and wire confirm-time execution through `execute_changes`.
6. Add/extend migrations or RPCs as needed for transactional writes and stale-precondition checks.

## Google Sheets (User-Owned)

Forms -> Submissions -> Connect Google Sheets now uses a Google OAuth popup and creates the spreadsheet as the signed-in user.
To enable this flow, set:

- `GOOGLE_SHEETS_OAUTH_CLIENT_ID`
- `GOOGLE_SHEETS_OAUTH_CLIENT_SECRET`
- `GOOGLE_SHEETS_OAUTH_STATE_SECRET` (recommended; defaults to client secret if omitted)
- `GOOGLE_SHEETS_OAUTH_REDIRECT_URI` (optional; defaults to `/api/integrations/google-sheets/oauth/callback` on current origin)

The app still needs its runtime Sheets identity for ongoing sync/reconcile after the user-owned sheet is created:

- `GCP_SERVICE_ACCOUNT_EMAIL` or `GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL`

## Site Management

- Use `/{orgSlug}/manage/site` to manage pages and navigation.
- Page content is powered by `org_pages` + `org_page_blocks`.
- Navigation is powered by `org_nav_items`.

## Programs + Forms Architecture

- Programs data lives in `programs`, `program_nodes`, and `program_schedule_blocks`.
- Forms data lives in `org_forms`, `org_form_versions`, `org_form_submissions`, and `org_form_submission_entries`.
- Registration links forms to players and capacity via `program_registrations` and `submit_form_response(...)`.
- Public discovery and registration routes are canonical at `/{orgSlug}/programs` and `/{orgSlug}/register/{formSlug}`.
