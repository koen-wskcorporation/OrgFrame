# UI Surface Use Cases

Last updated: March 13, 2026

## Decision model

### Panel
Use `Panel` when users must keep the main page visible while editing related details.

Best for:
- Contextual side-by-side editing tied to a selected row, card, node, or canvas item.
- Repeated quick edits where users open/close the same surface often.
- Workspaces where docking preserves orientation (calendar, builder, structure editors).

Avoid when:
- The task is a short standalone flow (create/confirm/quick settings).
- The form is critical-path on small screens and should own the viewport.

### Popup
Use `Popup` for short, focused, blocking tasks with clear primary actions.

Best for:
- Create/edit flows that do not require constant side-by-side context.
- Confirmation dialogs with meaningful content.
- Utility settings dialogs (for example table column preferences).

### Popover
Use `Popover` for lightweight anchored UI only.

Best for:
- Menus, quick actions, tiny contextual controls.
- Short content that should stay visually attached to the trigger.

Avoid:
- Long forms, multi-step tasks, or heavy explanatory copy.
- Header/footer action bars.

### Full-Screen Popup
Use `FullScreenPopup` when the task should temporarily become the whole experience.

Best for:
- Dense input flows in mobile/public contexts.
- Multi-section forms where side docking harms readability.
- Situations where accidental background interaction is risky.

## App audit and decisions

### Migrated from panel to popup
- `apps/orgframe-app/src/features/core/auth/components/AuthDialog.tsx` (`Account Access`) -> `Popup`
- `apps/orgframe-app/src/features/core/dashboard/components/CreateOrganizationDialog.tsx` (`Create organization`) -> `Popup`
- `packages/ui/src/ui/data-table.tsx` (`Table columns`) -> `Popup`
- `apps/orgframe-app/src/features/programs/components/ProgramsManagePanel.tsx` (`Create program`) -> `Popup`
- `apps/orgframe-app/src/features/programs/schedule/components/OccurrenceEditDialog.tsx` (`Edit/Add occurrence`) -> `Popup`
- `apps/orgframe-app/src/features/access/components/AccountsAccessPanel.tsx` (`Remove access`) -> `Popup`

### Migrated from panel to full-screen popup
- `apps/orgframe-app/src/features/forms/components/RegistrationFormClient.tsx` (`Add player`) -> `FullScreenPopup`

### Migrated from custom dropdown to popover
- `apps/orgframe-app/src/features/core/layout/components/AccountMenu.tsx` -> `Popover`

### Kept as panel (contextual editing)
- `apps/orgframe-app/src/features/calendar/components/Calendar.tsx` and `apps/orgframe-app/src/features/calendar/components/CalendarWorkspace.tsx` (`Create event`)
- `apps/orgframe-app/src/features/ai/components/AiAssistantLauncher.tsx` (`AI Assistant`)
- `apps/orgframe-app/src/features/events/components/EventsManagePanel.tsx` (`Create/Edit event`)
- `apps/orgframe-app/src/features/facilities/components/FacilitySchedulePanel.tsx` (`Create/Edit rule`)
- `apps/orgframe-app/src/features/facilities/components/FacilityStructurePanel.tsx` (`Add/Edit space`)
- `apps/orgframe-app/src/features/facilities/components/FacilityTreeEditor.tsx` (`Add/Edit space`)
- `apps/orgframe-app/src/features/facilities/components/ReservationEditorPanel.tsx`
- `apps/orgframe-app/src/features/forms/components/FormCreatePanel.tsx`
- `apps/orgframe-app/src/features/forms/components/FormFieldsVisualEditor.tsx` (`Field settings`, `Field library`)
- `apps/orgframe-app/src/features/forms/components/FormSubmissionsPanel.tsx` (filters, controls, views, submission details)
- `apps/orgframe-app/src/features/access/components/AccountsAccessPanel.tsx` (`Member profile`)
- `apps/orgframe-app/src/features/players/components/PlayersAccountPanel.tsx` (`Add/Edit player`, `Link guardian`)
- `apps/orgframe-app/src/features/programs/components/ProgramEditorPanel.tsx` (`Edit node`, `Add element`)
- `apps/orgframe-app/src/features/programs/teams/components/TeamDetailPanel.tsx`
- `apps/orgframe-app/src/features/site/components/OrgSitePage.tsx` (`Page Editor`)
- `apps/orgframe-app/src/features/core/layout/components/EditorSettingsDialog.tsx` (shared wrapper still intentionally panel-based)
