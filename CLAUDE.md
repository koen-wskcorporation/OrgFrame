# OrgFrame Development Guide

Multi-tenant sports org SaaS: Next.js 16 (App Router) + React 19 + TypeScript 5.8 + Supabase + Stripe Connect.

## Quick Start

```bash
npm install                    # one-time setup
npm run dev                    # dev:app + dev:web concurrently
npm run dev:app               # orgframe-app only
npm run typecheck:app         # find TS errors before CI
npm run lint:app              # run ESLint
npm run test:node             # run Node tests in tests/
```

## Monorepo Structure

```
apps/
  ├── orgframe-app             # Main SaaS product
  └── orgframe-web             # Marketing site

packages/
  ├── theme                    # Tailwind preset + design tokens
  ├── ui                       # React component primitives (CVA)
  └── auth                     # Auth utilities

supabase/
  ├── migrations/              # PostgreSQL migrations (timestamped)
  └── functions/               # Edge functions

tests/
  ├── unit/                    # Node.js test module tests
  └── e2e/                     # End-to-end tests
```

## Feature Modules (orgframe-app/src/features/)

Single-responsibility modules organized by business domain, NOT by technical layer.

**Core:** access (RBAC), ai (Ask/Act assistant), billing (Stripe Connect), calendar, communications (email/FB Messenger), core (layout), facilities, files, forms (builder + submissions), imports, orders, org-share, people, players, programs, site (page builder)

**Pattern:** Each module owns data fetching, server actions, UI components, and validation for its domain.

## Key Conventions

### Paths & Imports
- `@orgframe/ui/*` → React components from packages/ui
- `@orgframe/auth` → auth utilities
- `@/*` → orgframe-app source root (src/ prefix omitted)

### Database Access
- **Supabase RLS:** All public tables have row-level security policies
- **Context Injection:** `getOrgRequestContext()` provides org, user, and permissions in every request handler
- **JSONB Storage:** Flexible schemas in settingsJson, schemaJson, answersJson, metadataJson

### Naming
- **Org-scoped tables:** org_* prefix (org_member, org_form, org_page)
- **Routes:** `/[orgSlug]/` dynamic segment for multi-tenancy
- **Server Actions:** Named `action*()`, exported from feature module directories
- **Components:** PascalCase; prefer Server Components by default

### Styling
- Tailwind CSS via @orgframe/theme preset
- CVA for component variants
- CSS variables injected per-org for branding

## Architecture Highlights

### Multi-Tenancy
- Dynamic `[orgSlug]` routing; custom domain support via `x-forwarded-host`
- Supabase RLS for data isolation; `has_org_role()` function for permission checks
- CSS variables (`--accent-color`, etc.) applied at layout level per-org

### Request Handlers (Server Actions)
- 50MB request payload limit
- Chunked file uploads for large data
- Rate limiting on AI requests via `consumeAiRateLimit()`
- Error handling: custom error types (e.g., `MissingAiGatewayKeyError`)

### Caching & Revalidation
- Stale times: 5min (dynamic), 30min (static)
- `revalidatePath()` after mutations
- AI changesets: 30min TTL

### AI Assistant
- Modes: Ask (read-only), Act (execute changes)
- Phases: Plan → Confirm → Execute → Rollback
- Audit logging with full execution history
- Tool-based with pre-condition validation

### Payments
- Stripe Connect v21 for multi-tenant processing
- Connected accounts per org; tax profiles (nonprofit/for-profit)
- Payment links, webhooks, transaction tracking

## Common Patterns

### Fetching Data (Server Components)
```typescript
// Avoid passing org context manually; getOrgRequestContext() does this
const { orgId, user } = await getOrgRequestContext();
const data = await db.from('org_form').select('*').eq('org_id', orgId);
```

### Server Actions
```typescript
'use server';
import { getOrgRequestContext } from '@/shared/org';

export async function createForm(formData: FormData) {
  const { orgId, permissions } = await getOrgRequestContext();
  // Insert, return result, revalidatePath()
}
```

### Client Components
```typescript
'use client';
// Use sparingly; prefer Server Components + progressively enhanced forms
```

### Validation
- Zod schemas for runtime validation at API boundaries
- TypeScript for compile-time checking (strict mode enforced)

## When to Use Each Tool

| Task | Use |
|---|---|
| TypeScript errors, compile issues | `npm run typecheck:app` |
| Lint/style violations | `npm run lint:app` |
| Unit tests (Node.js) | `npm run test:node` |
| Feature exploration | Agent (Explore type) |
| Reading known files | Read tool directly |
| Searching code | Grep for symbols/patterns |
| File modifications | Edit for changes; Write for new files |

## Token Efficiency

- **CLAUDE.md first:** Load this before exploring
- **Specificity:** Point Claude to exact file:line numbers
- **Compact often:** `/compact focus on [feature]` to trim old context
- **Model switching:** Use Haiku for simple lint/format/test tasks
- **Worktree hygiene:** Each worktree = isolated session; don't bloat one
