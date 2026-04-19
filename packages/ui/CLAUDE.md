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
