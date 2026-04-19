# AGENTS.md

## Purpose and Scope

This file guides AI coding agents working in the OrgFrame monorepo.

Goals:

- Make safe, minimal, and reviewable changes.
- Use repo-verified commands only.
- Respect app boundaries in this workspace model.

This is agent-facing guidance, not end-user documentation.

## Repo Map

Top-level layout:

- `apps/orgframe-app`: Core product application (Next.js App Router).
- `apps/orgframe-web`: Marketing/landing website (Next.js).
- `packages/theme`: Shared design tokens and Tailwind preset.
- `packages/ui`: Shared React UI primitives.
- `docs`: Architecture and product documentation.
- `supabase`: Migrations and edge/serverless functions.
- `scripts`: Monorepo helper scripts (including dev launcher).

## Setup and Run Commands

Install dependencies from repo root:

```bash
npm install
```

Run apps from repo root:

```bash
npm run dev:app
npm run dev:web
```

Build apps from repo root:

```bash
npm run build:app
npm run build:web
```

## Validation Before Handoff

Run checks from repo root:

```bash
npm run lint:app
npm run lint:web
npm run typecheck:app
npm run typecheck:web
npm run test:node --workspace orgframe-app
```

Prefer running only checks relevant to touched surfaces first, then run broader checks before handoff when feasible.

## Safe-Change Guardrails

- Do not run destructive git commands (for example: `git reset --hard`, `git checkout -- <path>`).
- Never revert or clean unrelated user changes in a dirty worktree.
- Keep diffs scoped to the request; avoid opportunistic refactors.
- Prefer small, targeted edits over broad rewrites.
- Confirm paths and ownership before modifying shared packages.
- If a command fails because of local env/setup, report clearly and continue with the safest feasible validation.

## App-Specific Notes

`orgframe-app`:

- Multi-tenant product app with Supabase integration and org-scoped routing.
- Follow existing branching/deployment context in `apps/orgframe-app/README.md` (`main` prod, `develop` staging, feature branches merged into `develop`).
- Treat auth, redirects, and integration flows as environment-sensitive.

`orgframe-web`:

- Marketing site with separate deployment context.
- Keep changes isolated from product-app-only concerns unless explicitly requested.

Shared packages:

- Changes in `packages/theme` or `packages/ui` can affect both apps; verify both app surfaces where relevant.

## Environment and Secrets Rules

- Never commit secrets or key material.
- Prefer `.env*` conventions already documented in app READMEs.
- Treat Supabase, Stripe, Google OAuth, and AI gateway credentials as sensitive.
- Do not print full secrets in logs, diffs, or summaries.
- For auth/integration changes, explicitly call out required environment variables and redirect/callback impacts.

## PR and Handoff Checklist

Before handoff, ensure:

- Scope matches request and unrelated files are untouched.
- Commands run (or skipped with explicit reason) are documented.
- Risky areas (auth, billing, integrations, migrations, shared UI) are called out.
- Any required env/config updates are listed.
- Summary includes what changed, what was validated, and any known follow-ups.
