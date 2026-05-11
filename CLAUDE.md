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

### UI Conventions

**No Cancel/Close buttons in panel/popup/modal footers.** Every `<Panel>`,
`<Popup>`, `<CreateModal>`, `<ContextPanel>`, and `<EditorSettingsDialog>`
already renders an X close button in the top-right via `SurfaceCloseButton`.
Footers contain only positive/destructive actions (Save, Create, Delete,
Next, Back). Cancellation is the X. This applies to every panel/popup the
app ships — no exceptions.

**Destructive entity actions go in the footer's leading slot, not the
body.** When a `<Panel>`, `<Popup>`, or `<CreateWizard>` edits a single
existing entity that can be deleted, archived, or otherwise destroyed,
the affordance is an **icon-only `<Button iconOnly>`** (the icon picks
the verb — `Trash2` for delete, `Archive` for archive, etc., colored
with `text-destructive`) rendered via the container's `footerLeading`
prop. `Panel`, `Popup`, and `CreateWizard` all expose `footerLeading`;
it sits on the **left side of the footer** opposite the primary Save.
Never render a "Danger zone" card, a `variant="danger"` text button, or
any inline `Delete X` / `Archive X` button in the step/panel body —
destructive actions live in the footer, the same canonical position
across every editing surface. Confirm before destroying (e.g.
`window.confirm` or `useConfirmDialog`). This rule does NOT apply to
list-row-level deletes (e.g. removing one row from a list rendered
inside a panel) or to bulk "Delete selected" toolbar actions — those
are scoped to the row/selection, not to the panel's entity.

Allowed Cancel exceptions: inline mode-toggles that aren't dismissing a
container — e.g., a "Cancel editing" button in a sticky page-edit toolbar,
or a "Cancel" inside a sub-form rendered in a popup body that returns the
popup to a list view. If in doubt, the rule is: a button that calls the
container's `onClose` does **not** belong in the footer.

**Panel z-index**: panels render *below* popups (z-1100 vs popup z-1200).
Opening a popup covers panels with the popup backdrop — clear modal
precedence and full panel height retained. Don't add panel-side logic
that re-measures height/position around open dialogs.

**Section action buttons**: render via `<SectionActions>` (slot-portaled
into the Section header) so every Section's actions sit in the same
canonical position regardless of which descendant component owns the
state. Never render a section's action button inline in the body.

**Person/account vocabulary**: account = login (auth identity);
person/people = registerable identity (the row in `people.profiles`).
Never use "profile" in user-facing copy when referring to the people
record — the database/code can keep the term, but UI copy should say
"person" / "people". `profile_links` and `ProfileWizardPanel` filenames
are internal.

**Entity-named panel titles**: when a panel edits a named entity
(person, role, team, space), the panel `title` prop is the entity's
name (e.g. "Koen Stewart"), not "Edit person". Subtitle holds the
type label if needed.

**Action buttons use `intent`**: `<Button intent="add" object="Player" />`
not hand-written `<Button><Plus />Add Player</Button>`. See
`packages/ui/CLAUDE.md` for the full intent catalog.

**Create and Edit share one wizard, not two**: when an entity has a
"Create X" wizard, the "Manage X" / "Edit X" flow must use the **same**
`CreateWizard` component with `mode="edit"` — same steps, same step
labels, same field renderers. Never build a separate Panel/form for
editing what a wizard creates. The wizard primitive natively supports
`mode: "create" | "edit"` (free step navigation, single Save button,
no draft persistence) — use it. This applies to roles, programs, forms,
spaces, and every other entity with a multi-step creation flow.

If the form has only one logical group of fields, use a `Panel` with a
single Save button instead — don't fake "steps" to justify a wizard.
The rule is "creating and editing the same entity look the same," not
"every form is a wizard."

**Repeater for any rendered list of items**: when you're rendering a
list of items with optional search/filtering — permissions in a role
wizard, members in a panel, sections in an editor — use `<Repeater>`
from `@orgframe/ui/primitives/repeater`. Don't hand-roll a `.map(...)`
over labeled `<div>` rows. Use `fixedView="list"` + `disableViewToggle`
when you don't want the grid/list toggle. The Repeater gives consistent
search, empty state, and row chrome across the app.

**Entity selection always uses `<Select multiple>`**: any "search a
list, pick one or more, see them as chips below" UI — people, teams,
programs, divisions, anything with an id + label — uses the existing
`<Select>` primitive (`@orgframe/ui/primitives/select`) with the
`multiple`, `values`, `onValuesChange` props. Multi-select forces
`searchable=true`, keeps the popover open after each toggle, and
renders selected items as chips beneath the field. Never hand-roll an
`Input + Popover + chip-list` pattern, and never wrap a custom
container inside a Popover — the listbox lives directly in the
Select's own popover.

Item richness lives on each `SelectOption`, not on a separate
component. For entity-style rows, supply `avatar: { name, src }` and
`subtext`; for plain dropdowns, keep using `label` / `chip` / `meta` /
`statusDot`. The same `<Select>` covers everything — there is no
separate `EntitySelect` / `EntityPicker` / `MultiSelect` primitive.

Exceptions for richer share-target pickers (type-filter chips + manual
free-text email + per-recipient permission) belong in
`UniversalSharePopup`; do not duplicate that chrome elsewhere — extend
it if you need similar behavior.

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
