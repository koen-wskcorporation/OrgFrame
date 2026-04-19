export function getAppOrigin(): string {
  const configured = process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.ORGFRAME_APP_ORIGIN ?? "https://orgframe.app";
  return configured.replace(/\/+$/, "");
}

export function getAppAuthUrl(next = "/"): string {
  return `${getAppOrigin()}/auth?next=${encodeURIComponent(next)}`;
}

export function getAppDashboardUrl(): string {
  return `${getAppOrigin()}/`;
}
