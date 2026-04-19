# AI-First Workspace (Phase 1)

## Feature gate

- `ORGFRAME_AI_FIRST_MODE=true` enables AI-first behavior.
- In AI-first mode, these tools are force-disabled at org tool resolution:
  - `people`
  - `programs`
  - `calendar`
  - `facilities`
  - `forms`
  - `inbox`
- Disabled module URLs are redirected to:
  - `/{orgSlug}/workspace?from=legacy-disabled&tool=<tool>`

## New routes

- `GET /{orgSlug}/workspace`
  - Main AI-first workspace.
  - Redesigned as AI Command Center:
    - Main Canvas (dynamic state machine: `overview | data_table | calendar | import_review | visualization | action_result`)
    - Persistent Copilot Sidebar (chat, proposal confirm/cancel, escalations)
    - Focus Mode overlays (`Panel` for conflict/detail resolution, `Popup` for critical blocking actions)
  - Workspace UI now forwards `workspaceContext` in AI `uiContext`:
    - `{ view, entityType, entityIds, filters, importRunId }`

## New edge functions

### `ai-workspace-actions`

Executes org-scoped AI mutations (edge-functions-only execution path).

Request contract:

- `action`: `"update_player_profile" | "assign_player_team" | "create_practice" | "create_team"`
- `org_id`: `uuid`
- `idempotency_key`: `string` (optional but recommended)
- action-specific payload:
  - `update_player_profile`: `player_id`, `field`, `value`
  - `assign_player_team`: `player_id`, `team_id`
  - `create_practice`: `team_id`, `title?`, `starts_at`, `ends_at`, `timezone?`, `facility_id?`
  - `create_team`: `program_id`, `name`, `slug?`, `age_group?`, `parent_node_id?`

Authorization:

- Requires authenticated user token.
- Requires org permission check via `has_org_permission(...)`:
  - `update_player_profile`: any of `people.write`, `programs.write`, `org.manage.read`
  - `assign_player_team`: any of `programs.write`, `org.manage.read`
  - `create_practice`: any of `programs.write`, `org.manage.read`
  - `create_team`: any of `programs.write`, `org.manage.read`

### `vector-retrieve`

Org-scoped vector retrieval for RAG.

Request contract:

- `org_id`: `uuid`
- `query`: `string`
- `top_k`: `number` (optional, default `6`, max `20`)

Behavior:

- Generates embeddings via Vercel AI Gateway (`/embeddings`).
- Queries Supabase Vector Bucket index.
- Applies mandatory metadata filter: `organization_id = org_id`.

Authorization:

- Requires authenticated user token.
- Requires `org.dashboard.read` permission for `org_id`.

## AI intent contracts

The AI planner/executor now supports:

- `players.update_profile_fields`
- `teams.assign_player`
- `teams.create_team`
- `calendar.create_practice`

Execution flow:

1. `propose_changes` generates a dry-run `AiChangesetV1`.
2. User confirms (`phase="confirm"`).
3. `execute_changes` invokes `ai-workspace-actions` edge function.

## RLS and tenancy notes

- Workspace org context is resolved server-side from `orgSlug`.
- All new edge action handlers verify org membership/permission before writes.
- All write operations include `org_id` predicates.
- Vector retrieval enforces org scoping with metadata filtering by `organization_id`.
- Existing table RLS remains active on:
  - `people.profiles`
  - `programs.program_teams`
  - `programs.program_structure_nodes`
  - `programs.programs`
  - `programs.program_team_members`
  - `calendar.calendar_items`
  - `calendar.calendar_item_occurrences`
  - `calendar.calendar_item_space_allocations`

## UX report (this implementation)

- Workspace is now Canvas + Copilot, replacing the previous fragmented card dashboard.
- Smart Import is table-first in Canvas with conflict highlighting and slide-over conflict resolution.
- New **Add Data** popup flow now runs as:
  - select source platform first (Spreadsheet/Custom supported)
  - upload CSV/XLSX
  - review spreadsheet-style preview and select fields + rows to import
  - start import and jump directly to Import Review
- Copilot confirms proposals in-sidebar, executes via edge functions only, and surfaces escalation cards.
- Visualization cards are available in Canvas and can be opened from natural language chart/trend prompts.
