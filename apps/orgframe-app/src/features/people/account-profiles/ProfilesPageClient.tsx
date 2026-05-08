"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Settings } from "lucide-react";
import { Avatar } from "@orgframe/ui/primitives/avatar";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Section } from "@orgframe/ui/primitives/section";
import { PageShell } from "@/src/features/core/layout/components/PageShell";
import {
  ProfileWizardPanel,
  emptyProfileWizardState,
  profileWizardStateFromProfile,
  type ProfileWizardState
} from "@/src/features/people/account-profiles/ProfileWizardPanel";
import type { AccountProfileRecord } from "@/src/features/people/account-profiles/server";

type WizardOpen =
  | { mode: "create" }
  | { mode: "edit"; record: AccountProfileRecord }
  | null;

const RELATIONSHIP_LABELS: Record<string, string> = {
  self: "You",
  guardian: "Dependent",
  delegated_manager: "Dependent"
};

export function ProfilesPageClient({ records }: { records: AccountProfileRecord[] }) {
  const router = useRouter();
  const { toast: _toast } = useToast();
  const [wizard, setWizard] = React.useState<WizardOpen>(null);

  const initialState: ProfileWizardState | undefined =
    wizard?.mode === "edit"
      ? profileWizardStateFromProfile(
          wizard.record.profile,
          wizard.record.myLink,
          wizard.record.shares,
          wizard.record.avatarUrl
        )
      : wizard?.mode === "create"
        ? emptyProfileWizardState
        : undefined;

  return (
    <>
      <PageShell
        description="Profiles you manage. Add yourself, your kids, or anyone else you help manage."
        title="Profiles"
      >
        <Repeater
          emptyMessage="No profiles yet. Add yourself or someone you help manage to get started."
          getSearchValue={(record) => record.profile.displayName}
          initialView="list"
          items={records}
          searchPlaceholder="Search profiles"
          viewKey="account.profiles"
          renderShell={({ toolbar, body }) => (
            <Section
              actions={
                <div className="flex flex-wrap items-center gap-2">
                  {toolbar}
                  <Button onClick={() => setWizard({ mode: "create" })} type="button">
                    <Plus className="h-4 w-4" />
                    Add
                  </Button>
                </div>
              }
              description="Profiles attached to your account."
              fill={false}
              title="Profiles"
            >
              {body}
            </Section>
          )}
          getItem={(record) => {
            const { profile, myLink, shares, avatarUrl } = record;
            const sharedCount = shares.length;
            return {
              id: profile.id,
              title: profile.displayName,
              leading: <Avatar alt={profile.displayName} name={profile.displayName} sizePx={32} src={avatarUrl} />,
              chips: (
                <>
                  <Chip status={false} label={RELATIONSHIP_LABELS[myLink.relationshipType] ?? myLink.relationshipType} />
                  {sharedCount > 0 ? (
                    <Chip status={false} label={`Shared with ${sharedCount}`} />
                  ) : null}
                </>
              ),
              meta: profile.dob ? `DOB: ${profile.dob}` : undefined,
              primaryAction: myLink.canManage ? (
                <Button onClick={() => setWizard({ mode: "edit", record })} size="sm" type="button" variant="secondary">
                  <Settings className="h-3.5 w-3.5" />
                  Manage
                </Button>
              ) : undefined
            };
          }}
        />
      </PageShell>

      <ProfileWizardPanel
        initialState={initialState}
        mode={wizard?.mode ?? "create"}
        onClose={() => setWizard(null)}
        onSaved={() => {
          setWizard(null);
          router.refresh();
        }}
        open={wizard !== null}
        profileId={wizard?.mode === "edit" ? wizard.record.profile.id : undefined}
      />
    </>
  );
}
