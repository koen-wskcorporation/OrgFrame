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
