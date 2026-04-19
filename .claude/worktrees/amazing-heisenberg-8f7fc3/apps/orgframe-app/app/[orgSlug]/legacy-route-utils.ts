import { redirect } from "next/navigation";

export type LegacySearchParams = Record<string, string | string[] | undefined>;

type LegacyRedirectParams = {
  params: Promise<{ orgSlug: string }>;
  pathname: string;
  searchParams?: Promise<LegacySearchParams>;
  allowedSearchParams?: readonly string[];
};

export function toQueryString(searchParams: LegacySearchParams, allowedKeys?: readonly string[]) {
  const query = new URLSearchParams();
  const allowed = allowedKeys ? new Set(allowedKeys) : null;

  for (const [key, value] of Object.entries(searchParams)) {
    if (allowed && !allowed.has(key)) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        query.append(key, item);
      }
      continue;
    }

    if (typeof value === "string") {
      query.set(key, value);
    }
  }

  const serialized = query.toString();
  return serialized ? `?${serialized}` : "";
}

export async function redirectLegacyRoute({
  params,
  pathname,
  searchParams,
  allowedSearchParams
}: LegacyRedirectParams) {
  await params;
  const suffix = searchParams ? toQueryString(await searchParams, allowedSearchParams) : "";
  redirect(`${pathname}${suffix}`);
}
