# OrgFrame Monorepo Folder Architecture

Last updated: March 24, 2026

## Ownership Model

### 1) Workspace packages (`packages/*`)
Use packages only for cross-app building blocks.

- `packages/auth`: cross-app auth primitives only
  - session/user helpers
  - auth guards with app-provided redirect behavior
  - shared auth types
  - no app-specific route flows, onboarding, or org redirects
- `packages/ui`: reusable UI primitives/composites only
  - design-system components in `src/ui/*`
  - no product feature ownership
- `packages/theme`: shared token + Tailwind preset package used by both apps
  - keep only theme/tokens/preset/styles
- `packages/config`: optional workspace configuration package

### 2) App feature ownership (`apps/*/src/features/*`)
Product/domain code belongs to feature folders.

- `apps/orgframe-app/src/features/*` is the primary domain home
- `apps/orgframe-web/src/features/*` holds web-app feature logic when needed (for example auth wiring)
- feature folders own:
  - UI for that feature
  - server actions
  - feature DB queries
  - domain orchestration

### 3) App shared infrastructure (`apps/*/src/shared/*`)
`shared` is restricted to app-wide infrastructure that is not feature-owned.

Examples that can stay in shared:
- `domains/`
- `env/`
- `permissions/`
- `supabase/`
- app-wide org request context utilities

Examples that must not stay in shared:
- feature-specific hooks
- feature-specific integrations
- feature-specific UI composition
- auth helpers that belong in `packages/auth` + feature-level wiring

## Route Layer Rule

Keep route files thin. Route entrypoints should:
- read params/search params
- call feature/server helpers
- render feature components

Do not keep business logic in route files.

## Test Structure

All app tests are standardized to:
- `tests/unit/*`
- `tests/integration/*`
- `tests/e2e/*`

Feature grouping happens inside each test type folder.

## Naming Conventions

- Use `access` (not `manage-access`)
- Prefer domain terms over admin-area labels in folder names
- Avoid catch-all folder names like `shared` inside feature folders unless truly local and minimal

## Import Rules

- Feature code may import `@orgframe/ui/primitives/*`.
- Feature code may import `@orgframe/auth` primitives.
- `packages/ui` must not import app feature code.
- `packages/auth` must not import app code or app routes.

## Contribution Guardrails (Preventing Drift)

Before adding or moving code, apply this decision order:
1. Is it feature-specific? Put it in that feature.
2. Is it shared only within one app? Put it in that app's `src/shared`.
3. Is it stable and needed by both apps? Put it in a package.
4. Is it product UI/workflow? Keep it in app features, not `packages/ui`.

Hard bans:
- Do not reintroduce `packages/ui/src/features/*`.
- Do not duplicate generic auth helpers across apps and package.
- Do not add compatibility wrappers solely to preserve old paths.
