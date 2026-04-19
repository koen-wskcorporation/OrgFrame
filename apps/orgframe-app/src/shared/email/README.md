# Email (SendGrid + Supabase Auth Hook)

Transactional auth emails (signup confirmation, password reset, magic link, invite, email change) are rendered from React Email templates in this folder and sent via SendGrid. Supabase Auth still owns the tokens and flows — it POSTs to our Send Email hook at `/api/auth/email-hook` instead of sending directly.

## Env vars

Add to `.env.local` (and configure in Vercel for each environment):

```
SENDGRID_API_KEY=SG.xxx
SENDGRID_FROM_EMAIL=no-reply@orgframe.app
SENDGRID_FROM_NAME=OrgFrame
SUPABASE_AUTH_EMAIL_HOOK_SECRET=v1,whsec_xxx   # from Supabase dashboard
```

## SendGrid setup

1. Create a Single Sender or (preferred) authenticate your sending domain in SendGrid → Settings → Sender Authentication. The `SENDGRID_FROM_EMAIL` must match.
2. Create an API key with "Mail Send" permission.

## Supabase setup

In the Supabase dashboard → Authentication → Hooks:

1. Enable **Send Email Hook**.
2. Type: **HTTPS**.
3. URL: `https://<your-canonical-auth-host>/api/auth/email-hook`.
4. Generate a secret — paste the full value (including the `v1,whsec_` prefix) into `SUPABASE_AUTH_EMAIL_HOOK_SECRET`.
5. Optionally disable Supabase's built-in SMTP so the default templates don't also send.

Once the hook is enabled, all existing calls to `supabase.auth.resetPasswordForEmail`, `supabase.auth.signUp`, `supabase.auth.admin.inviteUserByEmail`, etc. will route through this endpoint.

## Local preview of templates

```
npm run email:dev --workspace orgframe-app
```

Opens `http://localhost:3333` with hot-reloading previews for every template.

## Adding a new template

1. Add `templates/<name>.tsx` importing `EmailLayout` and `emailStyles` from `_layout.tsx`.
2. If triggered from a Supabase auth event, map it in `hook-handler.ts`.
3. For non-auth transactional emails (receipts, notifications), call `sendEmail` directly from `client.ts`.
