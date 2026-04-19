import type { Metadata } from "next";
import { PageHeader } from "@orgframe/ui/primitives/page-header";
import { PageStack } from "@orgframe/ui/primitives/layout";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";
import { listProfilesForAccount } from "@/src/features/people/db/queries";

export const metadata: Metadata = {
  title: "Profiles"
};

const RELATIONSHIP_LABELS: Record<"self" | "guardian" | "delegated_manager", string> = {
  self: "You",
  guardian: "Guardian",
  delegated_manager: "Manager"
};

export default async function ProfilesPage() {
  const user = await requireAuth();
  const profileRecords = await listProfilesForAccount(user.id).catch(() => []);

  return (
    <PageStack>
      <PageHeader description="Profiles you have access to across organizations." showBorder={false} title="Profiles" />

      {profileRecords.length === 0 ? (
        <p className="text-sm text-text-muted">No profiles linked to your account yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {profileRecords.map(({ profile, links }) => {
            const primaryLink = links[0];
            const relationship = primaryLink?.relationshipType ?? "self";
            return (
              <li className="flex items-center gap-3 rounded-control border border-border/70 bg-surface px-3 py-2.5" key={profile.id}>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-text">{profile.displayName}</span>
                <span className="shrink-0 rounded-full border border-border bg-surface-muted px-2 py-0.5 text-[10px] font-medium text-text-muted">
                  {RELATIONSHIP_LABELS[relationship]}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </PageStack>
  );
}
