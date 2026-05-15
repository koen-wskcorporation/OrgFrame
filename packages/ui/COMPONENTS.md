# @orgframe/ui — Component Reference

Every primitive is imported from its own subpath, never from a barrel:

```ts
import { Button } from "@orgframe/ui/primitives/button";
import { Section, SectionActions } from "@orgframe/ui/primitives/section";
```

This means tree-shaking is automatic and that the import path always tells
you which file to open. The conventions that govern *how* to use these
primitives (icon-only buttons, intent props, chips, status pickers, action
order, etc.) live in [`CLAUDE.md`](./CLAUDE.md). This file is a flat menu
of what exists.

## Buttons & actions

| Component | Purpose |
|---|---|
| `Button` (`primitives/button`) | Canonical button. Use `intent` for verb categories (`add`, `save`, `delete`, etc.) and `iconOnly` for icon-only affordances. |
| `IconButton` (`primitives/icon-button`) | Bare icon-only button when `Button iconOnly` isn't enough — most code should prefer `Button iconOnly`. |
| `BackButton` (`primitives/back-button`) | "Back" button with optional fallback href when there's no history. |
| `SubmitButton` (`primitives/submit-button`) | Form submit button with built-in loading state. |
| `SubmitIconButton` (`primitives/submit-icon-button`) | Icon-only variant of `SubmitButton`. |
| `Chip` (`primitives/chip`) | Inline tag / status pill / editable status chip via `picker={...}`. Pass `status` only for true status (published/draft/etc.). |
| `EntityChip` (`primitives/entity-chip`) | Person/team/division chip with avatar + label + optional status. |

## Form inputs

| Component | Purpose |
|---|---|
| `Input` (`primitives/input`) | Text input with prefix/suffix slots, optional slug validation. |
| `Textarea` (`primitives/textarea`) | Auto-styled `<textarea>`. |
| `EmailInput` (`primitives/email-input`) | Email-typed input with format hint affordances. |
| `PhoneInput` (`primitives/phone-input`) | International phone input. Also exports `formatPhoneNumber`, `isCompletePhoneNumber`. |
| `AddressAutocompleteInput` (`primitives/address-autocomplete-input`) | Google Places-backed address field; emits a `SelectedPlace`. |
| `ColorPickerInput` (`primitives/color-picker-input`) | Hex color field with swatch. |
| `Checkbox` (`primitives/checkbox`) | Styled checkbox; pair with `.ui-inline-toggle` for a labeled row. |
| `SearchBar` (`primitives/search-bar`) | Search-styled text input with clear button. |
| `FormField` / `FieldShell` / `FieldLabel` / `FieldHint` / `FieldError` (`primitives/form-field`) | Consistent label + hint + error scaffolding around any control. |
| `formControlShellClass`, `formControlFocusClass`, `formControlDisabledClass`, `formControlInlineClass` (`primitives/form-control`) | Class fragments to keep custom controls visually consistent with the standard inputs. |

## Selection, toggles & menus

| Component | Purpose |
|---|---|
| `Select` (`primitives/select`) | The canonical dropdown / multi-select. Supports `searchable`, `multiple`, chips, status dots, avatars. **Use this for any "search a list, pick one or more" UI.** |
| `ButtonToggleGroup` (`primitives/button-toggle-group`) | Segmented row of buttons acting as a radio group; supports icons + labels. |
| `IconToggleGroup` (`primitives/icon-toggle-group`) | Icon-only segmented control. |
| `SelectionBox` (`primitives/selection-box`) | Card-shaped selectable tile (e.g., picking a layout). |
| `PickerMenu` (`primitives/picker-menu`) | Custom popover menu for an arbitrary trigger; useful when `Select` doesn't fit. |
| `StatusPicker` (`primitives/status-picker`) | Status-selector popover backed by `STATUS_COLORS`. Most callers should use `<Chip picker={...} status />` instead. |
| `STATUS_COLORS`, `resolveStatusColor`, `isStatusColor` (`primitives/status-palette`) | Shared status color palette. |

## Surfaces & layout

| Component | Purpose |
|---|---|
| `Card`, `GhostCard`, `CardHeader`, `CardHeaderCompact`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`, `CardHeaderRow` (`primitives/card`) | Building blocks for card-shaped surfaces. |
| `Section`, `SectionActions` (`primitives/section`) | The standard titled card-with-content. Action buttons inside its body should portal through `<SectionActions>` so they land in the section header. |
| `Panel`, `PanelContainer`, `PanelScreens` (`primitives/panel`) | Side panel surface with header / body / footer. `footerLeading` for destructive entity actions; `headerTitleAccessory` for status chips. |
| `Popup` (`primitives/popup`) | Modal-style centered surface (used by `CreateModal`). |
| `Popover` (`primitives/popover`) | Anchored, portaled popover. The primitive every custom dropdown/menu is built on. |
| `Tooltip` (`primitives/tooltip`) | Lightweight hover tooltip. |
| `ContextPanel`, `CreateModal` (`primitives/interaction-containers`) | Sugar over `Panel` / `Popup` for the two most common patterns. |
| `Surface*` (`SurfaceHeader`, `SurfaceBody`, `SurfaceFooter`, `SurfaceCloseButton`) (`primitives/surface`) | Building blocks shared by `Panel` and `Popup`. `SurfaceCloseButton` is the X auto-rendered in every container. |
| `AppPage`, `CardGrid` (`primitives/layout`) | Page-level shell + responsive card grid. |

## Navigation

| Component | Purpose |
|---|---|
| `NavItem` (`primitives/nav-item`) | Sidebar / dropdown navigation row with icon + label + optional rightSlot. |
| `PageHeader` (`primitives/page-header`) | Page top: title + description + actions + (optional) tabs. |
| `PageTabs` (`primitives/page-tabs`) | The tab strip used inside `PageHeader` (also usable standalone). |
| `Breadcrumb` (`primitives/breadcrumb`) | Truncating breadcrumb trail. |

## Data display

| Component | Purpose |
|---|---|
| `Avatar` (`primitives/avatar`) | Sized image with initials fallback. Also exports `initialsAvatarDataUri`. |
| `AdaptiveLogo` (`primitives/adaptive-logo`) | Logo that swaps between SVG and bitmap variants based on theme. |
| `AssetTile` (`primitives/asset-tile`) | Thumbnail tile for files/uploads. |
| `PersonCard` (`primitives/person-card`) | Card summarizing a person with avatar + name + meta. |
| `InlineText` (`primitives/inline-text`) | Editable-in-place text (click to edit). |
| `PublishStatusIcon` (`primitives/publish-status-icon`) | Small icon indicating published / draft / archived. |
| `Skeleton`, `PageLoadingSkeleton` (`primitives/skeleton`) | Loading placeholders. |
| `SpinnerIcon` (`primitives/spinner-icon`) | The brand spinner. |
| `CenteredStateCard`, `InlineEmptyState` (`primitives/state`) | Empty / zero-state messaging. |

## Feedback

| Component | Purpose |
|---|---|
| `Alert` (`primitives/alert`) | Banner alert with `info` / `success` / `warning` / `destructive` variants. |
| `ToastProvider`, `toast`, `dismissToast`, `clearToasts` (`primitives/toast`) | App-wide toast system. Provider goes once at the app root; call `toast({...})` from anywhere. |
| `ConfirmDialogProvider`, `useConfirmDialog` (`primitives/confirm-dialog`) | Async confirmation dialog (alternative to `window.confirm` for destructive flows). |

## Date, time & calendar

| Component | Purpose |
|---|---|
| `CalendarPicker` (`primitives/calendar-picker`) | Single-date picker with an inline month grid and typed `MM/DD/YYYY` input. Use for plain date fields. |
| `DateTimeRecurrencePicker` (`primitives/date-time-recurrence-picker`) | Notion-style trigger + popover for **date + optional time + recurrence**. Single controlled `DateTimeRecurrenceValue`. Also exports `parseTypedDate`, `buildPickerValueFromWindow`, `pickerValueToWindow`. Use anywhere an event needs scheduling. |

## Lists, repeaters & tables

| Component | Purpose |
|---|---|
| `Repeater`, `RepeaterItem` (`primitives/repeater`, `primitives/repeater-item`) | **The way** to render any rendered list of items (permissions, members, sections, etc.). Provides search, filter, sort, view toggle, drag-handle support. Use `fixedView="list"` + `disableViewToggle` when you don't want grid/list switching. |
| `DataTable` (`primitives/data-table`) | Sortable, filterable, paginated table with view config. |
| `SearchableLinkCards` (`primitives/searchable-link-cards`) | Searchable grid of cards each linking to a destination. |

## Wizards

| Component | Purpose |
|---|---|
| `CreateWizard` (`primitives/create-wizard`) | Multi-step wizard with `mode="create" \| "edit"`, free step navigation, optional persistence adapter. Also exports `createLocalStoragePersistence`. **Both create and edit flows for the same entity must reuse this — never build a separate edit form.** |

## Maps

| Component | Purpose |
|---|---|
| `GoogleMapLayer` (`primitives/google-map-layer`) | Embeddable Google Map layer used by facility/address features. |
| `loadGooglePlacesApi` (`primitives/load-google-places-api`) | Loader for the Google Places JS API; reused by the address autocomplete input. |

## Charts

Imported from `@orgframe/ui/primitives/charts/<kind>`:

| Component | Purpose |
|---|---|
| `BarChart` | Categorical bar chart. |
| `LineChart` | Time-series line chart. |
| `DonutChart` | Donut / pie chart. |
| `Sparkline` | Inline mini line chart. |

## Theming & utilities

| Component | Purpose |
|---|---|
| `ThemeModeProvider`, `useThemeMode` (`primitives/theme-mode`) | Light / dark / auto theme context. |
| `cn`, `isSvgAssetUrl` (`primitives/utils`) | `cn` is the class-name helper (clsx + tailwind-merge) used by every primitive. Always prefer it over hand-concatenating className strings. |

---

## Quick decision guide

- "I need a list of items with optional search/filter" → **`Repeater`**.
- "I need to pick one or more entities (people, teams, programs)" → **`Select` with `multiple`** (with `avatar`, `subtext` on each option for entity-style rows). Never roll your own `Input + Popover + chips`.
- "I need a status pill that the user can change" → **`Chip` with `picker` + `status`**, mounted on the panel header via `headerTitleAccessory`.
- "I need a confirmation before deleting something" → **`useConfirmDialog`** inside the destructive `footerLeading` icon button.
- "I need a date and optional time and optional recurrence" → **`DateTimeRecurrencePicker`**.
- "I need a date only" → **`CalendarPicker`**.
- "I need a segmented selector" → **`ButtonToggleGroup`** (with labels) or **`IconToggleGroup`** (icons only).
- "I need a multi-step create/edit flow" → **`CreateWizard`** (same component for both).
- "I need an action button" → **`Button` with `intent`** — never hand-roll `<Button><Pencil />Edit</Button>`.
