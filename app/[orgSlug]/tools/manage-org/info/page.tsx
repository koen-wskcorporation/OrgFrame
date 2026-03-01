import { redirect } from "next/navigation";

type SearchParams = {
  saved?: string;
  error?: string;
};

export default async function OrgInfoLegacyPage({
  params,
  searchParams
}: {
  params: Promise<{ orgSlug: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { orgSlug } = await params;
  const query = await searchParams;
  const nextQuery = new URLSearchParams();

  if (query.saved) {
    nextQuery.set("saved", query.saved);
  }

  if (query.error) {
    nextQuery.set("error", query.error);
  }

  const suffix = nextQuery.toString();
  redirect(`/${orgSlug}/tools/manage/info${suffix ? `?${suffix}` : ""}`);
}
