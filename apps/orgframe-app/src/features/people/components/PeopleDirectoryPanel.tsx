"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import { SectionActions } from "@orgframe/ui/primitives/section";
import { EntityChip } from "@orgframe/ui/primitives/entity-chip";
import { useToast } from "@orgframe/ui/primitives/toast";
import { type PeopleDirectoryPageData } from "@/src/features/people/actions";
import type { PeopleDirectoryAccount, PeopleRelationshipType } from "@/src/features/people/types";
import { AccountCreatePanel } from "@/src/features/people/components/AccountCreatePanel";
import {
  ProfileWizardPanel,
  profileWizardStateFromProfile,
  type ProfileWizardState
} from "@/src/features/people/profiles/ProfileWizardPanel";
import { getOrgAccountProfileAction } from "@/src/features/people/profiles/actions";

type PeopleDirectoryPanelProps = {
  orgSlug: string;
  currentUserId: string;
  canWritePeople: boolean;
  loadError: string | null;
  initialAccounts: PeopleDirectoryPageData["directory"]["accounts"];
};

function relationshipBadgeLabel(value: PeopleRelationshipType) {
  switch (value) {
    case "self":
      // Row's owner self-link — distinct from "You" which is viewer-relative.
      return "Self";
    case "guardian":
      return "Guardian";
    case "delegated_manager":
      return "Delegated";
    default:
      return value;
  }
}

export function PeopleDirectoryPanel({ orgSlug, currentUserId, canWritePeople, loadError, initialAccounts }: PeopleDirectoryPanelProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [accounts] = useState(initialAccounts);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [createAccountPanelOpen, setCreateAccountPanelOpen] = useState(false);
  // Self-profile wizard for the account being edited. The directory loads the
  // profile lazily via getOrgAccountProfileAction so we don't bloat the page payload.
  const [wizardTarget, setWizardTarget] = useState<{
    userId: string;
    profileId: string;
    state: ProfileWizardState;
  } | null>(null);
  const [, setIsLoadingWizard] = useState(false);

  const accountColumns = useMemo<DataTableColumn<PeopleDirectoryAccount>[]>(
    () => [
      {
        key: "first_name",
        label: "First Name",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => row.firstName ?? "—",
        renderSearchValue: (row) => row.firstName ?? "",
        renderSortValue: (row) => row.firstName ?? ""
      },
      {
        key: "last_name",
        label: "Last Name",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => row.lastName ?? "—",
        renderSearchValue: (row) => row.lastName ?? "",
        renderSortValue: (row) => row.lastName ?? ""
      },
      {
        key: "email",
        label: "Email Address",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => row.email ?? "—",
        renderSearchValue: (row) => row.email ?? "",
        renderSortValue: (row) => row.email ?? ""
      },
      {
        key: "phone",
        label: "Phone Number",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => row.phone ?? "—",
        renderSearchValue: (row) => row.phone ?? "",
        renderSortValue: (row) => row.phone ?? ""
      },
      {
        key: "role",
        label: "Role",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => <Chip status={false} variant="neutral">{row.role}</Chip>,
        renderSortValue: (row) => row.role
      },
      {
        key: "status",
        label: "Status",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => <Chip variant={row.status === "active" ? "success" : "warning"}>{row.status}</Chip>,
        renderSortValue: (row) => row.status
      },
      {
        key: "profiles",
        label: "People",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => {
          // The directory row IS the account holder, so the self-profile is
          // already represented by the row itself — only chip up dependents
          // and other linked profiles to avoid visual duplication.
          const otherProfiles = row.profiles.filter(
            (entry) => !entry.links.some((link) => link.accountUserId === row.userId && link.relationshipType === "self")
          );
          if (otherProfiles.length === 0) return <span className="text-text-muted">—</span>;
          return (
            <div className="flex flex-wrap gap-1.5">
              {otherProfiles.map((entry) => {
                const relationshipLabels = Array.from(
                  new Set(entry.links.map((link) => relationshipBadgeLabel(link.relationshipType)))
                );
                const metaLabel = relationshipLabels.join(", ");
                return (
                  <EntityChip
                    key={entry.profile.id}
                    name={entry.profile.displayName}
                    status={metaLabel.length > 0 ? { label: metaLabel, variant: "neutral" } : undefined}
                  />
                );
              })}
            </div>
          );
        },
        renderSortValue: (row) =>
          row.profiles.filter(
            (entry) => !entry.links.some((link) => link.accountUserId === row.userId && link.relationshipType === "self")
          ).length
      },
      {
        key: "user_id",
        label: "User ID",
        defaultVisible: false,
        sortable: true,
        renderCell: (row) => <span className="text-xs text-text-muted">{row.userId}</span>,
        renderSearchValue: (row) => row.userId,
        renderSortValue: (row) => row.userId
      },
      {
        key: "joined",
        label: "Joined",
        defaultVisible: false,
        sortable: true,
        renderCell: (row) => (row.joinedAt ? new Date(row.joinedAt).toLocaleString() : "—"),
        renderSortValue: (row) => row.joinedAt ?? ""
      },
      {
        key: "last_activity",
        label: "Last Activity",
        defaultVisible: false,
        sortable: true,
        renderCell: (row) => (row.lastActivityAt ? new Date(row.lastActivityAt).toLocaleString() : "—"),
        renderSortValue: (row) => row.lastActivityAt ?? ""
      }
    ],
    []
  );

  async function openSelfProfileWizard(userId: string) {
    if (!canWritePeople && userId !== currentUserId) return;
    setIsLoadingWizard(true);
    try {
      const result = await getOrgAccountProfileAction({ orgSlug, targetUserId: userId });
      if (!result.ok || !result.data.record) {
        toast({
          title: "Could not open person",
          description: result.ok ? "This account has no self entry yet." : result.error,
          variant: "destructive"
        });
        return;
      }
      const { profile, myLink, shares, avatarUrl } = result.data.record;
      setWizardTarget({
        userId,
        profileId: profile.id,
        state: profileWizardStateFromProfile(profile, myLink, shares, avatarUrl)
      });
    } finally {
      setIsLoadingWizard(false);
    }
  }

  return (
    <>
      {loadError ? <Alert variant="warning">{loadError}</Alert> : null}

      <SectionActions>
        <Button intent="add" object="account" disabled={!canWritePeople} onClick={() => setCreateAccountPanelOpen(true)} type="button" />
      </SectionActions>
      <DataTable
        ariaLabel="People accounts"
        columns={accountColumns}
        data={accounts}
        defaultSort={{ columnKey: "email", direction: "asc" }}
        emptyState="No accounts found."
        enableRowSelection
        onRowClick={(row) => void openSelfProfileWizard(row.userId)}
        onSelectedRowKeysChange={setSelectedAccountIds}
        rowKey={(row) => row.userId}
        searchPlaceholder="Search accounts"
        selectedRowKey={wizardTarget?.userId ?? null}
        selectedRowKeys={selectedAccountIds}
        storageKey={`people-accounts-table:${orgSlug}`}
      />

      <AccountCreatePanel
        onClose={() => setCreateAccountPanelOpen(false)}
        open={createAccountPanelOpen}
        orgSlug={orgSlug}
      />

      <ProfileWizardPanel
        initialState={wizardTarget?.state}
        mode="edit"
        onClose={() => setWizardTarget(null)}
        onSaved={() => {
          setWizardTarget(null);
          router.refresh();
        }}
        open={wizardTarget !== null}
        orgSlug={orgSlug}
        profileId={wizardTarget?.profileId}
        targetUserId={wizardTarget?.userId}
      />
    </>
  );
}
