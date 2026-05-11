# @orgframe/ui conventions

## Icon-only buttons — always use `<Button iconOnly>`

Any button whose only child is an icon (no visible text) MUST use the
`iconOnly` prop on `@orgframe/ui/primitives/button`:

```tsx
<Button iconOnly aria-label="Close">{icon}</Button>
```

That includes close X, drag handles, settings gears, kebab menus, refresh,
copy-to-clipboard, etc. When `iconOnly` is set, `variant` defaults to `"ghost"`
and `size` defaults to `"sm"`, and the button picks up the shared icon-button
styling.

Do NOT use for icon-only buttons:
- A bare `<button>` element
- `<Button variant="ghost">` with a lone icon child and no `iconOnly`
- Any hand-rolled `h-8 w-8 rounded-full` wrapper

This keeps icon-button size (h-8 w-8), shape (rounded-full), hover
treatment, and focus ring identical across the app.

## Action buttons — always use the `intent` prop

Any button whose action falls into a recognized verb category MUST use the
`intent` prop on `@orgframe/ui/primitives/button` instead of hand-rolling icon,
label, and variant:

```tsx
<Button intent="add" object="Player" />          {/* + Add Player */}
<Button intent="save" loading={isPending} />     {/* ✓ Save */}
<Button intent="cancel" onClick={onCancel} />    {/* Cancel (ghost) */}
<Button intent="delete" onClick={onDelete} />    {/* 🗑 Delete (danger) */}
<Button intent="manage" object="Roster" />       {/* ⚙ Manage Roster */}
```

Recognized intents: `add`, `create`, `save`, `submit`, `edit`, `manage`,
`delete`, `remove`, `cancel`. Each defines its own icon, default verb, and
default variant — see `intentRegistry` in `primitives/button.tsx`.

Rules:
- **Don't pass an icon manually** alongside `intent`. The intent provides it.
- Pass `object="Player"` for "Add Player" / "Manage Roster" style labels, OR
  pass `children` for custom text. Don't do both.
- Use sentence case in `object` ("Roster", not "ROSTER" / "roster").
- An explicit `variant` overrides the intent default — only set it when you
  *intentionally* want a non-default emphasis (e.g. a low-emphasis ghost
  Delete in a confirm dialog).
- `hideIntentIcon` is the escape hatch for tight layouts where the icon would
  be visual noise; prefer fixing the layout first.

Do NOT for action buttons:
- Hand-write `<Button><Pencil />Edit</Button>` — use `<Button intent="edit" />`.
- Use Title Case ("Save Changes" → prefer `intent="save"` / `<Button intent="save">Save changes</Button>`).
- Mix bespoke icons across screens for the same intent.

## Status / visibility chips — inline with the title in the panel header

Any wizard or settings panel that controls an entity with a status MUST
render that status as an interactive `<Chip>` inline with the wizard title,
via the `headerTitleAccessory` slot — **not** as a separate "Visibility" /
"Status" step or form field inside the wizard body.

```tsx
<CreateWizard<EditState>
  title={`Edit "${item.title}"`}
  headerTitleAccessory={({ state, setField }) => (
    <Chip
      status
      picker={{
        onChange: (value) => setField("isPublished", value === "published"),
        options: PUBLISH_OPTIONS,
        value: state.isPublished ? "published" : "unpublished"
      }}
    />
  )}
  // ...
/>
```

The same `headerTitleAccessory` prop is forwarded by `<Panel>` and
`<Popup>`, so any custom panel built directly on those primitives uses the
same slot name.

Rules:
- The chip is the **single source of truth** for the entity's status in
  that wizard. Drop any redundant status step / field in the body.
- Accepts either a static `ReactNode` or a render function
  `({ state, setField }) => ReactNode`. Use the function form when the
  chip reflects in-flight wizard state (the common case).
- For multi-type wizards (e.g. "Page / Dropdown / External link") where
  only some types have status, return `null` from the render function for
  the types without one — don't hide it with an empty chip.
- Save-on-change vs save-on-submit follows the wizard's `mode`:
  - `mode="create"`: the chip drives `state.isPublished` (or equivalent),
    persisted with the rest of the form on submit.
  - `mode="edit"`: same shape — the chip mutates wizard state, and the
    explicit Save button commits. Inline auto-save is reserved for the
    row-level chip in list views (see `WebsiteManager.tsx`).
- Status colour conventions: `emerald` for the live/published state,
  `slate` for unpublished / draft / inactive, `rose` for archived. Keep
  the live state first in the option list so the popover puts it on top.

Do NOT:
- Render a "Visibility" or "Status" step inside `<CreateWizard>` for an
  entity whose status already shows in the header.
- Hide the chip behind a click — it must be visible whenever the wizard
  is open.
- Use a `<Select>` or radio group for status. The chip popover is the
  pattern.

## Chips — always use `<Chip>`, never hand-roll

Any small inline tag, badge, status pill, or category label MUST use the
`Chip` primitive from `@orgframe/ui/primitives/chip`. This applies to status
pills inside cards, lists, table cells, headers, and detail rows.

```tsx
<Chip label="External link" />                     {/* neutral category tag */}
<Chip color="emerald" label="Published" status />  {/* status pill — has dot */}
<Chip picker={statusPickerConfig} status />        {/* editable status chip */}
```

Do NOT:
- Hand-write `<span className="rounded-full border ... px-2 ...">Label</span>`
  for a badge or pill — use `<Chip>`.
- Build a custom dropdown for status changes — pass `picker` to `<Chip>`.
- Re-skin the chip with bespoke padding, font size, or border radius.

### `status` mode is for STATUS only

The `status` prop (and the dot it renders) is reserved for chips that
represent the **status of something** — published/draft/archived,
active/inactive, scheduled/cancelled, paid/unpaid, etc.

Do NOT pass `status` (or `showDot`) on chips that are just:
- Category or kind tags ("External link", "Generic", "League")
- Counts or quantity badges ("3 new", "12")
- Plain neutral labels

If the chip isn't communicating "the current state of this thing," it's
not in status mode — leave `status` off so no dot is rendered.

## Action button order — primary goes furthest right

When a container has multiple action buttons, arrange them in order of
**increasing emphasis**, with the primary (highest-emphasis) action
furthest to the right. Reading flows low → high emphasis so the eye lands
on the commit action.

```tsx
{/* card footer / inline action row */}
<Button intent="cancel" />
<Button intent="delete" />
<Button intent="save" />
```

Apply in: card/section action rows, panel footers, dialog action rows,
inline rows next to a connected resource (e.g. `Disconnect` then
`Open link`).

Exception: wizard footers use the wizard's own `Back · Next / Submit`
convention — don't override that.

Do NOT:
- Put the primary action on the left "because it's the most important."
- Mix orderings across screens for the same kind of container.
