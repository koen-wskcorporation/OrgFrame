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

## Panel footers — never include a Cancel/Close button

Every `Panel` (and any wizard built on `CreateWizard` / `WizardChrome`) already
has an X in the header that dismisses it. The footer must therefore contain
**only forward-progress actions**: Back / Next / Save / Submit / Delete.

Do NOT add to a panel footer:
- A Cancel button
- A Close button
- A "Discard" button (use the close-confirm dialog flow instead)

This applies to both create and edit wizard modes, and to bare `Panel` usages.
The `hideCancel` prop on `CreateWizard` is retained for API stability but is a
no-op — there is no cancel button to hide.

## Wizard delete — pass `delete` to the wizard, never roll your own

`CreateWizard` and `WizardChrome` accept an optional `delete` config:

```tsx
<CreateWizard
  mode="edit"
  delete={{
    onDelete: async () => { await deleteAction(...); },
    confirmTitle: "Delete team?",
    confirmDescription: "This cannot be undone."
  }}
  ...
/>
```

When provided, the wizard renders a Trash2 icon-only button on the **left**
side of the footer and shows a destructive confirm dialog before invoking
`onDelete`. **Do NOT** put a Delete button inside a wizard step body, in a
header, or as a separate primary footer action — the `delete` prop is the only
sanctioned location.

The prop is optional. Create-mode wizards usually omit it; edit-mode wizards
that own a deletable entity should pass it.
