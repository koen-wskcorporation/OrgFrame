# Quick Command Reference

## Development

```bash
npm run dev              # Start both app and web (port 3000, 3001)
npm run dev:app         # App only (port 3000)
npm run dev:web         # Web only (port 3001)
```

## Validation

```bash
npm run typecheck:app   # Find TS errors (run before commit)
npm run lint:app        # Check linting (run before commit)
npm run test:node       # Run Node.js tests in tests/
```

## Building

```bash
npm run build:app       # Build optimized production app
npm run build:web       # Build optimized marketing site
npm start               # Run production app locally
```

## Database

```bash
# Use Supabase CLI (if installed)
supabase db pull        # Pull latest schema
supabase migration up   # Run pending migrations
```

## Token Efficiency Tips

**Before starting a task:**
- Read CLAUDE.md to understand structure/conventions
- Use `/context` to see what's eating tokens
- Run `/compact focus on [feature]` if context is bloated

**During development:**
- Point Claude to file:line (e.g., "src/features/forms/actions.ts:45")
- Use Haiku model for linting/formatting/simple fixes
- Run `npm run typecheck:app` locally first to catch errors

**When done:**
- Verify with `npm run lint:app && npm run typecheck:app`
- Keep worktree focused on one feature per branch
- Run `/compact` before switching branches
