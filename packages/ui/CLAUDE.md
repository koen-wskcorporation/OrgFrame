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
