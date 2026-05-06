/**
 * The origin where the OrgFrame app is hosted (e.g. `https://orgframe.app`).
 * The marketing site never points directly at the auth host. Instead, every
 * "Sign in" / "Open dashboard" link goes to `${APP_ORIGIN}/`. The app's home
 * page decides what to do:
 *   - signed in → render the dashboard
 *   - signed out → redirect to `auth.orgframe.app/`
 *
 * This keeps the marketing build agnostic to wherever the auth host lives,
 * and avoids the marketing site bouncing users to a stale or dev-only URL.
 */
export function getAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.ORGFRAME_APP_ORIGIN ?? "https://orgframe.app";
  return configured.replace(/\/+$/, "");
}

/**
 * Single entrypoint URL for any marketing CTA that should land the user in
 * the app — whether they're signed in or not. The app handles the rest.
 */
export function getAppEntryUrl(): string {
  return `${getAppOrigin()}/`;
}
