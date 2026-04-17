# Interaction Container Framework

## Primary Rules

- `Panel` = contextual interaction for existing objects.
- `Modal` (`Popup`/`CreateModal`) = focused create flow or advanced form editing.
- Full-screen workspace/route = dedicated builder/editor mode only.

## Core Behavior Model

- Selecting an existing record from a list/calendar/canvas opens a `Panel` first.
- Clicking `Create/New` opens a modal first.
- Deep editing uses:
  - modal for advanced form/configuration
  - full-screen workspace only for true multi-pane builder workflows

## Shared Primitives

- Use `ContextPanel` from `packages/ui/src/ui/interaction-containers.tsx` for existing-item quick view/edit.
- Use `CreateModal` from `packages/ui/src/ui/interaction-containers.tsx` for create/new flows.
- Avoid introducing one-off container implementations when these wrappers fit.

## Major Entity Mapping (Current Standard)

| Entity / Area | Create Container | Existing Item Container | Advanced Edit Container |
| --- | --- | --- | --- |
| Calendar events (org/team manage) | `CreateModal` | `Panel` | `Panel` + focused popups for booking/share |
| Facilities (spaces) | `CreateModal` | `Panel` | Route-level detail pages + structure workspace |
| Program structure nodes (division/team) | `CreateModal` | `ContextPanel` | Team detail `Panel` |
| Forms | `CreateModal` | Route-level editor/settings/submissions | Route-level editor/settings pages |
| Players (account) | `CreateModal` | `ContextPanel` | `CreateModal` for guardian-link flow |

## Documented Exceptions

- Facility structure map (`FacilityStructurePanel`) remains a dedicated workspace with canvas interactions; node editing is modal because it is a map-builder context.
- Site/page builder flows remain full-screen because they are layout/canvas editing tools.
- Program schedule builder remains full-screen (`ScheduleBuilderPage`) because it is a multi-pane schedule workspace.

## Implementation Notes

- If a flow starts as quick context from an existing record, keep first interaction in `ContextPanel`.
- If the action originates from a `Create/New` CTA, start in `CreateModal` even when opened from a workspace.
- Add code comments only where an exception is non-obvious and intentionally diverges from this document.
