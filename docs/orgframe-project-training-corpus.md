# OrgFrame Project Training Corpus

Generated: 2026-03-22 (America/Detroit)

> Note: This is a historical training snapshot. It intentionally contains pre-refactor paths (for example `apps/orgframe-app/modules/*`) and should not be used as the current architecture source of truth. Use `docs/architecture/folder-architecture.md` for current structure rules.

## 1) Purpose
This document is a high-fidelity internal map of the OrgFrame/Sports SaaS codebase for training an assistant that can reason about architecture, product behavior, and implementation details without hallucinating. It is grounded in current repository code and migrations.

Primary outcomes:
- Understand what the platform does, for whom, and on which surfaces.
- Understand exact module boundaries, routing, APIs, data model, and permission model.
- Answer implementation and debugging questions with file-path-level precision.
- Make safe changes by preserving established patterns.

## 2) System Identity
- Product family: `Sports SaaS` / `OrgFrame`
- Core model: multi-tenant sports operations platform
- Tenancy model: org-centric (`orgs`), typically surfaced as `{orgSlug}.{baseHost}` or verified custom domain
- Main application: `apps/orgframe-app`
- Marketing/login bridge: `apps/orgframe-web`

## 3) Monorepo Layout
- Workspace root: npm workspaces (`apps/*`, `packages/*`)
- Apps:
  - `apps/orgframe-app`: authenticated product, org public + manage surfaces
  - `apps/orgframe-web`: landing/login bridge to app domain
- Packages:
  - `packages/ui`: shared UI primitives + domain workspaces
  - `packages/theme`: tokens + Tailwind preset
- Infra:
  - `supabase/migrations`: full DB evolution + RLS

## 4) Runtime and Toolchain
- Next.js 16 + React 19 across apps.
- TypeScript strict mode in both apps.
- App config (`apps/orgframe-app/next.config.mjs`):
  - `transpilePackages: ["@orgframe/ui"]`
  - server actions body size: `50mb`
  - staleTimes dynamic/static tuned
- Web config (`apps/orgframe-web/next.config.mjs`):
  - `transpilePackages: ["@orgframe/ui"]`
- Root dev launcher: `scripts/dev-launch.mjs`
  - Supports targets `app`, `web`, or both.
  - Uses ports `3000/3001` with collision checks.
  - On macOS shutdown, triggers localhost tab refresh via `osascript`.

## 5) Host, Tenant, and URL Topology

### 5.1 App Proxy (`apps/orgframe-app/proxy.ts`)
Responsibilities:
- Refresh Supabase session on all matched requests.
- Resolve org context from subdomain and custom domains.
- Rewrite tenant requests to `/{orgSlug}/...` internally.
- Redirect legacy path-style org URLs to subdomain-style.

Key behaviors:
- `resolveOrgSubdomain(host, tenantBaseHosts)` checks `{orgSlug}.{baseHost}`.
- Custom domain resolution uses RPC `resolve_org_slug_for_domain(target_domain)`.
- Legacy redirect helper `getLegacyOrgPathRedirect` moves `/{orgSlug}/...` to `{orgSlug}.{baseHost}/...`.
- Skip rewrite on infra/auth/system paths (`/api`, `/_next`, `/auth`, `/account`, `/forbidden`).

### 5.2 Web Proxy (`apps/orgframe-web/proxy.ts`)
- Only refreshes Supabase session.
- No tenant rewrite logic.

### 5.3 Root Entrypoint Behavior
- `apps/orgframe-app/app/page.tsx`:
  - If signed out: redirects to marketing origin for canonical hosts (`orgframe.app`, `staging.orgframe.app`) or `/auth`.
  - If signed in: shows dashboard and org cards.
  - Builds org links as subdomains when tenant base host is known.

## 6) Layout Stack and App Shell

### 6.1 Root Layout (`apps/orgframe-app/app/layout.tsx`)
Global providers and shell:
- `ThemeModeProvider`
- `ToastProvider`
- `ConfirmDialogProvider`
- `OrderPanelProvider`
- `FileManagerProvider`
- `UploadProvider`
- `SpeedInsights`

Header behavior:
- Branch visibility gate (`shouldShowBranchHeaders`) controls top headers.
- Header context is host/proto aware for tenant navigation.

### 6.2 Org Layout (`apps/orgframe-app/app/[orgSlug]/layout.tsx`)
- Loads org request context.
- Applies branding vars via `BrandingCssVarsBridge`.
- Renders `OrgHeader` with pages + site structure.
- Includes unpublished pages in nav when caller has edit capability.

### 6.3 Manage Layout (`apps/orgframe-app/app/[orgSlug]/manage/layout.tsx`)
- Resolves org auth context and capabilities.
- Enforces access; redirects forbidden users.
- Uses `UniversalAppShell` + `ManageSidebar`.

### 6.4 Tools Aliasing
- Many `tools/*` routes re-export corresponding `manage/*` routes.
- Outcome: one implementation path, two URL families.

## 7) Authentication, Session, and Cookies

### 7.1 Supabase Server Clients
- App server client: `apps/orgframe-app/lib/supabase/server.ts`
- Web server client: `apps/orgframe-web/lib/supabase/config.ts` + server helpers

### 7.2 Cookie Policy
- Shared domain optional via `AUTH_COOKIE_DOMAIN`.
- Cookie defaults normalized to:
  - `path=/`
  - `sameSite=lax`
  - `secure` based on request protocol

### 7.3 Auth Actions (`apps/orgframe-app/app/auth/actions.ts`)
- `lookupAuthAccountAction`
  - checks existing auth user and profile
  - detects SportsConnect imported accounts requiring activation
- `signInAction`, `signUpAction`, `signOutAction`
- Password reset:
  - `requestPasswordResetAction`
  - `updatePasswordFromResetAction`
- Reset callback path uses `/auth/callback` with `next` routing.

### 7.4 Web Login Bridge
- `apps/orgframe-web/app/login/route.ts`:
  - checks current session
  - redirects to app origin `/` if signed in, `/auth` otherwise

## 8) Authorization and Capabilities

### 8.1 Permission Source of Truth
- `apps/orgframe-app/modules/core/access.ts`
- Permission groups include:
  - Organization
  - Site Builder
  - Programs
  - Forms
  - Calendar
  - Events
  - Facilities
  - Communications

### 8.2 Roles
- Reserved default roles: `admin`, `member`
- Backward compatibility logic for `owner` and `manager`
- Custom roles loaded from `org_custom_roles`

### 8.3 Enforcement
- `lib/permissions/can.ts`
- `lib/auth/requirePermission.ts`
- `lib/permissions/requireOrgPermission.ts`
- `lib/permissions/orgCapabilities.ts` maps permissions into UI/domain capabilities.

## 9) Custom Domains and External Host Routing

Core files:
- `lib/domains/customDomains.ts`
- `lib/domains/verification.ts`
- `lib/domains/vercelProjectDomains.ts`
- `app/[orgSlug]/manage/domains/*`

Flow:
1. Org manager saves domain (`org_custom_domains`, verification token).
2. DNS verification expects TXT at `_sports-saas-verification.<domain>`.
3. Optional CNAME verification ensures target is platform host.
4. HTTP probe checks Vercel routing issues (`DEPLOYMENT_NOT_FOUND` path).
5. On success, status updates to `verified`, proxy can resolve domain -> org slug.

UX:
- Guided setup modal with registrar quick links + manual DNS fallback.
- Explicit support messaging for Vercel domain mapping errors.

## 10) AI Assistant Subsystem

### 10.1 Entry API
- `POST /api/ai` (`apps/orgframe-app/app/api/ai/route.ts`)
- SSE stream event protocol supports:
  - `assistant.delta`
  - `tool.call`
  - `tool.result`
  - `proposal.ready`
  - `execution.result`
  - `assistant.done`
  - `error`

### 10.2 Modes and Phases
- Modes: `ask`, `act`
- Phases: `plan`, `confirm`, `cancel`
- Proposal TTL: 30 minutes

### 10.3 Safety Model
- Request schema validation via zod (`modules/ai/schemas.ts`).
- Context resolution (`modules/ai/context.ts`) binds user/org permissions.
- Rate limiting via RPC `consume_ai_rate_limit` (default 20/300s).
- Audit log persistence in `audit_logs` for proposals/execution.

### 10.4 Tooling Architecture
- AI Gateway responses loop (`modules/ai/gateway.ts`).
- Tool registry (`modules/ai/tools/registry.ts`):
  - `resolve_entities`
  - `propose_changes`
  - `execute_changes`
- Execution path enforces org consistency and required permissions.

### 10.5 Implemented Intents
- `org.set_governing_body`
- `forms.create_form`
- `forms.update_form_builder`
- `forms.responses.update_status`
- Stubs exist for additional intent namespaces.

### 10.6 Config
- `AI_GATEWAY_API_KEY` required.
- `AI_MODEL` optional, defaults to `gpt-4.1-mini`.

## 11) Domain Module Deep Dive

### 11.1 Site Builder (`modules/site-builder`)
Responsibilities:
- Org pages, blocks, nav, and site structure canvas.
- Static + generated structure nodes with lifecycle and routing behavior.

Key artifacts:
- Block registry (`blocks/registry.ts`) and runtime registry.
- Supported block families include hero/subhero/cta/documents/contact/schedule/program/events/form/facility/teams.
- Page/structure queries in `db/queries.ts` integrate published catalogs from programs/forms/calendar/events/facilities.

### 11.2 Forms (`modules/forms`)
Responsibilities:
- Form authoring, publishing, submissions, admin workflows.
- Program registration and generic forms.
- Google Sheets sync + webhook/inbound edits.

Key flows:
- `createFormAction`, `saveFormDraftAction`, `publishFormVersionAction`.
- Submission via RPC `submit_form_response`.
- Guest generic fallback insert path (service-role) when sign-in not required.
- Submission admin tooling: statuses, notes, answer edits, delete.

Schema system:
- `modules/forms/schema.ts`
  - canonical v2 page-based schema
  - legacy section schema migration path
  - registration templates with fixed page keys

Google Sheets integration:
- OAuth (`integrations/google-sheets/oauth.ts`)
- Sync engine (`integrations/google-sheets/sync.ts`)
- Reconcile endpoint and signed webhook handling.

### 11.3 Calendar (`modules/calendar`)
Responsibilities:
- Unified event/practice/game scheduling model.
- Rule engine + generated occurrences.
- Recurrence exceptions and overrides.
- Lens model (mine/public/operations/custom).
- Team invites and facility allocations.

Key operations (see `modules/calendar/actions.ts`):
- workspace data/read models
- source and lens view CRUD
- entry/rule/occurrence lifecycle
- recurring series edits/deletes
- facility allocation assignments
- team invite send/respond/leave

### 11.4 Facilities (`modules/facilities`)
Responsibilities:
- Space hierarchy and reservation system.
- Booking, blackout, exception workflows.
- Public availability snapshots.

Actions include:
- create/update/move/archive/delete space
- structure save
- rule/reservation lifecycle
- blackout + exceptions

### 11.5 Communications Inbox (`modules/communications`)
Responsibilities:
- Inbound omnichannel identity resolution.
- Contact matching, suggestion ranking, auto-link.
- Contact merge/link/unlink resolution lifecycle.
- Channel integration management (including Facebook Messenger).

Scoring:
- Exact email/phone/auth match weighted heavily.
- Name similarity contributes lower confidence.
- Auto-link only when top score + gap thresholds are satisfied.

### 11.6 SportsConnect Import (`modules/sportsconnect`)
Pipeline stages:
1. `createDryRun`
2. `resolveMappings`
3. `commitRun`
4. `getRunProjection`
5. `listRunHistory`
6. activation lookup + activation email support

Import characteristics:
- Requires service-role client.
- Uses row-hash idempotency (`sportsconnect_import_applied_rows`).
- Persists run rows and mapping decisions.
- Commits program/division/team/player/guardian + registration/order entities.

### 11.7 File Manager (`modules/file-manager`)
Responsibilities:
- Personal + organization file systems.
- Folder system with system folders/access tags/entity contexts.
- Storage upload + metadata record insertion.

Server layer (`modules/file-manager/server.ts`):
- scope initialization (`ensure_org_file_system`, `ensure_personal_file_system`)
- folder/file CRUD operations
- upload path generation and storage writes
- signed URL/public URL resolution

Upload API:
- `POST /api/file-manager/upload`
- validates folder scope and write permissions via RPC `file_manager_write_allowed`

### 11.8 Programs, Players, Events, Orders, Access
- Programs and team hierarchy drive registration and calendar linkage.
- Players and guardians are central to registrations/team membership.
- Events domain remains available as dedicated module and public listing surface.
- Orders domain supports SportsConnect import mapping (`org_orders`, `org_order_items`, `org_order_payments`).

## 12) API Surface
Primary API routes in `apps/orgframe-app/app/api`:
- `/api/ai`
- `/api/account/session`
- `/api/file-manager/upload`
- `/api/uploads/commit`
- `/api/slugs/availability`
- `/api/inbox/inbound`
- `/api/webhooks/facebook/messenger`
- `/api/integrations/facebook/oauth/start`
- `/api/integrations/facebook/oauth/callback`
- `/api/integrations/google-sheets/oauth/start`
- `/api/integrations/google-sheets/oauth/callback`
- `/api/integrations/google-sheets/reconcile`
- `/api/integrations/google-sheets/webhook`

## 13) Database Model and Security
- Migration files: `supabase/migrations` (55 files at snapshot time)
- Architecture style: Postgres + Supabase auth/storage + extensive RLS policies
- Security model:
  - role/permission helper functions in SQL (`has_org_permission`, etc.)
  - per-table RLS policies for each domain
  - dedicated RPCs for high-trust workflows (submission, AI rate limit, domain resolve, file manager checks, contact merge)

High-signal families:
- Core tenancy: `orgs`, `org_memberships`, `org_tool_settings`
- Content: `site_pages`, `site_page_blocks`, `org_site_structure_nodes`
- Programs/players/forms
- Calendar/facilities (unified scheduling + allocations)
- Communications inbox entities
- AI audit/rate-limit tables
- SportsConnect import + order tables
- File manager (`app_file_folders`, `app_files`)

## 14) Environment Variables (Operational)
Most used variables by category:
- Supabase:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY`
  - `SUPABASE_SERVICE_ROLE_KEY`
- Host/origin:
  - `NEXT_PUBLIC_SITE_URL`, `SITE_URL`
  - `NEXT_PUBLIC_STAGING_SITE_URL`, `STAGING_SITE_URL`
  - `NEXT_PUBLIC_WEB_ORIGIN`, `ORGFRAME_WEB_ORIGIN`
  - `NEXT_PUBLIC_STAGING_WEB_ORIGIN`, `ORGFRAME_STAGING_WEB_ORIGIN`
  - `NEXT_PUBLIC_APP_ORIGIN`, `ORGFRAME_APP_ORIGIN`
- Auth/cookies:
  - `AUTH_COOKIE_DOMAIN`
- AI:
  - `AI_GATEWAY_API_KEY`, `AI_MODEL`
- Inbox/webhooks:
  - `INBOX_INGEST_BEARER_TOKEN`, `INBOX_INGEST_HMAC_SECRET`
  - `FACEBOOK_APP_ID`, `FACEBOOK_APP_SECRET`
  - `FACEBOOK_OAUTH_STATE_SECRET`, `FACEBOOK_OAUTH_REDIRECT_URI`
  - `FACEBOOK_MESSENGER_WEBHOOK_VERIFY_TOKEN` / `FACEBOOK_WEBHOOK_VERIFY_TOKEN`
- Google Sheets:
  - OAuth client/secret/state/redirect vars
  - webhook HMAC + cron bearer vars
  - service account email vars
- Vercel domain attach (optional automation):
  - `VERCEL_API_TOKEN`, `VERCEL_PROJECT_ID` / `VERCEL_PROJECT_NAME`, optional team id/slug
- UI maps:
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`

## 15) Tests and Current Coverage Signals
Current node tests in `apps/orgframe-app/tests` include:
- calendar lens behavior
- communications Facebook/oauth/service behavior
- custom domain and legacy redirect logic
- SportsConnect CSV parser

Coverage implication:
- Core business domains have targeted tests, but many server actions remain integration-heavy and best validated with end-to-end scenarios.

## 16) Assistant Training Guidance

### 16.1 Non-hallucination rules
- Never invent route names, table names, or env vars.
- Ground answers in module file paths and migration object names.
- If uncertain, ask for the exact file and inspect.

### 16.2 Safe change rules
- Respect role/permission checks before mutating server actions.
- Preserve tenant rewrite/domain routing invariants in proxy code.
- Preserve RLS assumptions when adding new SQL objects.
- Keep tools/alias route parity (`tools/*` vs `manage/*`) where expected.

### 16.3 High-value retrieval anchors
- Routing/host model: `apps/orgframe-app/proxy.ts`
- Capability model: `modules/core/access.ts`, `lib/permissions/*`
- Org/request context: `lib/org/getOrgAuthContext.ts`, `lib/org/getOrgRequestContext.ts`
- AI pipeline: `app/api/ai/route.ts`, `modules/ai/*`
- Forms lifecycle: `modules/forms/actions.ts`, `modules/forms/schema.ts`
- Calendar/facilities: `modules/calendar/actions.ts`, `modules/facilities/actions.ts`
- Communications ingest/resolution: `app/api/inbox/inbound/route.ts`, `modules/communications/service.ts`
- SportsConnect imports: `modules/sportsconnect/actions.ts`
- File manager: `modules/file-manager/server.ts`, `app/api/file-manager/upload/route.ts`
- DB policies/functions: `supabase/migrations/*.sql`

## 17) Known Architectural Patterns
- Most mutating workflows are implemented as server actions with zod validation.
- Critical external integrations use dedicated API routes + signed state/HMAC patterns.
- Data writes are usually followed by `revalidatePath` for UI consistency.
- Supabase service-role usage is isolated for privileged paths (imports, guest fallback insert, some integration jobs).
- Multi-tenant behavior is determined early at proxy/middleware layer.

## 18) Appendix Index
This section embeds generated inventories captured from the codebase to support training retrieval.


## Appendix A: Route Inventory
```text
=== ROUTES ===
apps/orgframe-app/app/OrganizationsRepeater.tsx
apps/orgframe-app/app/[orgSlug]/[pageSlug]/page.tsx
apps/orgframe-app/app/[orgSlug]/calendar/[occurrenceId]/page.tsx
apps/orgframe-app/app/[orgSlug]/calendar/page.tsx
apps/orgframe-app/app/[orgSlug]/events/[eventId]/page.tsx
apps/orgframe-app/app/[orgSlug]/events/page.tsx
apps/orgframe-app/app/[orgSlug]/icon/route.ts
apps/orgframe-app/app/[orgSlug]/layout.tsx
apps/orgframe-app/app/[orgSlug]/loading.tsx
apps/orgframe-app/app/[orgSlug]/logo/route.ts
apps/orgframe-app/app/[orgSlug]/manage/ManageCardsRepeater.tsx
apps/orgframe-app/app/[orgSlug]/manage/access/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/billing/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/branding/BrandingForm.tsx
apps/orgframe-app/app/[orgSlug]/manage/branding/actions.ts
apps/orgframe-app/app/[orgSlug]/manage/branding/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/calendar/ManageCalendarSection.tsx
apps/orgframe-app/app/[orgSlug]/manage/calendar/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/domains/DomainSetupModal.tsx
apps/orgframe-app/app/[orgSlug]/manage/domains/actions.ts
apps/orgframe-app/app/[orgSlug]/manage/domains/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/events/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/events/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/[spaceId]/exceptions/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/[spaceId]/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/[spaceId]/overview/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/[spaceId]/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/[spaceId]/schedule/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/[spaceId]/settings/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/[spaceId]/structure/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/facilities/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/forms/[formId]/editor/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/forms/[formId]/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/forms/[formId]/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/forms/[formId]/settings/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/forms/[formId]/submissions/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/forms/[formId]/submissions/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/forms/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/forms/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/inbox/connections/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/inbox/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/info/OrgInfoPageToasts.tsx
apps/orgframe-app/app/[orgSlug]/manage/info/actions.ts
apps/orgframe-app/app/[orgSlug]/manage/info/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/layout.tsx
apps/orgframe-app/app/[orgSlug]/manage/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/[programId]/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/[programId]/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/[programId]/registration/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/[programId]/schedule/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/[programId]/settings/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/[programId]/structure/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/[programId]/teams/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/loading.tsx
apps/orgframe-app/app/[orgSlug]/manage/programs/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/site/page.tsx
apps/orgframe-app/app/[orgSlug]/manage/sportsconnect/page.tsx
apps/orgframe-app/app/[orgSlug]/page.tsx
apps/orgframe-app/app/[orgSlug]/program/[...segments]/page.tsx
apps/orgframe-app/app/[orgSlug]/programs/ProgramsCatalogRepeater.tsx
apps/orgframe-app/app/[orgSlug]/programs/[programSlug]/[divisionSlug]/[teamSlug]/calendar/page.tsx
apps/orgframe-app/app/[orgSlug]/programs/[programSlug]/[divisionSlug]/[teamSlug]/page.tsx
apps/orgframe-app/app/[orgSlug]/programs/[programSlug]/[divisionSlug]/page.tsx
apps/orgframe-app/app/[orgSlug]/programs/[programSlug]/page.tsx
apps/orgframe-app/app/[orgSlug]/programs/page.tsx
apps/orgframe-app/app/[orgSlug]/register/[formSlug]/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/calendar/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/events/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/facilities/[spaceId]/exceptions/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/facilities/[spaceId]/loading.tsx
apps/orgframe-app/app/[orgSlug]/tools/facilities/[spaceId]/overview/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/facilities/[spaceId]/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/facilities/[spaceId]/schedule/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/facilities/[spaceId]/settings/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/facilities/[spaceId]/structure/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/facilities/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/forms/[formId]/editor/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/forms/[formId]/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/forms/[formId]/settings/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/forms/[formId]/submissions/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/forms/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/inbox/connections/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/inbox/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/layout.tsx
apps/orgframe-app/app/[orgSlug]/tools/loading.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage-org/access/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage-org/billing/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage-org/branding/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage-org/info/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage-org/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage/access/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage/billing/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage/branding/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage/domains/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage/info/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/manage/sportsconnect/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/programs/[programId]/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/programs/[programId]/registration/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/programs/[programId]/schedule/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/programs/[programId]/settings/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/programs/[programId]/structure/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/programs/[programId]/teams/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/programs/page.tsx
apps/orgframe-app/app/[orgSlug]/tools/site/page.tsx
apps/orgframe-app/app/account/layout.tsx
apps/orgframe-app/app/account/loading.tsx
apps/orgframe-app/app/account/organizations/actions.ts
apps/orgframe-app/app/account/page.tsx
apps/orgframe-app/app/account/password/route.ts
apps/orgframe-app/app/account/players/loading.tsx
apps/orgframe-app/app/account/players/page.tsx
apps/orgframe-app/app/account/profile/route.ts
apps/orgframe-app/app/api/account/session/route.ts
apps/orgframe-app/app/api/ai/route.ts
apps/orgframe-app/app/api/file-manager/upload/route.ts
apps/orgframe-app/app/api/inbox/inbound/route.ts
apps/orgframe-app/app/api/integrations/facebook/oauth/callback/route.ts
apps/orgframe-app/app/api/integrations/facebook/oauth/start/route.ts
apps/orgframe-app/app/api/integrations/google-sheets/oauth/callback/route.ts
apps/orgframe-app/app/api/integrations/google-sheets/oauth/start/route.ts
apps/orgframe-app/app/api/integrations/google-sheets/reconcile/route.ts
apps/orgframe-app/app/api/integrations/google-sheets/webhook/route.ts
apps/orgframe-app/app/api/slugs/availability/route.ts
apps/orgframe-app/app/api/uploads/commit/route.ts
apps/orgframe-app/app/api/webhooks/facebook/messenger/route.ts
apps/orgframe-app/app/auth/actions.ts
apps/orgframe-app/app/auth/callback/route.ts
apps/orgframe-app/app/auth/layout.tsx
apps/orgframe-app/app/auth/login/page.tsx
apps/orgframe-app/app/auth/page.tsx
apps/orgframe-app/app/auth/reset/page.tsx
apps/orgframe-app/app/favicon.ico/route.ts
apps/orgframe-app/app/forbidden/page.tsx
apps/orgframe-app/app/globals.css
apps/orgframe-app/app/layout.tsx
apps/orgframe-app/app/not-found.tsx
apps/orgframe-app/app/page.tsx

=== WEB APP ROUTES ===
apps/orgframe-web/app/favicon.ico/route.ts
apps/orgframe-web/app/globals.css
apps/orgframe-web/app/icon.svg
apps/orgframe-web/app/layout.tsx
apps/orgframe-web/app/login/route.ts
apps/orgframe-web/app/page.tsx
```

## Appendix B: Tests + Env Usage Inventory
```text
=== TESTS ===
apps/orgframe-app/tests/calendar/lens.test.ts
apps/orgframe-app/tests/communications/facebook-oauth.test.ts
apps/orgframe-app/tests/communications/facebook.test.ts
apps/orgframe-app/tests/communications/service.test.ts
apps/orgframe-app/tests/domains/customDomains.test.ts
apps/orgframe-app/tests/domains/legacyRedirect.test.ts
apps/orgframe-app/tests/sportsconnect/parser.test.ts

=== ENV USAGE ===
apps/orgframe-app/app/api/inbox/inbound/route.ts:73:  const bearerToken = (process.env.INBOX_INGEST_BEARER_TOKEN ?? "").trim();
apps/orgframe-app/app/api/inbox/inbound/route.ts:74:  const hmacSecret = (process.env.INBOX_INGEST_HMAC_SECRET ?? "").trim();
apps/orgframe-app/app/api/integrations/google-sheets/reconcile/route.ts:7:  const token = (process.env.GOOGLE_SHEETS_CRON_BEARER_TOKEN ?? "").trim();
apps/orgframe-app/app/api/webhooks/facebook/messenger/route.ts:10:  return (process.env.FACEBOOK_MESSENGER_WEBHOOK_VERIFY_TOKEN ?? process.env.FACEBOOK_WEBHOOK_VERIFY_TOKEN ?? "").trim();
apps/orgframe-app/app/api/webhooks/facebook/messenger/route.ts:14:  return (process.env.FACEBOOK_APP_SECRET ?? "").trim();
apps/orgframe-app/app/auth/actions.ts:196:    const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
apps/orgframe-app/app/auth/actions.ts:200:  const fallbackOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";
apps/orgframe-app/app/forbidden/page.tsx:21:    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
apps/orgframe-app/app/layout.tsx:33:    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
apps/orgframe-app/app/page.tsx:22:    return (process.env.NEXT_PUBLIC_STAGING_WEB_ORIGIN ?? process.env.ORGFRAME_STAGING_WEB_ORIGIN ?? "https://staging.orgframeapp.com").replace(/\/+$/, "");
apps/orgframe-app/app/page.tsx:26:    return (process.env.NEXT_PUBLIC_WEB_ORIGIN ?? process.env.ORGFRAME_WEB_ORIGIN ?? "https://orgframeapp.com").replace(/\/+$/, "");
apps/orgframe-app/app/page.tsx:56:    forwardedProto === "http" || forwardedProto === "https" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
apps/orgframe-app/lib/branding/getOrgAssetPublicUrl.ts:13:  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
apps/orgframe-app/lib/domains/customDomains.ts:20:  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL;
apps/orgframe-app/lib/domains/customDomains.ts:51:  const explicitStagingHost = readOptionalHost(process.env.NEXT_PUBLIC_STAGING_SITE_URL || process.env.STAGING_SITE_URL);
apps/orgframe-app/lib/env/branchVisibility.ts:2:  return (process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? "").trim().toLowerCase();
apps/orgframe-app/lib/env/branchVisibility.ts:6:  return (process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "").trim().toLowerCase();
apps/orgframe-app/lib/supabase/cookies.ts:20:  const raw = process.env.AUTH_COOKIE_DOMAIN;
apps/orgframe-app/lib/supabase/proxy.ts:39:    if (process.env.NODE_ENV !== "production") {
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:42:  const appId = (process.env.FACEBOOK_APP_ID ?? "").trim();
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:43:  const appSecret = (process.env.FACEBOOK_APP_SECRET ?? "").trim();
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:44:  const stateSecret = (process.env.FACEBOOK_OAUTH_STATE_SECRET ?? process.env.COMM_CHANNEL_CREDENTIALS_SECRET ?? appSecret).trim();
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:45:  const redirectUri = (process.env.FACEBOOK_OAUTH_REDIRECT_URI ?? `${origin}/api/integrations/facebook/oauth/callback`).trim();
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:39:  const clientId = (process.env.GOOGLE_SHEETS_OAUTH_CLIENT_ID ?? "").trim();
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:40:  const clientSecret = (process.env.GOOGLE_SHEETS_OAUTH_CLIENT_SECRET ?? "").trim();
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:41:  const stateSecret = (process.env.GOOGLE_SHEETS_OAUTH_STATE_SECRET ?? clientSecret).trim();
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:42:  const redirectUri = (process.env.GOOGLE_SHEETS_OAUTH_REDIRECT_URI ?? `${origin}/api/integrations/google-sheets/oauth/callback`).trim();
apps/orgframe-app/modules/forms/integrations/google-sheets/sync.ts:2114:  const secret = (process.env.GOOGLE_SHEETS_WEBHOOK_HMAC_SECRET ?? "").trim();
apps/orgframe-app/modules/forms/integrations/google-sheets/sync.ts:218:  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL);
apps/orgframe-app/modules/forms/integrations/google-sheets/sync.ts:228:    process.env.GCP_SERVICE_ACCOUNT_EMAIL,
apps/orgframe-app/modules/forms/integrations/google-sheets/sync.ts:229:    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
apps/orgframe-app/modules/forms/integrations/google-sheets/sync.ts:230:    process.env.GOOGLE_SHEETS_RUNTIME_SERVICE_ACCOUNT_EMAIL
apps/orgframe-app/modules/site-builder/storage.ts:13:  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
apps/orgframe-app/modules/sportsconnect/actions.ts:262:    const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : process.env.NODE_ENV === "production" ? "https" : "http";
apps/orgframe-app/modules/sportsconnect/actions.ts:266:  const fallbackOrigin = process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL || "http://localhost:3000";
apps/orgframe-app/proxy.ts:41:    if (process.env.NODE_ENV !== "production") {
apps/orgframe-app/tests/domains/customDomains.test.ts:10:    STAGING_SITE_URL: process.env.STAGING_SITE_URL
apps/orgframe-app/tests/domains/customDomains.test.ts:14:    process.env.NEXT_PUBLIC_SITE_URL = "https://orgframe.app";
apps/orgframe-app/tests/domains/customDomains.test.ts:15:    delete process.env.SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:16:    delete process.env.NEXT_PUBLIC_STAGING_SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:17:    delete process.env.STAGING_SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:21:    if (previousEnv.NEXT_PUBLIC_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:22:    else process.env.NEXT_PUBLIC_SITE_URL = previousEnv.NEXT_PUBLIC_SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:23:    if (previousEnv.SITE_URL === undefined) delete process.env.SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:24:    else process.env.SITE_URL = previousEnv.SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:25:    if (previousEnv.NEXT_PUBLIC_STAGING_SITE_URL === undefined) delete process.env.NEXT_PUBLIC_STAGING_SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:26:    else process.env.NEXT_PUBLIC_STAGING_SITE_URL = previousEnv.NEXT_PUBLIC_STAGING_SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:27:    if (previousEnv.STAGING_SITE_URL === undefined) delete process.env.STAGING_SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:28:    else process.env.STAGING_SITE_URL = previousEnv.STAGING_SITE_URL;
apps/orgframe-app/tests/domains/customDomains.test.ts:7:    NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
apps/orgframe-app/tests/domains/customDomains.test.ts:8:    SITE_URL: process.env.SITE_URL,
apps/orgframe-app/tests/domains/customDomains.test.ts:9:    NEXT_PUBLIC_STAGING_SITE_URL: process.env.NEXT_PUBLIC_STAGING_SITE_URL,
apps/orgframe-app/tests/domains/legacyRedirect.test.ts:11:    process.env.NEXT_PUBLIC_SITE_URL = "https://orgframe.app";
apps/orgframe-app/tests/domains/legacyRedirect.test.ts:16:      delete process.env.NEXT_PUBLIC_SITE_URL;
apps/orgframe-app/tests/domains/legacyRedirect.test.ts:18:      process.env.NEXT_PUBLIC_SITE_URL = previousSiteUrl;
apps/orgframe-app/tests/domains/legacyRedirect.test.ts:8:  const previousSiteUrl = process.env.NEXT_PUBLIC_SITE_URL;
apps/orgframe-web/app/login/route.ts:7:  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.ORGFRAME_APP_ORIGIN ?? "https://orgframe.app";
apps/orgframe-web/app/page.tsx:6:  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.ORGFRAME_APP_ORIGIN ?? "https://orgframe.app";
apps/orgframe-web/lib/supabase/cookies.ts:20:  const raw = process.env.AUTH_COOKIE_DOMAIN;
apps/orgframe-web/lib/supabase/proxy.ts:33:    if (process.env.NODE_ENV !== "production") {
packages/ui/src/ui/address-autocomplete-input.tsx:52:  apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
```

## Appendix C: DB Tables (By Migration)
```text
202602110001_platform_foundation.sql:public.calendar_items
202602110001_platform_foundation.sql:public.org_memberships
202602110001_platform_foundation.sql:public.org_tool_settings
202602110001_platform_foundation.sql:public.orgs
202602110001_platform_foundation.sql:public.sponsor_submissions
202602150001_org_pages_builder.sql:public.site_page_blocks
202602150001_org_pages_builder.sql:public.site_pages
202602160001_custom_roles_permissions.sql:public.org_custom_roles
202602170003_org_nav_items.sql:public.site_structure_nodes
202602170005_governing_bodies.sql:public.governing_bodies
202602220002_players_v1.sql:public.player_guardians
202602220002_players_v1.sql:public.players
202602220003_programs_v1.sql:public.program_structure_nodes
202602220003_programs_v1.sql:public.program_schedule_blocks
202602220003_programs_v1.sql:public.programs
202602220004_forms_v1.sql:public.org_form_submission_entries
202602220004_forms_v1.sql:public.org_form_submissions
202602220004_forms_v1.sql:public.org_form_versions
202602220004_forms_v1.sql:public.org_forms
202602220004_forms_v1.sql:public.program_registrations
202602260001_program_schedule_v2.sql:public.program_occurrences
202602260001_program_schedule_v2.sql:public.program_schedule_exceptions
202602260001_program_schedule_v2.sql:public.program_schedule_rules
202602280001_events_tool.sql:public.calendar_items
202602280003_form_submission_views.sql:public.org_form_submission_views
202603010001_ai_admin_actions.sql:public.ai_rate_limit_windows
202603010001_ai_admin_actions.sql:public.audit_logs
202603010002_facilities_tool.sql:public.facility_reservation_exceptions
202603010002_facilities_tool.sql:public.facility_reservation_rules
202603010002_facilities_tool.sql:public.facility_reservations
202603010002_facilities_tool.sql:public.facility_spaces
202603010003_form_submissions_google_sheets.sql:public.org_form_google_sheet_integrations
202603010003_form_submissions_google_sheets.sql:public.org_form_google_sheet_outbox
202603010003_form_submissions_google_sheets.sql:public.org_form_google_sheet_sync_runs
202603010004_org_custom_domains.sql:public.org_custom_domains
202603030001_program_teams.sql:public.program_team_members
202603030001_program_teams.sql:public.program_team_staff
202603030001_program_teams.sql:public.program_teams
202603030004_unified_calendar_system.sql:public.calendar_items
202603030004_unified_calendar_system.sql:public.calendar_item_space_allocations
202603030004_unified_calendar_system.sql:public.calendar_item_participants
202603030004_unified_calendar_system.sql:public.calendar_item_occurrences
202603030004_unified_calendar_system.sql:public.calendar_item_rule_exceptions
202603030004_unified_calendar_system.sql:public.calendar_item_rules
202603030004_unified_calendar_system.sql:public.facility_space_configurations
202603030004_unified_calendar_system.sql:public.user_notifications
202603070001_spaces_platform.sql:public.calendar_item_space_allocations
202603070001_spaces_platform.sql:public.facility_reservation_exceptions
202603070001_spaces_platform.sql:public.facility_reservation_rules
202603070001_spaces_platform.sql:public.facility_reservations
202603070001_spaces_platform.sql:public.facility_space_configurations
202603070001_spaces_platform.sql:public.facility_spaces
202603070001_spaces_platform.sql:public.org_space_types
202603080001_facilities_visual_reset.sql:public.calendar_item_space_allocations
202603080001_facilities_visual_reset.sql:public.facilities
202603080001_facilities_visual_reset.sql:public.facility_layout_nodes
202603100001_communications_inbox.sql:public.org_comm_channel_identities
202603100001_communications_inbox.sql:public.org_comm_contact_merge_audit
202603100001_communications_inbox.sql:public.org_comm_contacts
202603100001_communications_inbox.sql:public.org_comm_conversations
202603100001_communications_inbox.sql:public.org_comm_match_suggestions
202603100001_communications_inbox.sql:public.org_comm_messages
202603100001_communications_inbox.sql:public.org_comm_resolution_events
202603100003_communications_inbox_repair.sql:public.org_comm_channel_identities
202603100003_communications_inbox_repair.sql:public.org_comm_contact_merge_audit
202603100003_communications_inbox_repair.sql:public.org_comm_contacts
202603100003_communications_inbox_repair.sql:public.org_comm_conversations
202603100003_communications_inbox_repair.sql:public.org_comm_match_suggestions
202603100003_communications_inbox_repair.sql:public.org_comm_messages
202603100003_communications_inbox_repair.sql:public.org_comm_resolution_events
202603110001_inbox_channel_integrations.sql:public.org_comm_channel_integration_secrets
202603110001_inbox_channel_integrations.sql:public.org_comm_channel_integrations
202603120001_facilities_calendar_schema_repair.sql:public.calendar_items
202603120001_facilities_calendar_schema_repair.sql:public.calendar_item_space_allocations
202603120001_facilities_calendar_schema_repair.sql:public.calendar_item_participants
202603120001_facilities_calendar_schema_repair.sql:public.calendar_item_occurrences
202603120001_facilities_calendar_schema_repair.sql:public.calendar_item_rule_exceptions
202603120001_facilities_calendar_schema_repair.sql:public.calendar_item_rules
202603120001_facilities_calendar_schema_repair.sql:public.facility_reservation_exceptions
202603120001_facilities_calendar_schema_repair.sql:public.facility_reservation_rules
202603120001_facilities_calendar_schema_repair.sql:public.facility_reservations
202603120001_facilities_calendar_schema_repair.sql:public.facility_space_configurations
202603120001_facilities_calendar_schema_repair.sql:public.facility_spaces
202603120001_facilities_calendar_schema_repair.sql:public.user_notifications
202603140001_sportsconnect_import.sql:public.org_order_items
202603140001_sportsconnect_import.sql:public.org_order_payments
202603140001_sportsconnect_import.sql:public.org_orders
202603140001_sportsconnect_import.sql:public.sportsconnect_import_applied_rows
202603140001_sportsconnect_import.sql:public.sportsconnect_import_rows
202603140001_sportsconnect_import.sql:public.sportsconnect_import_runs
202603150001_calendar_facility_allocations_multi.sql:public.calendar_item_space_allocations
202603160001_calendar_lens_sources_and_saved_views.sql:public.calendar_saved_views
202603160001_calendar_lens_sources_and_saved_views.sql:public.calendar_item_sources
202603170001_site_structure_canvas.sql:public.org_site_structure_nodes
202603220001_file_manager.sql:public.app_file_folders
202603220001_file_manager.sql:public.app_files
```

## Appendix D: DB Functions (By Migration)
```text
202602110001_platform_foundation.sql:public.has_org_role
202602110001_platform_foundation.sql:public.is_org_member
202602110001_platform_foundation.sql:public.set_updated_at
202602160001_custom_roles_permissions.sql:public.has_org_permission
202602160001_custom_roles_permissions.sql:public.has_org_role
202602200001_org_creation_flow.sql:public.create_org_for_current_user
202602210002_fix_create_org_rpc_ambiguity.sql:public.create_org_for_current_user
202602220001_permissions_rebaseline.sql:public.has_org_permission
202602220001_permissions_rebaseline.sql:public.has_org_role
202602220002_players_v1.sql:public.is_player_guardian
202602220005_registration_rpc.sql:public.submit_form_response
202602280001_events_tool.sql:public.has_org_permission
202602280001_events_tool.sql:public.has_org_role
202602280002_form_guest_submissions.sql:public.submit_form_response
202603010001_ai_admin_actions.sql:public.ai_apply_org_governing_body_change
202603010001_ai_admin_actions.sql:public.consume_ai_rate_limit
202603010002_facilities_tool.sql:public.has_org_permission
202603010002_facilities_tool.sql:public.has_org_role
202603010003_form_submissions_google_sheets.sql:public.bump_form_submission_sync_rev
202603010003_form_submissions_google_sheets.sql:public.enqueue_form_submission_entry_sheet_event
202603010003_form_submissions_google_sheets.sql:public.enqueue_form_submission_sheet_event
202603010003_form_submissions_google_sheets.sql:public.lock_org_form_google_sheet_outbox
202603010004_org_custom_domains.sql:public.resolve_org_slug_for_domain
202603030001_program_teams.sql:public.prevent_team_node_demotion
202603030001_program_teams.sql:public.sync_program_team_for_node
202603030002_registration_team_sync.sql:public.submit_form_response
202603030004_unified_calendar_system.sql:public.has_calendar_entry_write
202603030004_unified_calendar_system.sql:public.has_org_permission
202603030004_unified_calendar_system.sql:public.has_org_role
202603030004_unified_calendar_system.sql:public.has_team_calendar_write
202603030004_unified_calendar_system.sql:public.hydrate_calendar_allocation_window
202603030004_unified_calendar_system.sql:public.sync_calendar_allocation_window_from_occurrence
202603070001_spaces_platform.sql:public.ensure_calendar_allocation_hierarchy_conflicts
202603070001_spaces_platform.sql:public.has_org_permission
202603070001_spaces_platform.sql:public.has_org_role
202603070001_spaces_platform.sql:public.on_org_created_seed_space_types
202603070001_spaces_platform.sql:public.seed_org_space_types
202603070001_spaces_platform.sql:public.space_is_ancestor
202603080001_facilities_visual_reset.sql:public.ensure_calendar_node_allocation_hierarchy_conflicts
202603080001_facilities_visual_reset.sql:public.facility_node_is_ancestor
202603080001_facilities_visual_reset.sql:public.hydrate_calendar_node_allocation_window
202603080001_facilities_visual_reset.sql:public.sync_calendar_node_allocation_window_from_occurrence
202603090001_org_onboarding_fields.sql:public.create_org_for_current_user
202603100001_communications_inbox.sql:public.has_org_permission
202603100001_communications_inbox.sql:public.has_org_role
202603100001_communications_inbox.sql:public.org_comm_merge_contacts
202603100002_form_submission_cap.sql:public.enforce_form_submission_cap
202603100002_form_submission_cap.sql:public.get_form_submission_gate
202603100003_communications_inbox_repair.sql:public.has_org_permission
202603100003_communications_inbox_repair.sql:public.has_org_role
202603100003_communications_inbox_repair.sql:public.org_comm_merge_contacts
202603120001_facilities_calendar_schema_repair.sql:public.has_calendar_entry_write
202603120001_facilities_calendar_schema_repair.sql:public.has_team_calendar_write
202603120001_facilities_calendar_schema_repair.sql:public.hydrate_calendar_allocation_window
202603120001_facilities_calendar_schema_repair.sql:public.sync_calendar_allocation_window_from_occurrence
202603150001_calendar_facility_allocations_multi.sql:public.hydrate_calendar_rule_allocation
202603220001_file_manager.sql:public.backfill_legacy_file_records
202603220001_file_manager.sql:public.ensure_org_file_system
202603220001_file_manager.sql:public.ensure_personal_file_system
202603220001_file_manager.sql:public.file_manager_legacy_mime
202603220001_file_manager.sql:public.file_manager_legacy_name
202603220001_file_manager.sql:public.file_manager_read_allowed
202603220001_file_manager.sql:public.file_manager_slugify
202603220001_file_manager.sql:public.file_manager_write_allowed
202603220001_file_manager.sql:public.resolve_system_folder_id
202603220001_file_manager.sql:public.sync_org_entity_file_folders
202603220002_file_manager_backfill_fixes.sql:public.backfill_storage_file_records
202603220002_file_manager_backfill_fixes.sql:public.ensure_personal_file_system
```

## Appendix E: RLS Policy Creation Lines
```text
supabase/migrations/202602110001_platform_foundation.sql:152:create policy orgs_public_read on public.orgs
supabase/migrations/202602110001_platform_foundation.sql:157:create policy org_memberships_read_self_or_admin on public.org_memberships
supabase/migrations/202602110001_platform_foundation.sql:162:create policy org_tool_settings_member_read on public.org_tool_settings
supabase/migrations/202602110001_platform_foundation.sql:167:create policy org_tool_settings_admin_write on public.org_tool_settings
supabase/migrations/202602110001_platform_foundation.sql:173:create policy org_events_member_read on public.calendar_items
supabase/migrations/202602110001_platform_foundation.sql:178:create policy org_events_member_insert on public.calendar_items
supabase/migrations/202602110001_platform_foundation.sql:183:create policy sponsor_submissions_member_read on public.sponsor_submissions
supabase/migrations/202602110001_platform_foundation.sql:188:create policy sponsor_submissions_member_insert on public.sponsor_submissions
supabase/migrations/202602110001_platform_foundation.sql:193:create policy sponsor_submissions_manager_update on public.sponsor_submissions
supabase/migrations/202602110001_platform_foundation.sql:203:create policy sponsor_assets_read_member on storage.objects
supabase/migrations/202602110001_platform_foundation.sql:212:create policy sponsor_assets_manage_manager on storage.objects
supabase/migrations/202602110010_org_branding.sql:13:create policy orgs_public_read on public.orgs
supabase/migrations/202602110010_org_branding.sql:19:create policy orgs_member_read on public.orgs
supabase/migrations/202602110010_org_branding.sql:25:create policy orgs_admin_update_branding on public.orgs
supabase/migrations/202602110010_org_branding.sql:41:create policy org_assets_member_read on storage.objects
supabase/migrations/202602110010_org_branding.sql:52:create policy org_assets_admin_insert on storage.objects
supabase/migrations/202602110010_org_branding.sql:63:create policy org_assets_admin_update on storage.objects
supabase/migrations/202602110010_org_branding.sql:81:create policy org_assets_admin_delete on storage.objects
supabase/migrations/202602150001_org_pages_builder.sql:105:create policy org_page_blocks_manager_delete on public.site_page_blocks
supabase/migrations/202602150001_org_pages_builder.sql:127:create policy org_site_assets_manager_insert on storage.objects
supabase/migrations/202602150001_org_pages_builder.sql:136:create policy org_site_assets_manager_update on storage.objects
supabase/migrations/202602150001_org_pages_builder.sql:150:create policy org_site_assets_manager_delete on storage.objects
supabase/migrations/202602150001_org_pages_builder.sql:37:create policy org_pages_public_or_manager_read on public.site_pages
supabase/migrations/202602150001_org_pages_builder.sql:42:create policy org_pages_manager_insert on public.site_pages
supabase/migrations/202602150001_org_pages_builder.sql:47:create policy org_pages_manager_update on public.site_pages
supabase/migrations/202602150001_org_pages_builder.sql:53:create policy org_pages_manager_delete on public.site_pages
supabase/migrations/202602150001_org_pages_builder.sql:58:create policy org_page_blocks_public_or_manager_read on public.site_page_blocks
supabase/migrations/202602150001_org_pages_builder.sql:73:create policy org_page_blocks_manager_insert on public.site_page_blocks
supabase/migrations/202602150001_org_pages_builder.sql:85:create policy org_page_blocks_manager_update on public.site_page_blocks
supabase/migrations/202602160001_custom_roles_permissions.sql:136:create policy org_custom_roles_member_read on public.org_custom_roles
supabase/migrations/202602160001_custom_roles_permissions.sql:141:create policy org_custom_roles_manage_write on public.org_custom_roles
supabase/migrations/202602160001_custom_roles_permissions.sql:147:create policy org_memberships_read_self_or_admin on public.org_memberships
supabase/migrations/202602160001_custom_roles_permissions.sql:152:create policy org_tool_settings_admin_write on public.org_tool_settings
supabase/migrations/202602160001_custom_roles_permissions.sql:158:create policy sponsor_submissions_manager_update on public.sponsor_submissions
supabase/migrations/202602160001_custom_roles_permissions.sql:164:create policy sponsor_assets_manage_manager on storage.objects
supabase/migrations/202602160001_custom_roles_permissions.sql:178:create policy orgs_admin_update_branding on public.orgs
supabase/migrations/202602160001_custom_roles_permissions.sql:184:create policy org_assets_admin_insert on storage.objects
supabase/migrations/202602160001_custom_roles_permissions.sql:195:create policy org_assets_admin_update on storage.objects
supabase/migrations/202602160001_custom_roles_permissions.sql:213:create policy org_assets_admin_delete on storage.objects
supabase/migrations/202602160001_custom_roles_permissions.sql:224:create policy org_pages_public_or_manager_read on public.site_pages
supabase/migrations/202602160001_custom_roles_permissions.sql:229:create policy org_pages_manager_insert on public.site_pages
supabase/migrations/202602160001_custom_roles_permissions.sql:234:create policy org_pages_manager_update on public.site_pages
supabase/migrations/202602160001_custom_roles_permissions.sql:240:create policy org_pages_manager_delete on public.site_pages
supabase/migrations/202602160001_custom_roles_permissions.sql:245:create policy org_page_blocks_public_or_manager_read on public.site_page_blocks
supabase/migrations/202602160001_custom_roles_permissions.sql:260:create policy org_page_blocks_manager_insert on public.site_page_blocks
supabase/migrations/202602160001_custom_roles_permissions.sql:272:create policy org_page_blocks_manager_update on public.site_page_blocks
supabase/migrations/202602160001_custom_roles_permissions.sql:292:create policy org_page_blocks_manager_delete on public.site_page_blocks
supabase/migrations/202602160001_custom_roles_permissions.sql:304:create policy org_site_assets_manager_insert on storage.objects
supabase/migrations/202602160001_custom_roles_permissions.sql:313:create policy org_site_assets_manager_update on storage.objects
supabase/migrations/202602160001_custom_roles_permissions.sql:327:create policy org_site_assets_manager_delete on storage.objects
supabase/migrations/202602160001_custom_roles_permissions.sql:336:create policy org_announcements_public_or_manager_read on public.org_announcements
supabase/migrations/202602160001_custom_roles_permissions.sql:344:create policy org_announcements_manager_insert on public.org_announcements
supabase/migrations/202602160001_custom_roles_permissions.sql:349:create policy org_announcements_manager_update on public.org_announcements
supabase/migrations/202602160001_custom_roles_permissions.sql:355:create policy org_announcements_manager_delete on public.org_announcements
supabase/migrations/202602170003_org_nav_items.sql:33:create policy org_nav_items_public_read on public.site_structure_nodes
supabase/migrations/202602170003_org_nav_items.sql:38:create policy org_nav_items_pages_write_insert on public.site_structure_nodes
supabase/migrations/202602170003_org_nav_items.sql:43:create policy org_nav_items_pages_write_update on public.site_structure_nodes
supabase/migrations/202602170003_org_nav_items.sql:49:create policy org_nav_items_pages_write_delete on public.site_structure_nodes
supabase/migrations/202602170005_governing_bodies.sql:16:create policy governing_bodies_public_read on public.governing_bodies
supabase/migrations/202602170006_governing_body_assets_bucket.sql:16:create policy governing_body_assets_public_read on storage.objects
supabase/migrations/202602170008_org_assets_public_read.sql:6:create policy org_assets_public_read on storage.objects
supabase/migrations/202602220002_players_v1.sql:104:create policy player_guardians_insert on public.player_guardians
supabase/migrations/202602220002_players_v1.sql:120:create policy player_guardians_update on public.player_guardians
supabase/migrations/202602220002_players_v1.sql:148:create policy player_guardians_delete on public.player_guardians
supabase/migrations/202602220002_players_v1.sql:58:create policy players_guardian_read on public.players
supabase/migrations/202602220002_players_v1.sql:66:create policy players_guardian_insert on public.players
supabase/migrations/202602220002_players_v1.sql:73:create policy players_guardian_update on public.players
supabase/migrations/202602220002_players_v1.sql:85:create policy players_guardian_delete on public.players
supabase/migrations/202602220002_players_v1.sql:90:create policy player_guardians_read on public.player_guardians
supabase/migrations/202602220003_programs_v1.sql:123:create policy programs_public_or_read on public.programs
supabase/migrations/202602220003_programs_v1.sql:131:create policy programs_write on public.programs
supabase/migrations/202602220003_programs_v1.sql:137:create policy program_nodes_public_or_read on public.program_structure_nodes
supabase/migrations/202602220003_programs_v1.sql:152:create policy program_nodes_write on public.program_structure_nodes
supabase/migrations/202602220003_programs_v1.sql:172:create policy program_schedule_public_or_read on public.program_schedule_blocks
supabase/migrations/202602220003_programs_v1.sql:187:create policy program_schedule_write on public.program_schedule_blocks
supabase/migrations/202602220004_forms_v1.sql:112:create policy org_forms_public_or_read on public.org_forms
supabase/migrations/202602220004_forms_v1.sql:121:create policy org_forms_write on public.org_forms
supabase/migrations/202602220004_forms_v1.sql:127:create policy org_form_versions_public_or_read on public.org_form_versions
supabase/migrations/202602220004_forms_v1.sql:141:create policy org_form_versions_write on public.org_form_versions
supabase/migrations/202602220004_forms_v1.sql:147:create policy org_form_submissions_read on public.org_form_submissions
supabase/migrations/202602220004_forms_v1.sql:156:create policy org_form_submissions_insert on public.org_form_submissions
supabase/migrations/202602220004_forms_v1.sql:172:create policy org_form_submissions_update on public.org_form_submissions
supabase/migrations/202602220004_forms_v1.sql:178:create policy org_form_submissions_delete on public.org_form_submissions
supabase/migrations/202602220004_forms_v1.sql:183:create policy org_form_submission_entries_read on public.org_form_submission_entries
supabase/migrations/202602220004_forms_v1.sql:199:create policy org_form_submission_entries_insert on public.org_form_submission_entries
supabase/migrations/202602220004_forms_v1.sql:212:create policy org_form_submission_entries_update on public.org_form_submission_entries
supabase/migrations/202602220004_forms_v1.sql:232:create policy org_form_submission_entries_delete on public.org_form_submission_entries
supabase/migrations/202602220004_forms_v1.sql:244:create policy program_registrations_read on public.program_registrations
supabase/migrations/202602220004_forms_v1.sql:253:create policy program_registrations_insert on public.program_registrations
supabase/migrations/202602220004_forms_v1.sql:261:create policy program_registrations_update on public.program_registrations
supabase/migrations/202602220004_forms_v1.sql:267:create policy program_registrations_delete on public.program_registrations
supabase/migrations/202602220004_forms_v1.sql:273:create policy players_guardian_read on public.players
supabase/migrations/202602260001_program_schedule_v2.sql:103:create policy program_schedule_rules_write on public.program_schedule_rules
supabase/migrations/202602260001_program_schedule_v2.sql:123:create policy program_occurrences_public_or_read on public.program_occurrences
supabase/migrations/202602260001_program_schedule_v2.sql:138:create policy program_occurrences_write on public.program_occurrences
supabase/migrations/202602260001_program_schedule_v2.sql:158:create policy program_schedule_exceptions_public_or_read on public.program_schedule_exceptions
supabase/migrations/202602260001_program_schedule_v2.sql:173:create policy program_schedule_exceptions_write on public.program_schedule_exceptions
supabase/migrations/202602260001_program_schedule_v2.sql:88:create policy program_schedule_rules_public_or_read on public.program_schedule_rules
supabase/migrations/202602280001_events_tool.sql:136:create policy org_events_public_or_read on public.calendar_items
supabase/migrations/202602280001_events_tool.sql:145:create policy org_events_write on public.calendar_items
supabase/migrations/202602280003_form_submission_views.sql:35:create policy org_form_submission_views_read on public.org_form_submission_views
supabase/migrations/202602280003_form_submission_views.sql:50:create policy org_form_submission_views_insert on public.org_form_submission_views
supabase/migrations/202602280003_form_submission_views.sql:61:create policy org_form_submission_views_update on public.org_form_submission_views
supabase/migrations/202602280003_form_submission_views.sql:79:create policy org_form_submission_views_delete on public.org_form_submission_views
supabase/migrations/202603010001_ai_admin_actions.sql:25:create policy audit_logs_select on public.audit_logs
supabase/migrations/202603010001_ai_admin_actions.sql:33:create policy audit_logs_insert on public.audit_logs
supabase/migrations/202603010001_ai_admin_actions.sql:41:create policy audit_logs_update on public.audit_logs
supabase/migrations/202603010001_ai_admin_actions.sql:69:create policy ai_rate_limit_windows_select on public.ai_rate_limit_windows
supabase/migrations/202603010001_ai_admin_actions.sql:74:create policy ai_rate_limit_windows_insert on public.ai_rate_limit_windows
supabase/migrations/202603010001_ai_admin_actions.sql:79:create policy ai_rate_limit_windows_update on public.ai_rate_limit_windows
supabase/migrations/202603010002_facilities_tool.sql:231:create policy facility_spaces_select on public.facility_spaces
supabase/migrations/202603010002_facilities_tool.sql:243:create policy facility_spaces_write on public.facility_spaces
supabase/migrations/202603010002_facilities_tool.sql:249:create policy facility_reservation_rules_select on public.facility_reservation_rules
supabase/migrations/202603010002_facilities_tool.sql:257:create policy facility_reservation_rules_write on public.facility_reservation_rules
supabase/migrations/202603010002_facilities_tool.sql:263:create policy facility_reservations_select on public.facility_reservations
supabase/migrations/202603010002_facilities_tool.sql:281:create policy facility_reservations_write on public.facility_reservations
supabase/migrations/202603010002_facilities_tool.sql:287:create policy facility_reservation_exceptions_select on public.facility_reservation_exceptions
supabase/migrations/202603010002_facilities_tool.sql:295:create policy facility_reservation_exceptions_write on public.facility_reservation_exceptions
supabase/migrations/202603010003_form_submissions_google_sheets.sql:293:create policy org_form_google_sheet_integrations_read on public.org_form_google_sheet_integrations
supabase/migrations/202603010003_form_submissions_google_sheets.sql:298:create policy org_form_google_sheet_integrations_write on public.org_form_google_sheet_integrations
supabase/migrations/202603010003_form_submissions_google_sheets.sql:304:create policy org_form_google_sheet_outbox_service_role on public.org_form_google_sheet_outbox
supabase/migrations/202603010003_form_submissions_google_sheets.sql:310:create policy org_form_google_sheet_sync_runs_read on public.org_form_google_sheet_sync_runs
supabase/migrations/202603010003_form_submissions_google_sheets.sql:315:create policy org_form_google_sheet_sync_runs_service_role_write on public.org_form_google_sheet_sync_runs
supabase/migrations/202603010004_org_custom_domains.sql:53:create policy org_custom_domains_manage_read on public.org_custom_domains
supabase/migrations/202603010004_org_custom_domains.sql:58:create policy org_custom_domains_manage_insert on public.org_custom_domains
supabase/migrations/202603010004_org_custom_domains.sql:63:create policy org_custom_domains_manage_update on public.org_custom_domains
supabase/migrations/202603010004_org_custom_domains.sql:69:create policy org_custom_domains_manage_delete on public.org_custom_domains
supabase/migrations/202603030001_program_teams.sql:163:create policy program_teams_read on public.program_teams
supabase/migrations/202603030001_program_teams.sql:171:create policy program_teams_write on public.program_teams
supabase/migrations/202603030001_program_teams.sql:177:create policy program_team_members_read on public.program_team_members
supabase/migrations/202603030001_program_teams.sql:185:create policy program_team_members_write on public.program_team_members
supabase/migrations/202603030001_program_teams.sql:191:create policy program_team_staff_read on public.program_team_staff
supabase/migrations/202603030001_program_teams.sql:199:create policy program_team_staff_write on public.program_team_staff
supabase/migrations/202603030003_player_team_read_policy.sql:4:create policy players_guardian_read on public.players
supabase/migrations/202603030004_unified_calendar_system.sql:459:create policy calendar_entries_select on public.calendar_items
supabase/migrations/202603030004_unified_calendar_system.sql:469:create policy calendar_entries_write on public.calendar_items
supabase/migrations/202603030004_unified_calendar_system.sql:481:create policy calendar_rules_select on public.calendar_item_rules
supabase/migrations/202603030004_unified_calendar_system.sql:490:create policy calendar_rules_write on public.calendar_item_rules
supabase/migrations/202603030004_unified_calendar_system.sql:496:create policy calendar_occurrences_select on public.calendar_item_occurrences
supabase/migrations/202603030004_unified_calendar_system.sql:513:create policy calendar_occurrences_write on public.calendar_item_occurrences
supabase/migrations/202603030004_unified_calendar_system.sql:519:create policy calendar_rule_exceptions_select on public.calendar_item_rule_exceptions
supabase/migrations/202603030004_unified_calendar_system.sql:533:create policy calendar_rule_exceptions_write on public.calendar_item_rule_exceptions
supabase/migrations/202603030004_unified_calendar_system.sql:553:create policy facility_space_configurations_select on public.facility_space_configurations
supabase/migrations/202603030004_unified_calendar_system.sql:563:create policy facility_space_configurations_write on public.facility_space_configurations
supabase/migrations/202603030004_unified_calendar_system.sql:575:create policy calendar_occurrence_facility_allocations_select on public.calendar_item_space_allocations
supabase/migrations/202603030004_unified_calendar_system.sql:598:create policy calendar_occurrence_facility_allocations_write on public.calendar_item_space_allocations
supabase/migrations/202603030004_unified_calendar_system.sql:618:create policy calendar_occurrence_teams_select on public.calendar_item_participants
supabase/migrations/202603030004_unified_calendar_system.sql:633:create policy calendar_occurrence_teams_write on public.calendar_item_participants
supabase/migrations/202603030004_unified_calendar_system.sql:655:create policy org_user_inbox_items_select on public.user_notifications
supabase/migrations/202603030004_unified_calendar_system.sql:664:create policy org_user_inbox_items_insert on public.user_notifications
supabase/migrations/202603030004_unified_calendar_system.sql:680:create policy org_user_inbox_items_update on public.user_notifications
supabase/migrations/202603070001_spaces_platform.sql:478:create policy facility_spaces_select on public.facility_spaces
supabase/migrations/202603070001_spaces_platform.sql:490:create policy facility_spaces_write on public.facility_spaces
supabase/migrations/202603070001_spaces_platform.sql:496:create policy facility_reservation_rules_select on public.facility_reservation_rules
supabase/migrations/202603070001_spaces_platform.sql:504:create policy facility_reservation_rules_write on public.facility_reservation_rules
supabase/migrations/202603070001_spaces_platform.sql:510:create policy facility_reservations_select on public.facility_reservations
supabase/migrations/202603070001_spaces_platform.sql:518:create policy facility_reservations_write on public.facility_reservations
supabase/migrations/202603070001_spaces_platform.sql:524:create policy facility_reservation_exceptions_select on public.facility_reservation_exceptions
supabase/migrations/202603070001_spaces_platform.sql:532:create policy facility_reservation_exceptions_write on public.facility_reservation_exceptions
supabase/migrations/202603070001_spaces_platform.sql:538:create policy facility_space_configurations_select on public.facility_space_configurations
supabase/migrations/202603070001_spaces_platform.sql:548:create policy facility_space_configurations_write on public.facility_space_configurations
supabase/migrations/202603070001_spaces_platform.sql:652:create policy org_space_types_select on public.org_space_types
supabase/migrations/202603070001_spaces_platform.sql:660:create policy org_space_types_write on public.org_space_types
supabase/migrations/202603080001_facilities_visual_reset.sql:273:create policy facilities_select on public.facilities
supabase/migrations/202603080001_facilities_visual_reset.sql:282:create policy facilities_write on public.facilities
supabase/migrations/202603080001_facilities_visual_reset.sql:288:create policy facility_nodes_select on public.facility_layout_nodes
supabase/migrations/202603080001_facilities_visual_reset.sql:297:create policy facility_nodes_write on public.facility_layout_nodes
supabase/migrations/202603080001_facilities_visual_reset.sql:303:create policy calendar_occurrence_facility_allocations_select on public.calendar_item_space_allocations
supabase/migrations/202603080001_facilities_visual_reset.sql:326:create policy calendar_occurrence_facility_allocations_write on public.calendar_item_space_allocations
supabase/migrations/202603100001_communications_inbox.sql:330:create policy org_comm_contacts_select on public.org_comm_contacts
supabase/migrations/202603100001_communications_inbox.sql:338:create policy org_comm_contacts_write on public.org_comm_contacts
supabase/migrations/202603100001_communications_inbox.sql:344:create policy org_comm_channel_identities_select on public.org_comm_channel_identities
supabase/migrations/202603100001_communications_inbox.sql:352:create policy org_comm_channel_identities_write on public.org_comm_channel_identities
supabase/migrations/202603100001_communications_inbox.sql:358:create policy org_comm_conversations_select on public.org_comm_conversations
supabase/migrations/202603100001_communications_inbox.sql:366:create policy org_comm_conversations_write on public.org_comm_conversations
supabase/migrations/202603100001_communications_inbox.sql:372:create policy org_comm_messages_select on public.org_comm_messages
supabase/migrations/202603100001_communications_inbox.sql:380:create policy org_comm_messages_write on public.org_comm_messages
supabase/migrations/202603100001_communications_inbox.sql:386:create policy org_comm_match_suggestions_select on public.org_comm_match_suggestions
supabase/migrations/202603100001_communications_inbox.sql:394:create policy org_comm_match_suggestions_write on public.org_comm_match_suggestions
supabase/migrations/202603100001_communications_inbox.sql:400:create policy org_comm_contact_merge_audit_select on public.org_comm_contact_merge_audit
supabase/migrations/202603100001_communications_inbox.sql:408:create policy org_comm_contact_merge_audit_write on public.org_comm_contact_merge_audit
supabase/migrations/202603100001_communications_inbox.sql:413:create policy org_comm_resolution_events_select on public.org_comm_resolution_events
supabase/migrations/202603100001_communications_inbox.sql:421:create policy org_comm_resolution_events_write on public.org_comm_resolution_events
supabase/migrations/202603100003_communications_inbox_repair.sql:333:create policy org_comm_contacts_select on public.org_comm_contacts
supabase/migrations/202603100003_communications_inbox_repair.sql:341:create policy org_comm_contacts_write on public.org_comm_contacts
supabase/migrations/202603100003_communications_inbox_repair.sql:347:create policy org_comm_channel_identities_select on public.org_comm_channel_identities
supabase/migrations/202603100003_communications_inbox_repair.sql:355:create policy org_comm_channel_identities_write on public.org_comm_channel_identities
supabase/migrations/202603100003_communications_inbox_repair.sql:361:create policy org_comm_conversations_select on public.org_comm_conversations
supabase/migrations/202603100003_communications_inbox_repair.sql:369:create policy org_comm_conversations_write on public.org_comm_conversations
supabase/migrations/202603100003_communications_inbox_repair.sql:375:create policy org_comm_messages_select on public.org_comm_messages
supabase/migrations/202603100003_communications_inbox_repair.sql:383:create policy org_comm_messages_write on public.org_comm_messages
supabase/migrations/202603100003_communications_inbox_repair.sql:389:create policy org_comm_match_suggestions_select on public.org_comm_match_suggestions
supabase/migrations/202603100003_communications_inbox_repair.sql:397:create policy org_comm_match_suggestions_write on public.org_comm_match_suggestions
supabase/migrations/202603100003_communications_inbox_repair.sql:403:create policy org_comm_contact_merge_audit_select on public.org_comm_contact_merge_audit
supabase/migrations/202603100003_communications_inbox_repair.sql:411:create policy org_comm_contact_merge_audit_write on public.org_comm_contact_merge_audit
supabase/migrations/202603100003_communications_inbox_repair.sql:416:create policy org_comm_resolution_events_select on public.org_comm_resolution_events
supabase/migrations/202603100003_communications_inbox_repair.sql:424:create policy org_comm_resolution_events_write on public.org_comm_resolution_events
supabase/migrations/202603110001_inbox_channel_integrations.sql:56:create policy org_comm_channel_integrations_select on public.org_comm_channel_integrations
supabase/migrations/202603110001_inbox_channel_integrations.sql:64:create policy org_comm_channel_integrations_write on public.org_comm_channel_integrations
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:652:create policy facility_spaces_select on public.facility_spaces
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:664:create policy facility_spaces_write on public.facility_spaces
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:670:create policy facility_reservation_rules_select on public.facility_reservation_rules
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:678:create policy facility_reservation_rules_write on public.facility_reservation_rules
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:684:create policy facility_reservations_select on public.facility_reservations
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:702:create policy facility_reservations_write on public.facility_reservations
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:708:create policy facility_reservation_exceptions_select on public.facility_reservation_exceptions
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:716:create policy facility_reservation_exceptions_write on public.facility_reservation_exceptions
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:722:create policy calendar_entries_select on public.calendar_items
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:732:create policy calendar_entries_write on public.calendar_items
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:744:create policy calendar_rules_select on public.calendar_item_rules
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:753:create policy calendar_rules_write on public.calendar_item_rules
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:759:create policy calendar_occurrences_select on public.calendar_item_occurrences
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:776:create policy calendar_occurrences_write on public.calendar_item_occurrences
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:782:create policy calendar_rule_exceptions_select on public.calendar_item_rule_exceptions
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:796:create policy calendar_rule_exceptions_write on public.calendar_item_rule_exceptions
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:816:create policy facility_space_configurations_select on public.facility_space_configurations
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:826:create policy facility_space_configurations_write on public.facility_space_configurations
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:838:create policy calendar_occurrence_facility_allocations_select on public.calendar_item_space_allocations
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:861:create policy calendar_occurrence_facility_allocations_write on public.calendar_item_space_allocations
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:881:create policy calendar_occurrence_teams_select on public.calendar_item_participants
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:896:create policy calendar_occurrence_teams_write on public.calendar_item_participants
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:918:create policy org_user_inbox_items_select on public.user_notifications
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:927:create policy org_user_inbox_items_insert on public.user_notifications
supabase/migrations/202603120001_facilities_calendar_schema_repair.sql:943:create policy org_user_inbox_items_update on public.user_notifications
supabase/migrations/202603140001_sportsconnect_import.sql:193:create policy org_orders_read on public.org_orders
supabase/migrations/202603140001_sportsconnect_import.sql:202:create policy org_orders_write on public.org_orders
supabase/migrations/202603140001_sportsconnect_import.sql:208:create policy org_order_items_read on public.org_order_items
supabase/migrations/202603140001_sportsconnect_import.sql:217:create policy org_order_items_write on public.org_order_items
supabase/migrations/202603140001_sportsconnect_import.sql:223:create policy org_order_payments_read on public.org_order_payments
supabase/migrations/202603140001_sportsconnect_import.sql:232:create policy org_order_payments_write on public.org_order_payments
supabase/migrations/202603140001_sportsconnect_import.sql:238:create policy sportsconnect_import_runs_read on public.sportsconnect_import_runs
supabase/migrations/202603140001_sportsconnect_import.sql:243:create policy sportsconnect_import_runs_write on public.sportsconnect_import_runs
supabase/migrations/202603140001_sportsconnect_import.sql:249:create policy sportsconnect_import_rows_read on public.sportsconnect_import_rows
supabase/migrations/202603140001_sportsconnect_import.sql:254:create policy sportsconnect_import_rows_write on public.sportsconnect_import_rows
supabase/migrations/202603140001_sportsconnect_import.sql:260:create policy sportsconnect_import_applied_rows_read on public.sportsconnect_import_applied_rows
supabase/migrations/202603140001_sportsconnect_import.sql:265:create policy sportsconnect_import_applied_rows_write on public.sportsconnect_import_applied_rows
supabase/migrations/202603150001_calendar_facility_allocations_multi.sql:111:create policy calendar_rule_facility_allocations_write on public.calendar_item_space_allocations
supabase/migrations/202603150001_calendar_facility_allocations_multi.sql:97:create policy calendar_rule_facility_allocations_select on public.calendar_item_space_allocations
supabase/migrations/202603160001_calendar_lens_sources_and_saved_views.sql:405:create policy calendar_sources_select on public.calendar_item_sources
supabase/migrations/202603160001_calendar_lens_sources_and_saved_views.sql:419:create policy calendar_sources_write on public.calendar_item_sources
supabase/migrations/202603160001_calendar_lens_sources_and_saved_views.sql:425:create policy calendar_lens_saved_views_select on public.calendar_saved_views
supabase/migrations/202603160001_calendar_lens_sources_and_saved_views.sql:442:create policy calendar_lens_saved_views_write on public.calendar_saved_views
supabase/migrations/202603170001_site_structure_canvas.sql:80:create policy org_site_structure_nodes_public_or_manager_read on public.org_site_structure_nodes
supabase/migrations/202603170001_site_structure_canvas.sql:85:create policy org_site_structure_nodes_manager_insert on public.org_site_structure_nodes
supabase/migrations/202603170001_site_structure_canvas.sql:90:create policy org_site_structure_nodes_manager_update on public.org_site_structure_nodes
supabase/migrations/202603170001_site_structure_canvas.sql:96:create policy org_site_structure_nodes_manager_delete on public.org_site_structure_nodes
supabase/migrations/202603220001_file_manager.sql:1142:create policy app_file_folders_read on public.app_file_folders
supabase/migrations/202603220001_file_manager.sql:1154:create policy app_file_folders_write on public.app_file_folders
supabase/migrations/202603220001_file_manager.sql:1174:create policy app_files_read on public.app_files
supabase/migrations/202603220001_file_manager.sql:1186:create policy app_files_write on public.app_files
supabase/migrations/202603220001_file_manager.sql:1262:create policy org_private_files_read on storage.objects
supabase/migrations/202603220001_file_manager.sql:1272:create policy org_private_files_write on storage.objects
supabase/migrations/202603220001_file_manager.sql:1288:create policy account_assets_user_read on storage.objects
supabase/migrations/202603220001_file_manager.sql:1297:create policy account_assets_user_write on storage.objects
```

## Appendix F: Module Export Inventory
```text
=== MODULE EXPORTS ===
--- ai ---
apps/orgframe-app/modules/ai/config.ts:1:export class MissingOpenAiKeyError extends Error {
apps/orgframe-app/modules/ai/config.ts:20:export function getAiConfig(): AiConfig {
apps/orgframe-app/modules/ai/config.ts:8:export type AiConfig = {
apps/orgframe-app/modules/ai/gateway.ts:14:export type AiPlanningResult = {
apps/orgframe-app/modules/ai/gateway.ts:8:export type AiPlanningCallbacks = {
apps/orgframe-app/modules/ai/rate-limit.ts:3:export type AiRateLimitResult = {
apps/orgframe-app/modules/ai/schemas.ts:108:export const resolveEntitiesInputSchema = z.object({
apps/orgframe-app/modules/ai/schemas.ts:10:export const aiRequestSchema = z.object({
apps/orgframe-app/modules/ai/schemas.ts:113:export const proposeChangesInputSchema = z.object({
apps/orgframe-app/modules/ai/schemas.ts:122:export const executeChangesInputSchema = z.object({
apps/orgframe-app/modules/ai/schemas.ts:20:export const aiEntityCandidateSchema = z.object({
apps/orgframe-app/modules/ai/schemas.ts:29:export const aiChangesetSchema = z.object({
apps/orgframe-app/modules/ai/schemas.ts:56:export const aiProposalSchema = z.object({
apps/orgframe-app/modules/ai/schemas.ts:5:export const aiConversationMessageSchema = z.object({
apps/orgframe-app/modules/ai/schemas.ts:86:export const aiActAuditDetailSchema = z.object({
apps/orgframe-app/modules/ai/sse.ts:5:export function createSseResponse(handler: (emit: <T extends AiSseEventName>(event: T, payload: AiSseEventMap[T]) => void) => Promise<void>) {
apps/orgframe-app/modules/ai/tools/base.ts:10:export type AiToolDefinition<TInput extends ZodTypeAny, TOutput> = {
apps/orgframe-app/modules/ai/tools/base.ts:19:export function hasRequiredPermissions(granted: Permission[], required: Permission[]) {
apps/orgframe-app/modules/ai/tools/base.ts:5:export type AiToolExecutionContext = {
apps/orgframe-app/modules/ai/tools/execute-changes.ts:12:export const executeChangesTool: AiToolDefinition<typeof executeChangesInputSchema, ExecuteChangesResult> = {
apps/orgframe-app/modules/ai/tools/execute-changes.ts:7:export type ExecuteChangesResult = {
apps/orgframe-app/modules/ai/tools/index.ts:1:export { aiTools, aiToolDefinitions, runAiTool } from "@/modules/ai/tools/registry";
apps/orgframe-app/modules/ai/tools/index.ts:2:export type { AiToolName } from "@/modules/ai/tools/registry";
apps/orgframe-app/modules/ai/tools/intents/stub-intents.ts:10:export function proposeStubIntent(intentType: string): AiProposal {
apps/orgframe-app/modules/ai/tools/propose-changes.ts:12:export type ProposeChangesResult = {
apps/orgframe-app/modules/ai/tools/propose-changes.ts:66:export const proposeChangesTool: AiToolDefinition<typeof proposeChangesInputSchema, ProposeChangesResult> = {
apps/orgframe-app/modules/ai/tools/registry.ts:14:export type AiToolName = keyof typeof aiTools;
apps/orgframe-app/modules/ai/tools/registry.ts:16:export const aiToolDefinitions = [
apps/orgframe-app/modules/ai/tools/registry.ts:62:export function canUseTool(grantedPermissions: Permission[], requiredPermissions: Permission[]) {
apps/orgframe-app/modules/ai/tools/registry.ts:8:export const aiTools = {
apps/orgframe-app/modules/ai/tools/resolve-entities.ts:135:export const resolveEntitiesTool: AiToolDefinition<typeof resolveEntitiesInputSchema, ResolveEntitiesResult> = {
apps/orgframe-app/modules/ai/tools/resolve-entities.ts:6:export type ResolveEntitiesResult = {
apps/orgframe-app/modules/ai/types.ts:100:export type AiToolResultEvent = {
apps/orgframe-app/modules/ai/types.ts:105:export type AiExecutionResult = {
apps/orgframe-app/modules/ai/types.ts:112:export type AiSseEventMap = {
apps/orgframe-app/modules/ai/types.ts:122:export type AiSseEventName = keyof AiSseEventMap;
apps/orgframe-app/modules/ai/types.ts:124:export type AiActAuditDetail = {
apps/orgframe-app/modules/ai/types.ts:12:export type AiRequestPayload = {
apps/orgframe-app/modules/ai/types.ts:139:export type AiPermissionEnvelope = {
apps/orgframe-app/modules/ai/types.ts:145:export type AiResolvedOrg = {
apps/orgframe-app/modules/ai/types.ts:151:export type AiResolvedContext = {
apps/orgframe-app/modules/ai/types.ts:22:export type AiEntityCandidateType = "governing_body" | "program" | "program_node" | "player" | "form" | "form_submission" | "event";
apps/orgframe-app/modules/ai/types.ts:24:export type AiEntityCandidate = {
apps/orgframe-app/modules/ai/types.ts:33:export type AiEntityResolution = {
apps/orgframe-app/modules/ai/types.ts:38:export type AiChangesetOperation = {
apps/orgframe-app/modules/ai/types.ts:3:export type AiMode = "ask" | "act";
apps/orgframe-app/modules/ai/types.ts:47:export type AiChangesetPrecondition = {
apps/orgframe-app/modules/ai/types.ts:4:export type AiPhase = "plan" | "confirm" | "cancel";
apps/orgframe-app/modules/ai/types.ts:54:export type AiChangesetV1 = {
apps/orgframe-app/modules/ai/types.ts:5:export type AiConversationRole = "user" | "assistant";
apps/orgframe-app/modules/ai/types.ts:65:export type AiProposalStep = {
apps/orgframe-app/modules/ai/types.ts:71:export type AiAmbiguityCandidate = {
apps/orgframe-app/modules/ai/types.ts:77:export type AiAmbiguity = {
apps/orgframe-app/modules/ai/types.ts:7:export type AiConversationMessage = {
apps/orgframe-app/modules/ai/types.ts:84:export type AiProposal = {
apps/orgframe-app/modules/ai/types.ts:95:export type AiToolCallEvent = {

--- calendar ---
apps/orgframe-app/modules/calendar/lens.ts:115:export function resolveLensSourceIds(input: {
apps/orgframe-app/modules/calendar/lens.ts:167:export function filterCalendarReadModelByLens(input: {
apps/orgframe-app/modules/calendar/lens.ts:234:export function explainOccurrenceVisibility(input: {
apps/orgframe-app/modules/calendar/lens.ts:27:export function defaultLensState(lens: CalendarLensKind = "mine"): CalendarLensState {
apps/orgframe-app/modules/calendar/lens.ts:50:export function resolveDefaultLens(context: CalendarPageContext): CalendarLensKind {
apps/orgframe-app/modules/calendar/lens.ts:60:export function resolveAvailableScopeTypes(context: CalendarPageContext): CalendarScopeType[] {
apps/orgframe-app/modules/calendar/read-model-scope.ts:10:export function scopeCalendarReadModelByContext(input: ScopeInput): CalendarReadModel {
apps/orgframe-app/modules/calendar/rule-engine.ts:215:export function generateOccurrencesForRule(
apps/orgframe-app/modules/calendar/rule-engine.ts:3:export const DEFAULT_CALENDAR_HORIZON_MONTHS = 18;
apps/orgframe-app/modules/calendar/rule-engine.ts:5:export type GeneratedCalendarOccurrenceInput = Pick<
apps/orgframe-app/modules/calendar/rule-engine.ts:90:export function zonedLocalToUtc(localDate: string, localTime: string, timeZone: string): Date {
apps/orgframe-app/modules/calendar/types.ts:115:export type CalendarOccurrence = {
apps/orgframe-app/modules/calendar/types.ts:136:export type CalendarRuleException = {
apps/orgframe-app/modules/calendar/types.ts:150:export type FacilitySpaceConfiguration = {
apps/orgframe-app/modules/calendar/types.ts:166:export type FacilityAllocation = {
apps/orgframe-app/modules/calendar/types.ts:184:export type CalendarRuleFacilityAllocation = {
apps/orgframe-app/modules/calendar/types.ts:18:export type CalendarAudience =
apps/orgframe-app/modules/calendar/types.ts:1:export type CalendarEntryType = "event" | "practice" | "game";
apps/orgframe-app/modules/calendar/types.ts:200:export type OccurrenceTeamInvite = {
apps/orgframe-app/modules/calendar/types.ts:215:export type InboxItem = {
apps/orgframe-app/modules/calendar/types.ts:232:export type CalendarPublicCatalogItem = {
apps/orgframe-app/modules/calendar/types.ts:247:export type CalendarOccurrenceReadModel = {
apps/orgframe-app/modules/calendar/types.ts:254:export type CalendarReadModel = {
apps/orgframe-app/modules/calendar/types.ts:266:export type CalendarLensKind = "mine" | "this_page" | "public" | "operations" | "custom";
apps/orgframe-app/modules/calendar/types.ts:268:export type CalendarPageContextType = "org" | "program" | "division" | "team" | "facility" | "public" | "embedded";
apps/orgframe-app/modules/calendar/types.ts:270:export type CalendarPageContext = {
apps/orgframe-app/modules/calendar/types.ts:280:export type CalendarLensState = {
apps/orgframe-app/modules/calendar/types.ts:29:export type CalendarEntryStatus = "scheduled" | "cancelled" | "archived";
apps/orgframe-app/modules/calendar/types.ts:301:export type CalendarLayerNode = {
apps/orgframe-app/modules/calendar/types.ts:314:export type CalendarWhyShown = {
apps/orgframe-app/modules/calendar/types.ts:31:export type CalendarRuleMode = "single_date" | "multiple_specific_dates" | "repeating_pattern" | "continuous_date_range" | "custom_advanced";
apps/orgframe-app/modules/calendar/types.ts:325:export type CalendarLensSavedView = {
apps/orgframe-app/modules/calendar/types.ts:33:export type CalendarIntervalUnit = "day" | "week" | "month";
apps/orgframe-app/modules/calendar/types.ts:35:export type CalendarRuleEndMode = "never" | "until_date" | "after_occurrences";
apps/orgframe-app/modules/calendar/types.ts:37:export type CalendarOccurrenceSourceType = "single" | "rule" | "override";
apps/orgframe-app/modules/calendar/types.ts:39:export type CalendarOccurrenceStatus = "scheduled" | "cancelled";
apps/orgframe-app/modules/calendar/types.ts:3:export type CalendarVisibility = "internal" | "published";
apps/orgframe-app/modules/calendar/types.ts:41:export type CalendarRuleExceptionKind = "skip" | "override";
apps/orgframe-app/modules/calendar/types.ts:43:export type FacilityLockMode = "exclusive" | "shared_invite_only";
apps/orgframe-app/modules/calendar/types.ts:45:export type OccurrenceTeamRole = "host" | "participant";
apps/orgframe-app/modules/calendar/types.ts:47:export type OccurrenceInviteStatus = "accepted" | "pending" | "declined" | "left";
apps/orgframe-app/modules/calendar/types.ts:49:export type CalendarEntry = {
apps/orgframe-app/modules/calendar/types.ts:5:export type CalendarScopeType = "organization" | "program" | "division" | "team" | "custom";
apps/orgframe-app/modules/calendar/types.ts:69:export type CalendarSource = {
apps/orgframe-app/modules/calendar/types.ts:7:export type CalendarPurpose =
apps/orgframe-app/modules/calendar/types.ts:88:export type CalendarRule = {

--- communications ---
apps/orgframe-app/modules/communications/actions.ts:98:export type CommunicationsActionResult<TData = undefined> =
apps/orgframe-app/modules/communications/integrations/credentials.ts:28:export function maskToken(token: string) {
apps/orgframe-app/modules/communications/integrations/credentials.ts:38:export function encryptAccessToken(accessToken: string) {
apps/orgframe-app/modules/communications/integrations/credentials.ts:55:export function decryptAccessToken(encrypted: string) {
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:111:export function buildFacebookOauthDialogUrl(config: FacebookOauthConfig, state: string) {
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:15:export type FacebookOauthPage = {
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:21:export type FacebookOauthConfig = {
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:41:export function getFacebookOauthConfig(origin: string): FacebookOauthConfig {
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:66:export function createSignedFacebookOauthState(payload: Omit<FacebookOauthStatePayload, "iat">, stateSecret: string) {
apps/orgframe-app/modules/communications/integrations/facebook-oauth.ts:77:export function verifySignedFacebookOauthState(state: string, stateSecret: string, maxAgeSeconds = 10 * 60): FacebookOauthStatePayload {
apps/orgframe-app/modules/communications/integrations/facebook.ts:107:export function verifyFacebookWebhookSignature(rawBody: string, signatureHeader: string | null, appSecret: string) {
apps/orgframe-app/modules/communications/integrations/facebook.ts:13:export type FacebookPageIdentity = {
apps/orgframe-app/modules/communications/integrations/facebook.ts:148:export function parseFacebookMessengerWebhookPayload(payload: unknown): FacebookMessengerInboundRecord[] {
apps/orgframe-app/modules/communications/integrations/facebook.ts:18:export type FacebookMessengerInboundRecord = {
apps/orgframe-app/modules/communications/integrations/facebook.ts:226:export function toFacebookPageIdentityLabel(page: FacebookPageIdentity | null, fallbackPageId: string) {
apps/orgframe-app/modules/communications/normalization.ts:1:export function normalizeEmail(value: string | null | undefined) {
apps/orgframe-app/modules/communications/normalization.ts:20:export function normalizeDisplayName(value: string | null | undefined) {
apps/orgframe-app/modules/communications/normalization.ts:25:export function splitName(value: string | null | undefined) {
apps/orgframe-app/modules/communications/normalization.ts:41:export function nameSimilarity(left: string | null | undefined, right: string | null | undefined) {
apps/orgframe-app/modules/communications/normalization.ts:6:export function normalizePhone(value: string | null | undefined) {
apps/orgframe-app/modules/communications/scoring.ts:14:export function scoreContactCandidate(input: {
apps/orgframe-app/modules/communications/scoring.ts:4:export type MatchScoringConfig = {
apps/orgframe-app/modules/communications/scoring.ts:71:export function rankContactCandidates(input: {
apps/orgframe-app/modules/communications/scoring.ts:88:export function pickAutoLinkCandidate(candidates: ContactCandidate[], config: MatchScoringConfig = defaultMatchScoringConfig) {
apps/orgframe-app/modules/communications/scoring.ts:9:export const defaultMatchScoringConfig: MatchScoringConfig = {
apps/orgframe-app/modules/communications/service.ts:936:export function mapReasonsToLabel(reasons: ContactMatchReasonCode[]) {
apps/orgframe-app/modules/communications/service.ts:952:export function resolveDirection(value: string | null | undefined): CommDirection {
apps/orgframe-app/modules/communications/types.ts:108:export type CommResolutionEvent = {
apps/orgframe-app/modules/communications/types.ts:11:export type ContactMatchReasonCode =
apps/orgframe-app/modules/communications/types.ts:120:export type CommChannelIntegration = {
apps/orgframe-app/modules/communications/types.ts:139:export type CommSuggestionWithContact = {
apps/orgframe-app/modules/communications/types.ts:144:export type InboxConversationListItem = {
apps/orgframe-app/modules/communications/types.ts:151:export type InboxConversationDetail = {
apps/orgframe-app/modules/communications/types.ts:160:export type InboxWorkspaceReadModel = {
apps/orgframe-app/modules/communications/types.ts:165:export type InboundIdentityHints = {
apps/orgframe-app/modules/communications/types.ts:173:export type InboundIngressPayload = {
apps/orgframe-app/modules/communications/types.ts:193:export type ContactCandidate = {
apps/orgframe-app/modules/communications/types.ts:1:export type CommChannelType = "email" | "sms" | "facebook_messenger" | "website_chat" | "instagram" | "whatsapp" | "other";
apps/orgframe-app/modules/communications/types.ts:20:export type CommContact = {
apps/orgframe-app/modules/communications/types.ts:3:export type CommResolutionStatus = "resolved" | "unresolved" | "suggested" | "ignored";
apps/orgframe-app/modules/communications/types.ts:40:export type CommChannelIdentity = {
apps/orgframe-app/modules/communications/types.ts:57:export type CommConversation = {
apps/orgframe-app/modules/communications/types.ts:5:export type CommDirection = "inbound" | "outbound" | "system";
apps/orgframe-app/modules/communications/types.ts:75:export type CommMessage = {
apps/orgframe-app/modules/communications/types.ts:7:export type CommMatchStatus = "pending" | "accepted" | "rejected" | "expired" | "deferred";
apps/orgframe-app/modules/communications/types.ts:94:export type CommMatchSuggestion = {
apps/orgframe-app/modules/communications/types.ts:9:export type CommChannelIntegrationStatus = "active" | "disconnected" | "error";

--- core ---
apps/orgframe-app/modules/core/access.ts:181:export const reservedOrgRoleKeys = new Set<DefaultOrgRole>(["admin", "member"]);
apps/orgframe-app/modules/core/access.ts:186:export function isPermission(value: string): value is Permission {
apps/orgframe-app/modules/core/access.ts:190:export function isDefaultOrgRole(role: string): role is DefaultOrgRole {
apps/orgframe-app/modules/core/access.ts:194:export function isReservedOrgRoleKey(roleKey: string) {
apps/orgframe-app/modules/core/access.ts:198:export function isValidRoleKey(roleKey: string) {
apps/orgframe-app/modules/core/access.ts:1:export type OrgRole = string;
apps/orgframe-app/modules/core/access.ts:202:export function normalizeRoleKey(value: string) {
apps/orgframe-app/modules/core/access.ts:211:export function getDefaultRolePermissions(role: string): Permission[] | null {
apps/orgframe-app/modules/core/access.ts:219:export function getDefaultRoleLabel(role: DefaultOrgRole) {
apps/orgframe-app/modules/core/access.ts:223:export function getRoleLabel(roleKey: string) {
apps/orgframe-app/modules/core/access.ts:241:export function isAdminLikeRole(role: string) {
apps/orgframe-app/modules/core/access.ts:245:export function getPermissionsForRole(roleKey: OrgRole, customRoles: CustomRolePermissionSource[] = []) {
apps/orgframe-app/modules/core/access.ts:255:export function hasPermissions(grantedPermissions: Permission[], requiredPermissions: Permission[]) {
apps/orgframe-app/modules/core/access.ts:25:export type PermissionDefinition = {
apps/orgframe-app/modules/core/access.ts:32:export type CustomRolePermissionSource = {
apps/orgframe-app/modules/core/access.ts:37:export const allPermissions: Permission[] = [
apps/orgframe-app/modules/core/access.ts:3:export type DefaultOrgRole = "admin" | "member";
apps/orgframe-app/modules/core/access.ts:5:export type Permission =
apps/orgframe-app/modules/core/access.ts:60:export const permissionDefinitions: PermissionDefinition[] = [

--- events ---
apps/orgframe-app/modules/events/actions.ts:39:export type EventsActionResult<TData = undefined> =
apps/orgframe-app/modules/events/types.ts:1:export type EventStatus = "draft" | "published" | "archived";
apps/orgframe-app/modules/events/types.ts:22:export type EventCatalogItem = {
apps/orgframe-app/modules/events/types.ts:3:export type OrgEvent = {

--- facilities ---
apps/orgframe-app/modules/facilities/schedule/rule-engine.ts:209:export function generateReservationsForRule(rule: FacilityReservationRule, options?: { nowDate?: Date; horizonMonths?: number }): GeneratedFacilityReservationInput[] {
apps/orgframe-app/modules/facilities/schedule/rule-engine.ts:3:export const DEFAULT_FACILITY_SCHEDULE_HORIZON_MONTHS = 18;
apps/orgframe-app/modules/facilities/schedule/rule-engine.ts:5:export type GeneratedFacilityReservationInput = Pick<
apps/orgframe-app/modules/facilities/schedule/rule-engine.ts:87:export function zonedLocalToUtc(localDate: string, localTime: string, timeZone: string): Date {
apps/orgframe-app/modules/facilities/status.ts:22:export function parseFacilitySpaceStatusLabels(input: Record<string, unknown> | null | undefined): FacilitySpaceStatusLabels {
apps/orgframe-app/modules/facilities/status.ts:38:export function normalizeFacilitySpaceStatusLabels(input: FacilitySpaceStatusLabels | null | undefined): FacilitySpaceStatusLabels {
apps/orgframe-app/modules/facilities/status.ts:3:export type FacilitySpaceStatusLabels = Partial<Record<FacilitySpaceStatus, string>>;
apps/orgframe-app/modules/facilities/status.ts:54:export function formatFacilitySpaceStatusLabel(status: FacilitySpaceStatus, labels: FacilitySpaceStatusLabels | null | undefined) {
apps/orgframe-app/modules/facilities/status.ts:59:export function buildFacilitySpaceStatusOptions(labels: FacilitySpaceStatusLabels | null | undefined) {
apps/orgframe-app/modules/facilities/status.ts:69:export function resolveFacilitySpaceStatusLabels(space: FacilitySpace) {
apps/orgframe-app/modules/facilities/types.ts:110:export type FacilityReservationReadModel = {
apps/orgframe-app/modules/facilities/types.ts:117:export type FacilityPublicSpaceStatus = "open" | "closed" | "booked";
apps/orgframe-app/modules/facilities/types.ts:119:export type FacilityPublicReservation = {
apps/orgframe-app/modules/facilities/types.ts:11:export type FacilityReservationRuleIntervalUnit = "day" | "week" | "month";
apps/orgframe-app/modules/facilities/types.ts:130:export type FacilityPublicSpaceAvailability = {
apps/orgframe-app/modules/facilities/types.ts:13:export type FacilityReservationRuleEndMode = "never" | "until_date" | "after_occurrences";
apps/orgframe-app/modules/facilities/types.ts:143:export type FacilityPublicAvailabilitySnapshot = {
apps/orgframe-app/modules/facilities/types.ts:15:export type FacilityReservationExceptionKind = "skip" | "override";
apps/orgframe-app/modules/facilities/types.ts:17:export type FacilitySpace = {
apps/orgframe-app/modules/facilities/types.ts:1:export type FacilitySpaceKind = "building" | "floor" | "room" | "field" | "court" | "custom";
apps/orgframe-app/modules/facilities/types.ts:35:export type FacilityReservationRule = {
apps/orgframe-app/modules/facilities/types.ts:3:export type FacilitySpaceStatus = "open" | "closed" | "archived";
apps/orgframe-app/modules/facilities/types.ts:5:export type FacilityReservationKind = "booking" | "blackout";
apps/orgframe-app/modules/facilities/types.ts:68:export type FacilityReservation = {
apps/orgframe-app/modules/facilities/types.ts:7:export type FacilityReservationStatus = "pending" | "approved" | "rejected" | "cancelled";
apps/orgframe-app/modules/facilities/types.ts:97:export type FacilityReservationException = {
apps/orgframe-app/modules/facilities/types.ts:9:export type FacilityReservationRuleMode = "single_date" | "multiple_specific_dates" | "repeating_pattern" | "continuous_date_range" | "custom_advanced";

--- file-manager ---
apps/orgframe-app/modules/file-manager/FileManagerProvider.tsx:1365:export function useFileManager() {
apps/orgframe-app/modules/file-manager/FileManagerProvider.tsx:255:export function FileManagerProvider({ children }: { children: React.ReactNode }) {
apps/orgframe-app/modules/file-manager/access.ts:25:export function canReadAccessTag(grantedPermissions: Permission[], accessTag: FileManagerAccessTag) {
apps/orgframe-app/modules/file-manager/access.ts:34:export function canWriteAccessTag(grantedPermissions: Permission[], accessTag: FileManagerAccessTag) {
apps/orgframe-app/modules/file-manager/access.ts:43:export function canReadAnyOrgFiles(grantedPermissions: Permission[]) {
apps/orgframe-app/modules/file-manager/access.ts:47:export function canWriteAnyOrgFiles(grantedPermissions: Permission[]) {
apps/orgframe-app/modules/file-manager/index.ts:1:export { FileManagerProvider, useFileManager } from "@/modules/file-manager/FileManagerProvider";
apps/orgframe-app/modules/file-manager/index.ts:2:export type {
apps/orgframe-app/modules/file-manager/server.ts:350:export function resolveSystemFolderIds(folders: FileManagerFolder[]) {
apps/orgframe-app/modules/file-manager/types.ts:105:export type FileManagerSnapshot = {
apps/orgframe-app/modules/file-manager/types.ts:111:export type FileManagerLoadInput = {
apps/orgframe-app/modules/file-manager/types.ts:119:export type FileManagerMutationInput =
apps/orgframe-app/modules/file-manager/types.ts:11:export type FileManagerVisibility = "private" | "public";
apps/orgframe-app/modules/file-manager/types.ts:13:export type FileManagerSort = "name-asc" | "name-desc" | "newest" | "oldest" | "size-asc" | "size-desc";
apps/orgframe-app/modules/file-manager/types.ts:15:export type FileManagerEntityContext = {
apps/orgframe-app/modules/file-manager/types.ts:171:export type FileManagerUploadPayload = {
apps/orgframe-app/modules/file-manager/types.ts:192:export type FileManagerUploadResult =
apps/orgframe-app/modules/file-manager/types.ts:1:export type FileManagerScope = "organization" | "personal";
apps/orgframe-app/modules/file-manager/types.ts:202:export type FileManagerContextValue = {
apps/orgframe-app/modules/file-manager/types.ts:20:export type FileManagerDefaultFolder =
apps/orgframe-app/modules/file-manager/types.ts:35:export type FileManagerFolder = {
apps/orgframe-app/modules/file-manager/types.ts:3:export type FileManagerMode = "select" | "manage";
apps/orgframe-app/modules/file-manager/types.ts:52:export type FileManagerFile = {
apps/orgframe-app/modules/file-manager/types.ts:5:export type FileManagerSelectionType = "single" | "multiple";
apps/orgframe-app/modules/file-manager/types.ts:7:export type FileManagerEntityType = "program" | "division" | "team" | "general";
apps/orgframe-app/modules/file-manager/types.ts:81:export type FileManagerUploadDefaults = {
apps/orgframe-app/modules/file-manager/types.ts:90:export type OpenFileManagerOptions = {
apps/orgframe-app/modules/file-manager/types.ts:9:export type FileManagerAccessTag = "manage" | "branding" | "programs" | "pages" | "personal";

--- forms ---
apps/orgframe-app/modules/forms/actions.ts:1023:export type FormSubmissionViewAdminAccount = {
apps/orgframe-app/modules/forms/actions.ts:1029:export type FormSubmissionViewsData = {
apps/orgframe-app/modules/forms/actions.ts:1450:export type FormGoogleSheetIntegrationData = {
apps/orgframe-app/modules/forms/actions.ts:1630:export type FormSharingPageItem = {
apps/orgframe-app/modules/forms/actions.ts:1638:export type FormSharingData = {
apps/orgframe-app/modules/forms/actions.ts:279:export type FormsActionResult<TData = undefined> =
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:115:export function buildGoogleSheetsOauthDialogUrl(config: GoogleSheetsOauthConfig, state: string) {
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:18:export type GoogleSheetsOauthConfig = {
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:38:export function getGoogleSheetsOauthConfig(origin: string): GoogleSheetsOauthConfig {
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:63:export function createSignedGoogleSheetsOauthState(
apps/orgframe-app/modules/forms/integrations/google-sheets/oauth.ts:77:export function verifySignedGoogleSheetsOauthState(
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:16:export const GOOGLE_SHEET_SYSTEM_COLUMNS = [
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:24:export const GOOGLE_SHEET_MUTABLE_COLUMNS = ["status", "admin_notes"] as const;
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:26:export const GOOGLE_SHEET_LINK_COLUMNS = ["players_linked", "actions"] as const;
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:28:export const GOOGLE_SHEET_BASE_READ_COLUMNS = ["submitted_at", "updated_at"] as const;
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:30:export const GOOGLE_SHEET_ENTRY_SYSTEM_COLUMNS = [
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:39:export const GOOGLE_SHEET_ENTRY_BASE_COLUMNS = ["player_id", "program_node_id", "created_at"] as const;
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:41:export const GOOGLE_SHEET_ENTRY_LINK_COLUMNS = ["players_linked", "actions"] as const;
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:43:export type ParsedSubmissionSheetRow = {
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:4:export const GOOGLE_SHEETS_TAB_SUBMISSIONS = "Submissions";
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:51:export function normalizeSubmissionStatus(value: unknown): SubmissionStatus | null {
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:5:export const GOOGLE_SHEETS_TAB_ENTRIES = "Entries";
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:63:export function normalizeAdminNotes(value: unknown): string | null {
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:76:export function parseSheetSyncRev(value: unknown): number | null {
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:7:export const GOOGLE_SHEET_SUBMISSION_STATUS_VALUES: SubmissionStatus[] = [
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:85:export function buildRowHash(parts: Array<string | number | null | undefined>): string {
apps/orgframe-app/modules/forms/integrations/google-sheets/schema.ts:90:export function normalizeSheetCell(value: unknown): string {
apps/orgframe-app/modules/forms/integrations/google-sheets/sync.ts:2108:export function verifyGoogleSheetWebhookSignature(input: {
apps/orgframe-app/modules/forms/schema.ts:150:export function createDefaultRegistrationPages(): FormPage[] {
apps/orgframe-app/modules/forms/schema.ts:154:export function createDefaultFormSchema(name = "Form", formKind: FormKind = "generic"): FormSchema {
apps/orgframe-app/modules/forms/schema.ts:337:export function parseFormSchema(value: unknown, fallbackName = "Form", formKind: FormKind = "generic"): FormSchema {
apps/orgframe-app/modules/forms/schema.ts:341:export function parseFormSchemaJson(
apps/orgframe-app/modules/forms/types.ts:109:export type FormSubmission = {
apps/orgframe-app/modules/forms/types.ts:11:export type FormFieldType = "text" | "textarea" | "email" | "phone" | "number" | "date" | "select" | "checkbox";
apps/orgframe-app/modules/forms/types.ts:126:export type FormSubmissionEntry = {
apps/orgframe-app/modules/forms/types.ts:135:export type FormSubmissionWithEntries = FormSubmission & {
apps/orgframe-app/modules/forms/types.ts:139:export type ProgramRegistration = {
apps/orgframe-app/modules/forms/types.ts:13:export type FormPageKey = "generic_custom" | "generic_success" | "registration_player" | "registration_division_questions" | "registration_payment" | "registration_success";
apps/orgframe-app/modules/forms/types.ts:151:export type RegistrationPlayerEntryInput = {
apps/orgframe-app/modules/forms/types.ts:157:export type FormSubmissionViewVisibilityScope = "private" | "forms_readers" | "specific_admin";
apps/orgframe-app/modules/forms/types.ts:159:export type FormSubmissionViewFilterLogic = "all" | "any";
apps/orgframe-app/modules/forms/types.ts:15:export const REGISTRATION_PAGE_KEYS = {
apps/orgframe-app/modules/forms/types.ts:161:export type FormSubmissionViewFilterOperator =
apps/orgframe-app/modules/forms/types.ts:175:export type FormSubmissionViewFilterRule = {
apps/orgframe-app/modules/forms/types.ts:182:export type FormSubmissionViewFilters = {
apps/orgframe-app/modules/forms/types.ts:187:export type FormSubmissionViewSummaryMetricKey =
apps/orgframe-app/modules/forms/types.ts:197:export type FormSubmissionViewSummaryCard = {
apps/orgframe-app/modules/forms/types.ts:203:export type FormSubmissionViewConfig = {
apps/orgframe-app/modules/forms/types.ts:218:export type OrgFormSubmissionView = {
apps/orgframe-app/modules/forms/types.ts:22:export const REGISTRATION_PAGE_ORDER = [
apps/orgframe-app/modules/forms/types.ts:232:export type FormGoogleSheetIntegrationStatus = "active" | "disabled" | "error";
apps/orgframe-app/modules/forms/types.ts:234:export type OrgFormGoogleSheetIntegration = {
apps/orgframe-app/modules/forms/types.ts:248:export type OrgFormGoogleSheetSyncRunStatus = "running" | "ok" | "failed" | "partial";
apps/orgframe-app/modules/forms/types.ts:250:export type OrgFormGoogleSheetSyncRun = {
apps/orgframe-app/modules/forms/types.ts:29:export type FormFieldOption = {
apps/orgframe-app/modules/forms/types.ts:34:export type FormField = {
apps/orgframe-app/modules/forms/types.ts:3:export type FormStatus = "draft" | "published" | "archived";
apps/orgframe-app/modules/forms/types.ts:47:export type FormPage = {
apps/orgframe-app/modules/forms/types.ts:58:export type FormRuleOperator = "equals" | "not_equals" | "is_true" | "is_false";
apps/orgframe-app/modules/forms/types.ts:5:export type FormKind = "generic" | "program_registration";
apps/orgframe-app/modules/forms/types.ts:60:export type FormRuleEffect = "show" | "require";
apps/orgframe-app/modules/forms/types.ts:62:export type FormRule = {
apps/orgframe-app/modules/forms/types.ts:71:export type FormSchema = {
apps/orgframe-app/modules/forms/types.ts:79:export type OrgForm = {
apps/orgframe-app/modules/forms/types.ts:7:export type TargetMode = "locked" | "choice";
apps/orgframe-app/modules/forms/types.ts:98:export type OrgFormVersion = {
apps/orgframe-app/modules/forms/types.ts:9:export type SubmissionStatus = "submitted" | "in_review" | "approved" | "rejected" | "waitlisted" | "cancelled";

--- access ---
apps/orgframe-app/modules/access/actions.ts:71:export type AccessMember = {
apps/orgframe-app/modules/access/actions.ts:82:export type AccessRoleDefinition = {
apps/orgframe-app/modules/access/actions.ts:91:export type AccountsAccessPageData = {

--- orders ---
apps/orgframe-app/modules/orders/OrderPanelProvider.tsx:12:export const OrderPanelContext = createContext<OrderPanelContextValue | null>(null);
apps/orgframe-app/modules/orders/OrderPanelProvider.tsx:25:export function OrderPanelProvider({ children }: { children: React.ReactNode }) {
apps/orgframe-app/modules/orders/index.ts:1:export { OrderPanelProvider } from "@/modules/orders/OrderPanelProvider";
apps/orgframe-app/modules/orders/index.ts:2:export { useOrderPanel } from "@/modules/orders/useOrderPanel";
apps/orgframe-app/modules/orders/index.ts:3:export type { OrderPanelOpenInput, OrderPanelContextValue } from "@/modules/orders/types";
apps/orgframe-app/modules/orders/types.ts:1:export type OrderPanelOpenInput = {
apps/orgframe-app/modules/orders/types.ts:23:export type OrderPanelItem = {
apps/orgframe-app/modules/orders/types.ts:36:export type OrderPanelPayment = {
apps/orgframe-app/modules/orders/types.ts:47:export type OrderPanelData = {
apps/orgframe-app/modules/orders/types.ts:53:export type OrderPanelResult =
apps/orgframe-app/modules/orders/types.ts:63:export type OrderPanelContextValue = {
apps/orgframe-app/modules/orders/types.ts:7:export type OrderPanelOrder = {
apps/orgframe-app/modules/orders/useOrderPanel.ts:6:export function useOrderPanel() {

--- players ---
apps/orgframe-app/modules/players/actions.ts:42:export type PlayersActionResult<TData = undefined> =
apps/orgframe-app/modules/players/types.ts:16:export type PlayerGuardian = {
apps/orgframe-app/modules/players/types.ts:1:export type PlayerProfile = {
apps/orgframe-app/modules/players/types.ts:25:export type PlayerPickerItem = {

--- programs ---
apps/orgframe-app/modules/programs/actions.ts:135:export type ProgramsActionResult<TData = undefined> =
apps/orgframe-app/modules/programs/public/actions.ts:16:export type ProgramSubnavContext = {
apps/orgframe-app/modules/programs/public/actions.ts:34:export type ProgramSubnavActionResult =
apps/orgframe-app/modules/programs/schedule/rule-engine.ts:209:export function generateOccurrencesForRule(rule: ProgramScheduleRule, options?: { nowDate?: Date; horizonMonths?: number }): GeneratedOccurrenceInput[] {
apps/orgframe-app/modules/programs/schedule/rule-engine.ts:3:export const DEFAULT_SCHEDULE_HORIZON_MONTHS = 18;
apps/orgframe-app/modules/programs/schedule/rule-engine.ts:5:export type GeneratedOccurrenceInput = Pick<
apps/orgframe-app/modules/programs/schedule/rule-engine.ts:87:export function zonedLocalToUtc(localDate: string, localTime: string, timeZone: string): Date {
apps/orgframe-app/modules/programs/schedule/schedule-summary.ts:21:export function buildScheduleRuleSummary(rule: ProgramScheduleRule): string {
apps/orgframe-app/modules/programs/teams/actions.ts:29:export type TeamsActionResult<TData = undefined> =
apps/orgframe-app/modules/programs/teams/types.ts:10:export type ProgramTeamStaffDetail = ProgramTeamStaff & {
apps/orgframe-app/modules/programs/teams/types.ts:14:export type ProgramTeamRosterCandidate = {
apps/orgframe-app/modules/programs/teams/types.ts:22:export type ProgramTeamStaffCandidate = {
apps/orgframe-app/modules/programs/teams/types.ts:28:export type ProgramTeamFacilityOption = {
apps/orgframe-app/modules/programs/teams/types.ts:34:export type ProgramTeamDetail = {
apps/orgframe-app/modules/programs/teams/types.ts:4:export type ProgramTeamMemberDetail = ProgramTeamMember & {
apps/orgframe-app/modules/programs/types.ts:10:export type ProgramScheduleEndMode = "never" | "until_date" | "after_occurrences";
apps/orgframe-app/modules/programs/types.ts:117:export type ProgramOccurrence = {
apps/orgframe-app/modules/programs/types.ts:11:export type ProgramOccurrenceSourceType = "rule" | "manual" | "override";
apps/orgframe-app/modules/programs/types.ts:12:export type ProgramOccurrenceStatus = "scheduled" | "cancelled";
apps/orgframe-app/modules/programs/types.ts:137:export type ProgramScheduleException = {
apps/orgframe-app/modules/programs/types.ts:13:export type ProgramScheduleExceptionKind = "skip" | "override";
apps/orgframe-app/modules/programs/types.ts:149:export type ProgramTeamStatus = "active" | "archived";
apps/orgframe-app/modules/programs/types.ts:150:export type ProgramTeamMemberStatus = "active" | "pending" | "waitlisted" | "removed";
apps/orgframe-app/modules/programs/types.ts:151:export type ProgramTeamMemberRole = "player" | "alternate" | "guest";
apps/orgframe-app/modules/programs/types.ts:152:export type ProgramTeamStaffRole = "head_coach" | "assistant_coach" | "manager" | "trainer" | "volunteer";
apps/orgframe-app/modules/programs/types.ts:154:export type ProgramTeam = {
apps/orgframe-app/modules/programs/types.ts:15:export type Program = {
apps/orgframe-app/modules/programs/types.ts:173:export type ProgramTeamMember = {
apps/orgframe-app/modules/programs/types.ts:190:export type ProgramTeamStaff = {
apps/orgframe-app/modules/programs/types.ts:1:export type ProgramType = "league" | "season" | "clinic" | "custom";
apps/orgframe-app/modules/programs/types.ts:203:export type ProgramTeamSummary = {
apps/orgframe-app/modules/programs/types.ts:215:export type ProgramTeamDirectoryItem = {
apps/orgframe-app/modules/programs/types.ts:34:export type ProgramNode = {
apps/orgframe-app/modules/programs/types.ts:3:export type ProgramStatus = "draft" | "published" | "archived";
apps/orgframe-app/modules/programs/types.ts:49:export type ProgramScheduleBlock = {
apps/orgframe-app/modules/programs/types.ts:5:export type ProgramNodeKind = "division" | "team";
apps/orgframe-app/modules/programs/types.ts:68:export type ProgramCatalogItem = {
apps/orgframe-app/modules/programs/types.ts:7:export type ProgramScheduleBlockType = "date_range" | "meeting_pattern" | "one_off";
apps/orgframe-app/modules/programs/types.ts:85:export type ProgramWithDetails = {
apps/orgframe-app/modules/programs/types.ts:8:export type ProgramScheduleMode = "single_date" | "multiple_specific_dates" | "repeating_pattern" | "continuous_date_range" | "custom_advanced";
apps/orgframe-app/modules/programs/types.ts:91:export type ProgramScheduleRule = {
apps/orgframe-app/modules/programs/types.ts:9:export type ProgramScheduleIntervalUnit = "day" | "week" | "month";
apps/orgframe-app/modules/programs/utils.ts:3:export function isProgramNodePublished(node: Pick<ProgramNode, "settingsJson">): boolean {

--- site-builder ---
apps/orgframe-app/modules/site-builder/actions.ts:116:export type SaveOrgPageInput = {
apps/orgframe-app/modules/site-builder/actions.ts:124:export type SaveOrgPageResult =
apps/orgframe-app/modules/site-builder/actions.ts:47:export type LoadOrgPageInput = {
apps/orgframe-app/modules/site-builder/actions.ts:52:export type LoadOrgPageResult =
apps/orgframe-app/modules/site-builder/actions.ts:688:export type SaveOrgPagesActionResult =
apps/orgframe-app/modules/site-builder/blocks/announcement-highlight.tsx:24:export function createDefaultAnnouncementHighlightConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/announcement-highlight.tsx:28:export function sanitizeAnnouncementHighlightConfig(config: unknown, context: BlockContext): AnnouncementHighlightBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/announcement-highlight.tsx:47:export function AnnouncementHighlightBlockRender({ block }: BlockRenderProps<"announcement_highlight">) {
apps/orgframe-app/modules/site-builder/blocks/announcement-highlight.tsx:68:export function AnnouncementHighlightBlockEditor({ block, onChange }: BlockEditorProps<"announcement_highlight">) {
apps/orgframe-app/modules/site-builder/blocks/contact-info.tsx:19:export function createDefaultContactInfoConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/contact-info.tsx:23:export function sanitizeContactInfoConfig(config: unknown, context: BlockContext): ContactInfoBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/contact-info.tsx:35:export function ContactInfoBlockRender({ block }: BlockRenderProps<"contact_info">) {
apps/orgframe-app/modules/site-builder/blocks/contact-info.tsx:60:export function ContactInfoBlockEditor({ block, onChange }: BlockEditorProps<"contact_info">) {
apps/orgframe-app/modules/site-builder/blocks/cta-card-editor.client.tsx:13:export function CtaCardBlockEditorClient({ block, onChange, context }: BlockEditorProps<"cta_card">) {
apps/orgframe-app/modules/site-builder/blocks/cta-card.tsx:108:export const CtaCardBlockEditor = CtaCardBlockEditorClient;
apps/orgframe-app/modules/site-builder/blocks/cta-card.tsx:33:export function createDefaultCtaCardConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/cta-card.tsx:37:export function sanitizeCtaCardConfig(config: unknown, context: BlockContext): CtaCardBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/cta-card.tsx:65:export function CtaCardBlockRender({ block, context }: BlockRenderProps<"cta_card">) {
apps/orgframe-app/modules/site-builder/blocks/cta-grid-repeater.tsx:19:export function CtaGridRepeater({ items }: CtaGridRepeaterProps) {
apps/orgframe-app/modules/site-builder/blocks/cta-grid.tsx:33:export function createDefaultCtaGridConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/cta-grid.tsx:37:export function sanitizeCtaGridConfig(config: unknown, context: BlockContext): CtaGridBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/cta-grid.tsx:51:export function CtaGridBlockRender({ block, context }: BlockRenderProps<"cta_grid">) {
apps/orgframe-app/modules/site-builder/blocks/cta-grid.tsx:68:export function CtaGridBlockEditor({ block, context, onChange }: BlockEditorProps<"cta_grid">) {
apps/orgframe-app/modules/site-builder/blocks/document-links.tsx:24:export function createDefaultDocumentLinksConfig(_context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/document-links.tsx:28:export function sanitizeDocumentLinksConfig(config: unknown, _context: BlockContext): DocumentLinksBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/document-links.tsx:47:export function DocumentLinksBlockRender({ block }: BlockRenderProps<"document_links">) {
apps/orgframe-app/modules/site-builder/blocks/document-links.tsx:70:export function DocumentLinksBlockEditor({ block, onChange }: BlockEditorProps<"document_links">) {
apps/orgframe-app/modules/site-builder/blocks/events-list-repeater.tsx:19:export function EventsListRepeater({ items }: EventsListRepeaterProps) {
apps/orgframe-app/modules/site-builder/blocks/events.tsx:158:export function EventsBlockRender({ block, context, runtimeData }: BlockRenderProps<"events">) {
apps/orgframe-app/modules/site-builder/blocks/events.tsx:212:export function EventsBlockEditor({ block, onChange, context }: BlockEditorProps<"events">) {
apps/orgframe-app/modules/site-builder/blocks/events.tsx:37:export function createDefaultEventsConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/events.tsx:53:export function sanitizeEventsConfig(config: unknown, context: BlockContext): EventsBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/facility-availability-calendar.tsx:167:export function FacilityAvailabilityCalendarBlockEditor({
apps/orgframe-app/modules/site-builder/blocks/facility-availability-calendar.tsx:27:export function createDefaultFacilityAvailabilityCalendarConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/facility-availability-calendar.tsx:39:export function sanitizeFacilityAvailabilityCalendarConfig(
apps/orgframe-app/modules/site-builder/blocks/facility-availability-calendar.tsx:82:export function FacilityAvailabilityCalendarBlockRender({
apps/orgframe-app/modules/site-builder/blocks/facility-space-list-repeater.tsx:19:export function FacilitySpaceListRepeater({ items }: FacilitySpaceListRepeaterProps) {
apps/orgframe-app/modules/site-builder/blocks/facility-space-list.tsx:135:export function FacilitySpaceListBlockEditor({ block, onChange }: BlockEditorProps<"facility_space_list">) {
apps/orgframe-app/modules/site-builder/blocks/facility-space-list.tsx:27:export function createDefaultFacilitySpaceListConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/facility-space-list.tsx:31:export function sanitizeFacilitySpaceListConfig(config: unknown, context: BlockContext): FacilitySpaceListBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/facility-space-list.tsx:88:export function FacilitySpaceListBlockRender({ block, runtimeData }: BlockRenderProps<"facility_space_list">) {
apps/orgframe-app/modules/site-builder/blocks/form-embed.tsx:20:export function createDefaultFormEmbedConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/form-embed.tsx:24:export function sanitizeFormEmbedConfig(config: unknown, context: BlockContext): FormEmbedBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/form-embed.tsx:44:export function FormEmbedBlockRender({ block, context, runtimeData, isEditing }: BlockRenderProps<"form_embed">) {
apps/orgframe-app/modules/site-builder/blocks/form-embed.tsx:85:export function FormEmbedBlockEditor({ block, onChange, runtimeData }: BlockEditorProps<"form_embed">) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:117:export function asOptionalButton(value: unknown): SiteButton | null {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:132:export function sanitizePageSlug(value: string) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:150:export function isReservedPageSlug(slug: string) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:154:export function defaultPageTitleFromSlug(slug: string) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:17:export function asText(value: unknown, fallback: string, maxLength: number) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:30:export function asBody(value: unknown, fallback: string, maxLength = 1500) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:43:export function asOptionalStoragePath(value: unknown) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:56:export function asNumber(value: unknown, fallback: number, min: number, max: number) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:5:export function createId() {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:70:export function asCtaItems(value: unknown, fallback: CtaGridItem[]) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:91:export function asLinkObject(value: unknown, fallback: LinkValue) {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:95:export function asButtonVariantValue(value: unknown, fallback: ButtonVariant = "primary") {
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:99:export function asButtons(
apps/orgframe-app/modules/site-builder/blocks/helpers.ts:9:export function asObject(value: unknown): Record<string, unknown> {
apps/orgframe-app/modules/site-builder/blocks/hero-editor.client.tsx:12:export function HeroBlockEditorClient({ block, context, onChange }: BlockEditorProps<"hero">) {
apps/orgframe-app/modules/site-builder/blocks/hero.tsx:36:export function sanitizeHeroConfig(config: unknown, context: BlockContext): HeroBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/hero.tsx:69:export function createDefaultHeroConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/hero.tsx:73:export function HeroBlockRender({ block, context }: BlockRenderProps<"hero">) {
apps/orgframe-app/modules/site-builder/blocks/program-catalog-repeater.tsx:19:export function ProgramCatalogRepeater({ items }: ProgramCatalogRepeaterProps) {
apps/orgframe-app/modules/site-builder/blocks/program-catalog.tsx:122:export function ProgramCatalogBlockEditor({ block, onChange, context }: BlockEditorProps<"program_catalog">) {
apps/orgframe-app/modules/site-builder/blocks/program-catalog.tsx:32:export function createDefaultProgramCatalogConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/program-catalog.tsx:36:export function sanitizeProgramCatalogConfig(config: unknown, context: BlockContext): ProgramCatalogBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/program-catalog.tsx:74:export function ProgramCatalogBlockRender({ block, context, runtimeData }: BlockRenderProps<"program_catalog">) {
apps/orgframe-app/modules/site-builder/blocks/read-more-description.client.tsx:11:export function ReadMoreDescription({ children }: ReadMoreDescriptionProps) {
apps/orgframe-app/modules/site-builder/blocks/registry.ts:178:export function isOrgSiteBlockType(value: string): value is OrgSiteBlockType {
apps/orgframe-app/modules/site-builder/blocks/registry.ts:182:export function getBlockDefinition<TType extends OrgSiteBlockType>(type: TType): BlockDefinition<TType> {
apps/orgframe-app/modules/site-builder/blocks/registry.ts:186:export function listBlockDefinitions() {
apps/orgframe-app/modules/site-builder/blocks/registry.ts:190:export function createDefaultBlock<TType extends OrgSiteBlockType>(type: TType, context: BlockContext, id = createId()): OrgPageBlock<TType> {
apps/orgframe-app/modules/site-builder/blocks/registry.ts:200:export function createDefaultBlocksForPage(pageSlug: string, context: BlockContext): OrgPageBlock[] {
apps/orgframe-app/modules/site-builder/blocks/registry.ts:230:export function normalizeDraftBlocks(blocks: DraftBlockInput[], context: BlockContext): OrgPageBlock[] {
apps/orgframe-app/modules/site-builder/blocks/registry.ts:242:export function normalizeRowBlocks(
apps/orgframe-app/modules/site-builder/blocks/rich-text.ts:1:export function sanitizeRichTextHtml(value: unknown, fallback = ""): string {
apps/orgframe-app/modules/site-builder/blocks/runtime-registry.ts:145:export function getRuntimeBlockDefinition<TType extends OrgSiteBlockType>(type: TType): RuntimeBlockDefinition<TType> {
apps/orgframe-app/modules/site-builder/blocks/runtime-registry.ts:149:export function createDefaultRuntimeBlock<TType extends OrgSiteBlockType>(type: TType, context: BlockContext, id = createId()): OrgPageBlock<TType> {
apps/orgframe-app/modules/site-builder/blocks/schedule-preview.tsx:26:export function createDefaultSchedulePreviewConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/schedule-preview.tsx:30:export function sanitizeSchedulePreviewConfig(config: unknown, context: BlockContext): SchedulePreviewBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/schedule-preview.tsx:53:export function SchedulePreviewBlockRender({ block, context }: BlockRenderProps<"schedule_preview">) {
apps/orgframe-app/modules/site-builder/blocks/schedule-preview.tsx:82:export function SchedulePreviewBlockEditor({ block, onChange, context }: BlockEditorProps<"schedule_preview">) {
apps/orgframe-app/modules/site-builder/blocks/stats-metrics.tsx:19:export function createDefaultStatsMetricsConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/stats-metrics.tsx:23:export function sanitizeStatsMetricsConfig(config: unknown, context: BlockContext): StatsMetricsBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/stats-metrics.tsx:42:export function StatsMetricsBlockRender({ block }: BlockRenderProps<"stats_metrics">) {
apps/orgframe-app/modules/site-builder/blocks/stats-metrics.tsx:61:export function StatsMetricsBlockEditor({ block, onChange }: BlockEditorProps<"stats_metrics">) {
apps/orgframe-app/modules/site-builder/blocks/subhero-editor.client.tsx:9:export function SubheroBlockEditorClient({ block, context, onChange }: BlockEditorProps<"subhero">) {
apps/orgframe-app/modules/site-builder/blocks/subhero.tsx:23:export function sanitizeSubheroConfig(config: unknown, context: BlockContext): SubheroBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/subhero.tsx:34:export function createDefaultSubheroConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/subhero.tsx:38:export function SubheroBlockRender({ block, context }: BlockRenderProps<"subhero">) {
apps/orgframe-app/modules/site-builder/blocks/teams-directory-repeater.tsx:30:export function TeamsDirectoryRepeater({ items }: TeamsDirectoryRepeaterProps) {
apps/orgframe-app/modules/site-builder/blocks/teams-directory.tsx:23:export function createDefaultTeamsDirectoryConfig(context: BlockContext) {
apps/orgframe-app/modules/site-builder/blocks/teams-directory.tsx:27:export function sanitizeTeamsDirectoryConfig(config: unknown, context: BlockContext): TeamsDirectoryBlockConfig {
apps/orgframe-app/modules/site-builder/blocks/teams-directory.tsx:50:export function TeamsDirectoryBlockRender({ block, context, runtimeData }: BlockRenderProps<"teams_directory">) {
apps/orgframe-app/modules/site-builder/blocks/teams-directory.tsx:89:export function TeamsDirectoryBlockEditor({ block, onChange }: BlockEditorProps<"teams_directory">) {
apps/orgframe-app/modules/site-builder/events.ts:1:export const ORG_SITE_OPEN_EDITOR_EVENT = "org-site:open-editor";
apps/orgframe-app/modules/site-builder/events.ts:2:export const ORG_SITE_OPEN_EDITOR_REQUEST_KEY = "org-site:open-editor-request";
apps/orgframe-app/modules/site-builder/events.ts:3:export const ORG_SITE_EDITOR_STATE_EVENT = "org-site:editor-state";
apps/orgframe-app/modules/site-builder/events.ts:4:export const ORG_SITE_SET_EDITOR_EVENT = "org-site:set-editor";
apps/orgframe-app/modules/site-builder/hooks/useOrgLinkPickerPages.ts:9:export function useOrgLinkPickerPages(orgSlug: string | null | undefined) {
apps/orgframe-app/modules/site-builder/hooks/useUnsavedChangesWarning.ts:11:export function useUnsavedChangesWarning({
apps/orgframe-app/modules/site-builder/storage.ts:8:export function getOrgSiteAssetPublicUrl(path: string | null) {
apps/orgframe-app/modules/site-builder/types.ts:102:export type ContactInfoBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:10:export type OrgSiteBlockType =
apps/orgframe-app/modules/site-builder/types.ts:110:export type SchedulePreviewBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:116:export type ProgramCatalogBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:125:export type EventsBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:136:export type FormEmbedBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:142:export type FacilityAvailabilityCalendarBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:150:export type FacilitySpaceListBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:159:export type TeamsDirectoryBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:169:export type OrgSiteBlockConfigMap = {
apps/orgframe-app/modules/site-builder/types.ts:187:export type OrgPageBlock<TType extends OrgSiteBlockType = OrgSiteBlockType> = {
apps/orgframe-app/modules/site-builder/types.ts:193:export type OrgSitePage = {
apps/orgframe-app/modules/site-builder/types.ts:207:export type OrgManagePage = {
apps/orgframe-app/modules/site-builder/types.ts:220:export type OrgNavLinkType = "none" | "internal" | "external";
apps/orgframe-app/modules/site-builder/types.ts:222:export type OrgNavItem = {
apps/orgframe-app/modules/site-builder/types.ts:237:export type OrgSiteStructureNodeKind = "static_page" | "static_link" | "dynamic_page" | "dynamic_link" | "system_generated";
apps/orgframe-app/modules/site-builder/types.ts:239:export type OrgSiteStructureSourceType = "none" | "programs_tree" | "published_forms" | "published_events";
apps/orgframe-app/modules/site-builder/types.ts:241:export type OrgSiteStructureChildBehavior = "manual" | "generated_locked" | "generated_with_manual_overrides";
apps/orgframe-app/modules/site-builder/types.ts:243:export type OrgSiteStructureLabelBehavior = "manual" | "source_name";
apps/orgframe-app/modules/site-builder/types.ts:245:export type OrgSiteStructurePageLifecycle = "permanent" | "temporary";
apps/orgframe-app/modules/site-builder/types.ts:247:export type OrgSiteStructureNode = {
apps/orgframe-app/modules/site-builder/types.ts:272:export type ResolvedOrgSiteStructureNode = {
apps/orgframe-app/modules/site-builder/types.ts:27:export type HeroBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:293:export type OrgSitePageWithBlocks = {
apps/orgframe-app/modules/site-builder/types.ts:298:export type BlockContext = {
apps/orgframe-app/modules/site-builder/types.ts:304:export type OrgSiteRuntimeData = {
apps/orgframe-app/modules/site-builder/types.ts:346:export type BlockRenderProps<TType extends OrgSiteBlockType> = {
apps/orgframe-app/modules/site-builder/types.ts:353:export type BlockEditorProps<TType extends OrgSiteBlockType> = {
apps/orgframe-app/modules/site-builder/types.ts:360:export type DraftBlockInput = {
apps/orgframe-app/modules/site-builder/types.ts:366:export type BlockDefinition<TType extends OrgSiteBlockType> = {
apps/orgframe-app/modules/site-builder/types.ts:37:export type SubheroBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:43:export type CtaGridItem = {
apps/orgframe-app/modules/site-builder/types.ts:50:export type CtaGridBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:55:export type CtaCardBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:66:export type AnnouncementHighlightItem = {
apps/orgframe-app/modules/site-builder/types.ts:73:export type AnnouncementHighlightBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:78:export type StatsMetricsItem = {
apps/orgframe-app/modules/site-builder/types.ts:85:export type StatsMetricsBlockConfig = {
apps/orgframe-app/modules/site-builder/types.ts:90:export type DocumentLinksItem = {
apps/orgframe-app/modules/site-builder/types.ts:97:export type DocumentLinksBlockConfig = {

--- sportsconnect ---
apps/orgframe-app/modules/sportsconnect/components/SportsConnectImportWorkspace.tsx:220:export function SportsConnectImportWorkspace({ orgSlug, initialRuns }: SportsConnectImportWorkspaceProps) {
apps/orgframe-app/modules/sportsconnect/parser.ts:145:export function parseSportsConnectDateTime(value: string): {
apps/orgframe-app/modules/sportsconnect/parser.ts:458:export function parseSportsConnectCsv(input: string): {
apps/orgframe-app/modules/sportsconnect/types.ts:100:export type SportsConnectParseIssueCode =
apps/orgframe-app/modules/sportsconnect/types.ts:107:export type SportsConnectParseIssue = {
apps/orgframe-app/modules/sportsconnect/types.ts:113:export type SportsConnectParsedRow = {
apps/orgframe-app/modules/sportsconnect/types.ts:122:export type SportsConnectMappingKind = "program" | "division" | "team";
apps/orgframe-app/modules/sportsconnect/types.ts:123:export type SportsConnectMappingMode = "create" | "existing";
apps/orgframe-app/modules/sportsconnect/types.ts:125:export type SportsConnectMappingCandidate = {
apps/orgframe-app/modules/sportsconnect/types.ts:131:export type SportsConnectMappingRequirement = {
apps/orgframe-app/modules/sportsconnect/types.ts:143:export type SportsConnectDryRunSummary = {
apps/orgframe-app/modules/sportsconnect/types.ts:154:export type SportsConnectRunHistoryItem = {
apps/orgframe-app/modules/sportsconnect/types.ts:165:export type SportsConnectProjectedPlayer = {
apps/orgframe-app/modules/sportsconnect/types.ts:173:export type SportsConnectProjectedTeam = {
apps/orgframe-app/modules/sportsconnect/types.ts:179:export type SportsConnectProjectedDivision = {
apps/orgframe-app/modules/sportsconnect/types.ts:186:export type SportsConnectProjectedProgram = {
apps/orgframe-app/modules/sportsconnect/types.ts:192:export type SportsConnectRunProjection = {
apps/orgframe-app/modules/sportsconnect/types.ts:1:export const SPORTS_CONNECT_REQUIRED_HEADERS = [
apps/orgframe-app/modules/sportsconnect/types.ts:218:export type SportsConnectDryRunResult = {
apps/orgframe-app/modules/sportsconnect/types.ts:230:export type SportsConnectResolveMappingResult = {
apps/orgframe-app/modules/sportsconnect/types.ts:237:export type SportsConnectCommitSummary = {
apps/orgframe-app/modules/sportsconnect/types.ts:24:export type SportsConnectRawRow = Record<string, string>;
apps/orgframe-app/modules/sportsconnect/types.ts:260:export type SportsConnectCommitResult = {
apps/orgframe-app/modules/sportsconnect/types.ts:26:export type SportsConnectNormalizedRow = {
apps/orgframe-app/modules/sportsconnect/types.ts:280:export type SportsConnectActivationLookup = {
apps/orgframe-app/modules/sportsconnect/types.ts:285:export type SportsConnectActivationSendResult = {
apps/orgframe-app/modules/sportsconnect/types.ts:9:export const SPORTS_CONNECT_SENSITIVE_HEADERS = [

--- uploads ---
apps/orgframe-app/modules/uploads/ImagePositionDialog.tsx:63:export function ImagePositionDialog({
apps/orgframe-app/modules/uploads/UploadDialog.tsx:31:export function UploadDialog({
apps/orgframe-app/modules/uploads/UploadProvider.tsx:105:export function UploadProvider({ children }: { children: React.ReactNode }) {
apps/orgframe-app/modules/uploads/UploadProvider.tsx:12:export const UploaderContext = createContext<UploaderContextValue | null>(null);
apps/orgframe-app/modules/uploads/client-utils.ts:38:export function fileMatchesAccept(file: File, accept: string | undefined) {
apps/orgframe-app/modules/uploads/client-utils.ts:55:export function isImageFile(file: File) {
apps/orgframe-app/modules/uploads/client-utils.ts:64:export function formatFileSize(bytes: number) {
apps/orgframe-app/modules/uploads/client-utils.ts:76:export function defaultUploadCrop(initial?: UploadCrop): UploadCrop {
apps/orgframe-app/modules/uploads/config.ts:15:export const uploadPurposeConfigByPurpose: Record<UploadPurpose, UploadPurposeConfig> = {
apps/orgframe-app/modules/uploads/config.ts:4:export type UploadPurposeConfig = {
apps/orgframe-app/modules/uploads/index.ts:1:export { UploadProvider } from "@/modules/uploads/UploadProvider";
apps/orgframe-app/modules/uploads/index.ts:2:export { useUploader } from "@/modules/uploads/useUploader";
apps/orgframe-app/modules/uploads/index.ts:3:export type {
apps/orgframe-app/modules/uploads/server.ts:102:export function fileMatchesAcceptConstraint(file: File, accept: string | undefined) {
apps/orgframe-app/modules/uploads/server.ts:119:export function buildOrgStoragePath(orgId: string, purpose: string, extension: string) {
apps/orgframe-app/modules/uploads/server.ts:123:export function buildUserStoragePath(userId: string, purpose: string, extension: string) {
apps/orgframe-app/modules/uploads/server.ts:46:export function mbToBytes(sizeMb: number) {
apps/orgframe-app/modules/uploads/server.ts:50:export function resolveMaxSizeMb(defaultMaxSizeMb: number, requestedMaxSizeMb: number | undefined) {
apps/orgframe-app/modules/uploads/server.ts:58:export function resolveFileExtension(file: File, allowedExtensions: string[]) {
apps/orgframe-app/modules/uploads/types.ts:11:export type UploadConstraints = {
apps/orgframe-app/modules/uploads/types.ts:22:export type UploadKind = "org" | "account" | "public-org";
apps/orgframe-app/modules/uploads/types.ts:24:export type UploadPurpose =
apps/orgframe-app/modules/uploads/types.ts:34:export type OpenUploadOptions = {
apps/orgframe-app/modules/uploads/types.ts:3:export type UploadAspectMode = "wide" | "square" | "free" | number;
apps/orgframe-app/modules/uploads/types.ts:46:export type UploadedAsset = {
apps/orgframe-app/modules/uploads/types.ts:59:export type CommitUploadRequest = {
apps/orgframe-app/modules/uploads/types.ts:5:export type UploadCrop = {
apps/orgframe-app/modules/uploads/types.ts:69:export type CommitUploadResult =
apps/orgframe-app/modules/uploads/useUploader.ts:6:export function useUploader() {

```

## Appendix G: Migration File List
```text
202602110001_platform_foundation.sql
202602110010_org_branding.sql
202602110020_account_profiles.sql
202602120002_remove_org_brand_secondary.sql
202602150001_org_pages_builder.sql
202602160001_custom_roles_permissions.sql
202602170003_org_nav_items.sql
202602170004_org_pages_management.sql
202602170005_governing_bodies.sql
202602170006_governing_body_assets_bucket.sql
202602170007_governing_body_logo_paths.sql
202602170008_org_assets_public_read.sql
202602180001_org_nav_items_visibility.sql
202602200001_org_creation_flow.sql
202602210001_spine_cleanup.sql
202602210002_fix_create_org_rpc_ambiguity.sql
202602220001_permissions_rebaseline.sql
202602220002_players_v1.sql
202602220003_programs_v1.sql
202602220004_forms_v1.sql
202602220005_registration_rpc.sql
202602220006_legacy_forms_final_cleanup.sql
202602220007_program_cover_photo.sql
202602230001_heic_upload_support.sql
202602240001_program_structure_nodes.sql
202602260001_program_schedule_v2.sql
202602280001_events_tool.sql
202602280002_form_guest_submissions.sql
202602280003_form_submission_views.sql
202602280004_form_submission_views_sort_index.sql
202603010001_ai_admin_actions.sql
202603010002_facilities_tool.sql
202603010003_form_submissions_google_sheets.sql
202603010004_org_custom_domains.sql
202603020001_facility_space_status_labels.sql
202603030001_program_teams.sql
202603030002_registration_team_sync.sql
202603030003_player_team_read_policy.sql
202603030004_unified_calendar_system.sql
202603030005_facility_floor_kind.sql
202603070001_spaces_platform.sql
202603080001_facilities_visual_reset.sql
202603090001_org_onboarding_fields.sql
202603090002_org_features.sql
202603100001_communications_inbox.sql
202603100002_form_submission_cap.sql
202603100003_communications_inbox_repair.sql
202603110001_inbox_channel_integrations.sql
202603120001_facilities_calendar_schema_repair.sql
202603140001_sportsconnect_import.sql
202603150001_calendar_facility_allocations_multi.sql
202603160001_calendar_lens_sources_and_saved_views.sql
202603170001_site_structure_canvas.sql
202603220001_file_manager.sql
202603220002_file_manager_backfill_fixes.sql
```
