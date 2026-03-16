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
- `packages/ui/src/auth/AuthDialog.tsx` (`Account Access`) -> `Popup`
- `packages/ui/src/dashboard/CreateOrganizationDialog.tsx` (`Create organization`) -> `Popup`
- `packages/ui/src/ui/data-table.tsx` (`Table columns`) -> `Popup`
- `packages/ui/src/modules/programs/components/ProgramsManagePanel.tsx` (`Create program`) -> `Popup`
- `packages/ui/src/modules/programs/schedule/components/OccurrenceEditDialog.tsx` (`Edit/Add occurrence`) -> `Popup`
- `packages/ui/src/modules/manage-access/components/AccountsAccessPanel.tsx` (`Remove access`) -> `Popup`

### Migrated from panel to full-screen popup
- `packages/ui/src/modules/forms/components/RegistrationFormClient.tsx` (`Add player`) -> `FullScreenPopup`

### Migrated from custom dropdown to popover
- `packages/ui/src/shared/AccountMenu.tsx` -> `Popover`

### Kept as panel (contextual editing)
- `packages/ui/src/calendar/UnifiedCalendar.tsx` and `packages/ui/src/modules/calendar/components/UnifiedCalendar.tsx` (`Create event`)
- `packages/ui/src/modules/ai/components/AiAssistantLauncher.tsx` (`AI Assistant`)
- `packages/ui/src/modules/events/components/EventsManagePanel.tsx` (`Create/Edit event`)
- `packages/ui/src/modules/facilities/components/FacilitySchedulePanel.tsx` (`Create/Edit rule`)
- `packages/ui/src/modules/facilities/components/FacilityStructurePanel.tsx` (`Add/Edit space`)
- `packages/ui/src/modules/facilities/components/FacilityTreeEditor.tsx` (`Add/Edit space`)
- `packages/ui/src/modules/facilities/components/ReservationEditorPanel.tsx`
- `packages/ui/src/modules/forms/components/FormCreatePanel.tsx`
- `packages/ui/src/modules/forms/components/FormFieldsVisualEditor.tsx` (`Field settings`, `Field library`)
- `packages/ui/src/modules/forms/components/FormSubmissionsPanel.tsx` (filters, controls, views, submission details)
- `packages/ui/src/modules/manage-access/components/AccountsAccessPanel.tsx` (`Member profile`)
- `packages/ui/src/modules/players/components/PlayersAccountPanel.tsx` (`Add/Edit player`, `Link guardian`)
- `packages/ui/src/modules/programs/components/ProgramEditorPanel.tsx` (`Edit node`, `Add element`)
- `packages/ui/src/modules/programs/teams/components/TeamDetailPanel.tsx`
- `packages/ui/src/modules/site-builder/components/OrgSitePage.tsx` (`Page Editor`)
- `packages/ui/src/shared/EditorSettingsDialog.tsx` (shared wrapper still intentionally panel-based)
