import type { Metadata } from "next";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";
import { listAccountProfiles } from "@/src/features/people/account-profiles/server";
import { ProfilesPageClient } from "@/src/features/people/account-profiles/ProfilesPageClient";

export const metadata: Metadata = {
  title: "Profiles"
};

export default async function ProfilesPage() {
  const user = await requireAuth();
  const records = await listAccountProfiles(user.id).catch(() => []);

  return <ProfilesPageClient records={records} />;
}
