# OrgFrame Current Architecture (Deep Dive)

Last verified against repository state: April 3, 2026

This document describes the architecture as implemented in code today (not aspirational design).

## 1) Monorepo Topology

OrgFrame is an npm workspaces monorepo:

- `apps/orgframe-app`: primary multi-tenant product app (Next.js App Router)
- `apps/orgframe-web`: marketing/landing site (separate Next.js app)
- `packages/auth`: shared auth primitives (framework-agnostic wrappers)
- `packages/ui`: shared UI primitives (design-system-level components only)
- `packages/theme`: shared tokens/Tailwind preset/styles
- `supabase/migrations`: authoritative database evolution
- `supabase/functions`: edge/background processing functions
- `docs/architecture`: architectural policy + documentation

Top-level orchestration lives in root `package.json` and `scripts/dev-launch.mjs`.

## 2) Architectural Ownership Model

Canonical folder ownership is documented in `docs/architecture/folder-architecture.md` and is actively reflected in source:

- Product/domain logic belongs in app feature modules:
  - `apps/orgframe-app/src/features/*`
- App-wide infrastructure belongs in app shared modules:
  - `apps/orgframe-app/src/shared/*`
- Cross-app reusable building blocks belong in packages:
  - `packages/auth`, `packages/ui`, `packages/theme`

### Practical boundary rules in current code

- Feature modules own:
  - UI composition
  - server actions
  - db query functions
  - orchestration for that domain
- `src/shared/*` currently contains:
  - domain routing + host parsing
  - Supabase client/config bootstrapping
  - org context resolution and permission helpers
- `packages/ui` exports primitives only (button/card/panel/etc.), no product feature logic.
- `packages/auth` exports generic auth builders (`buildGetSessionUser`, `buildRequireAuth`) that app code wires to its own client factory.

## 3) Runtime Surfaces

### 3.1 Primary app (`apps/orgframe-app`)

Framework: Next.js App Router with server components + server actions + route handlers.

Key runtime entrypoints:

- Root app shell: `apps/orgframe-app/app/layout.tsx`
- Org shell: `apps/orgframe-app/app/[orgSlug]/layout.tsx`
- Tools/manage shell: `apps/orgframe-app/app/[orgSlug]/tools/layout.tsx`
- Proxy middleware-equivalent: `apps/orgframe-app/proxy.ts`
- API surface: `apps/orgframe-app/app/api/**/route.ts`

### 3.2 Marketing app (`apps/orgframe-web`)

Separate deployable Next.js app for marketing pages, with slimmer structure and auth/session proxy passthrough.

## 4) Request and Routing Architecture

## 4.1 Host-aware multi-tenant routing

`apps/orgframe-app/proxy.ts` implements the domain router and session updater.

Core responsibilities:

- Parses effective request host from `x-forwarded-host`, `host`, and URL.
- Distinguishes platform hosts vs tenant hosts.
- Resolves org subdomain routing (`{orgSlug}.{baseHost}`).
- Resolves custom domains by RPC (`resolve_org_slug_for_domain`).
- Rewrites visible non-prefixed URLs to internal `/{orgSlug}/...` route space.
- Redirects legacy org-prefixed paths back to canonical host-based URLs.
- Normalizes old manage paths (`/manage*`) to new `/tools/manage*` paths.
- Delegates session refresh/write via data-api proxy wrapper.

This means tenant identity is derived primarily at edge/proxy time and then consumed by route layouts/components.

## 4.2 Route-layer thinness

Route files generally:

- resolve params
- call org/auth/context helpers
- gate by permissions/tool flags
- delegate business logic to `src/features/*`
- render feature components

Example pattern:

- `app/[orgSlug]/tools/programs/page.tsx`:
  - gets org context
  - checks tool enablement + permission
  - calls feature query `listProgramsForManage`
  - renders `ProgramsManagePanel`

## 5) Identity, Auth, and Permissions

## 5.1 Auth foundation

- Supabase auth is the identity source.
- App code builds session helpers using `@orgframe/auth` package builders.
  - Example: `src/features/core/auth/server/getSessionUser.ts` calls `buildGetSessionUser(createSupabaseServer)`.

## 5.2 Org context resolution

Two main context helpers:

- `getOrgRequestContext`: public + optional membership/capabilities
- `getOrgAuthContext`: authenticated membership-required context for org operations

`getOrgAuthContext` behavior:

- validates org slug (reserved slug guard)
- enforces authentication
- fetches org and membership data
- contains a service-role fallback when membership lookup fails due to RLS drift
- resolves role permissions (including custom roles)
- filters permissions by org tool availability

## 5.3 Permission model

- Primitive permission checks via `can(...)` and `requireOrgPermission(...)`
- Capability aggregation via `getOrgCapabilities(...)`
- Capability object drives nav visibility and tool access states (`manage`, `pages`, `programs`, etc.)

## 6) Data Access Architecture

## 6.1 Data API gateway layer

App code is migrating to a centralized wrapper layer:

- `src/shared/data-api/*` wraps `src/shared/supabase/*`

This indirection provides:

- centralized client creation and config
- migration-safe aliases for legacy imports
- consistent server/public/service-role entrypoints

## 6.2 Supabase client patterns

Current patterns in code:

- request-scoped server client for RSC/actions/routes
- service-role client for privileged operations
- shared public client for lookup use cases (e.g., domain resolution)
- proxy/session update hooks for cookie lifecycle

## 6.3 Schema-oriented domain split

Feature query code and migrations show a schema-per-domain model.
Observed schema usage frequencies in source are highest for:

- `programs`
- `forms`
- `orgs`
- `commerce`
- `people`
- `imports`
- `calendar`
- `site`
- `communications`
- `facilities`
- plus supporting schemas (`files`, `notifications`, `ai`)

This reflects a modular relational design where domain boundaries are explicit at the database schema layer.

## 7) Feature Architecture (Primary App)

`apps/orgframe-app/src/features` is domain-organized. Notable modules:

- `core`: shared product concerns (layout, navigation, auth wiring, dashboard)
- `site`: org page builder/runtime blocks and site structure
- `programs`: program catalog/structure/schedule + teams
- `forms`: form builder/submissions/integrations
- `calendar`: unified calendar views + event orchestration
- `facilities`: spaces, reservations, blackout/schedule logic
- `people` and `players`: roster/person entities and UI
- `communications`: inbox/integrations normalization and scoring
- `billing` + `orders`: Stripe Connect and payment surfaces
- `ai`: assistant context, tool registry, gateway orchestration, execution lifecycle
- `imports`: smart import pipeline
- `files`: upload and manager surfaces
- `org-share`, `access`: cross-entity sharing and account/org access controls

### Repeating implementation pattern by feature

Most mature features follow this internal shape:

- `actions.ts`: server actions / mutation orchestration / revalidation
- `db/queries.ts`: query layer, row mapping, schema-bound SQL API calls
- `components/*`: UI and workspace surfaces
- `types.ts`: feature-local domain types

## 8) AI Subsystem Architecture

AI stack is first-class in the app and intentionally two-phase for safe writes.

Key parts:

- endpoint: `app/api/ai/route.ts` (SSE streaming)
- context: `src/features/ai/context/*`
- gateway orchestration: `src/features/ai/gateway.ts`
- tool contracts/registry: `src/features/ai/tools/*`
- audit/rate limits: `src/features/ai/audit.ts`, `rate-limit.ts`

Execution model implemented in code:

1. Client sends ask/act request.
2. Server builds validated AI context (user, org, scope, permissions).
3. Gateway can call registered tools (`resolve_entities`, `propose_changes`, `query_org_data`, `execute_changes`).
4. For `act`: proposal is generated first and audited.
5. Explicit confirm is required before execution (`phase="confirm"`).
6. Results/events stream via SSE.

This design separates planning from mutation and records auditable execution state.

## 9) Integration and Webhook Surfaces

Current API route handlers (`app/api`) include:

- account/session/preferences/notifications
- AI endpoint
- file upload + commit endpoints
- inbox inbound messages
- Facebook OAuth + Messenger webhook
- Google Sheets OAuth/webhook/reconcile
- Stripe webhook
- domain connect template
- slug availability checks

Billing integration uses Stripe with a service abstraction in:

- `src/features/billing/service.ts`

Webhook processing (`app/api/webhooks/stripe/route.ts`) handles idempotent event recording, account sync, payment method sync, and payment link checkout session syncing.

## 10) Background and Edge Processing

Supabase functions under `supabase/functions` provide asynchronous or pipeline-oriented workloads:

- `file-processing`: ingest CSV/XLSX, normalize rows, candidate matching
- `database-writer`: apply/cancel/undo import runs and staged writes
- `generate-embeddings`: embedding generation for vector workflows
- `ai-conflict-resolver`: conflict handling path in AI/import workflows

These functions complement app-server actions when long-running or staged data processing is needed.

## 11) UI System Architecture

UI layering:

- `@orgframe/theme`: design tokens + Tailwind preset
- `@orgframe/ui`: reusable primitives
- `orgframe-app` feature components compose primitives into product workflows

App-wide providers are mounted high in root layout:

- theme mode
- toast
- confirm dialog
- file manager/upload context
- order panel context

Org-specific branding variables are injected in org layout via `BrandingCssVarsBridge` and shared branding helpers.

## 12) Testing and Quality Structure

App test structure follows type-based folders:

- `tests/unit/*`
- `tests/integration/*`
- `tests/e2e/*`

Current test emphasis is on core utilities and critical integrations (domains, communications OAuth, billing connect state, AI context/tooling pieces).

## 13) Build, Dev, and Deployment Shape

- npm workspaces drive multi-app builds.
- Root scripts target app or web independently.
- `scripts/dev-launch.mjs` handles dual-app dev startup and deterministic port assignment.
- Branch/deploy guidance in `apps/orgframe-app/README.md` defines `main` (prod), `develop` (staging), with environment-separated Supabase projects.

## 14) Architecture Notes for Claude Code

If you are giving this repo to Claude Code, these constraints matter most:

1. Keep feature logic in `apps/orgframe-app/src/features/*`.
2. Keep `src/shared/*` infra-only (no feature sprawl).
3. Use `src/shared/data-api/*` entrypoints instead of reaching directly into lower-level Supabase modules when adding new code.
4. Keep route files thin and push logic into feature modules.
5. Respect org permission + tool-availability checks before data mutations.
6. For AI actions, preserve plan-then-confirm execution semantics; do not introduce implicit writes during planning.
7. For cross-app reuse, prefer workspace packages and avoid app-to-package reverse dependencies.

## 15) Known Drift / Watch Areas

Observed in current tree:

- A duplicate-looking file exists: `apps/orgframe-app/app/[orgSlug]/tools/billing/page 2.tsx`.
- There is mixed terminology (`manage` and `tools/manage`) with redirect compatibility in proxy logic.
- Data-api wrappers still expose backward-compatible aliases during migration.

These are not blockers, but they are useful context when refactoring.

---

Primary related references:

- `docs/architecture/folder-architecture.md`
- `apps/orgframe-app/README.md`
- `apps/orgframe-app/proxy.ts`
- `apps/orgframe-app/src/shared/org/getOrgAuthContext.ts`
- `apps/orgframe-app/src/shared/data-api/server.ts`
- `apps/orgframe-app/app/api/ai/route.ts`
