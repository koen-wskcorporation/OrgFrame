"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardHeader, CardHeaderRow } from "@orgframe/ui/primitives/card";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Panel } from "@orgframe/ui/primitives/panel";
import { PersonCard } from "@orgframe/ui/primitives/person-card";
import { EntityChip } from "@orgframe/ui/primitives/entity-chip";
import { Select, type SelectOption } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { AccountEditPanel } from "@/src/features/people/components/AccountEditPanel";
import { EditableAvatar } from "@/src/features/core/account/components/EditableAvatar";
import { saveProfilePhoto } from "@/src/features/core/account/components/saveProfilePhoto";
import {
  linkProfileAction,
  transitionProfileStatusAction,
  updateAccountRoleAction,
  type PeopleDirectoryPageData
} from "@/src/features/people/actions";
import { listOrgRolesAction } from "@/src/features/people/roles/actions";
import type { PeopleDirectoryAccount, PeopleProfile, PeopleProfileLink, PeopleProfileStatus, PeopleRelationshipType } from "@/src/features/people/types";
import { ProfileLinkPopup, type ProfileLinkPayload } from "@/src/features/people/components/ProfileLinkPopup";
import { AccountCreatePanel } from "@/src/features/people/components/AccountCreatePanel";

type PeopleDirectoryPanelProps = {
  orgSlug: string;
  currentUserId: string;
  canWritePeople: boolean;
  loadError: string | null;
  initialAccounts: PeopleDirectoryPageData["directory"]["accounts"];
};

type ProfileEntry = {
  profile: PeopleProfile;
  links: PeopleProfileLink[];
};

function relationshipBadgeLabel(value: PeopleRelationshipType) {
  switch (value) {
    case "self":
      return "You";
    case "guardian":
      return "Guardian";
    case "delegated_manager":
      return "Delegated";
    default:
      return value;
  }
}

function statusBadgeVariant(status: PeopleProfileStatus) {
  if (status === "active") return "success";
  if (status === "pending_claim") return "warning";
  return "neutral";
}

function accountDisplayName(account: PeopleDirectoryAccount) {
  const composed = [account.firstName, account.lastName].filter(Boolean).join(" ").trim();
  if (composed.length > 0) return composed;
  return account.email ?? account.userId ?? "Account";
}

export function PeopleDirectoryPanel({ orgSlug, currentUserId, canWritePeople, loadError, initialAccounts }: PeopleDirectoryPanelProps) {
  const { toast } = useToast();
  const router = useRouter();
  const [accounts, setAccounts] = useState(initialAccounts);
  // Multi-open state: each opened row gets its own panel. Both lists preserve mount order so
  // panels stack predictably in the PanelContainer (newer ones to the left in side-by-side mode).
  const [openAccountIds, setOpenAccountIds] = useState<string[]>([]);
  const [openProfileIds, setOpenProfileIds] = useState<string[]>([]);
  const [selectedAccountIds, setSelectedAccountIds] = useState<string[]>([]);
  const [editAccountId, setEditAccountId] = useState<string | null>(null);
  const [linkPopupOpen, setLinkPopupOpen] = useState(false);
  const [createAccountPanelOpen, setCreateAccountPanelOpen] = useState(false);
  const [isLinkingProfile, startLinkProfile] = useTransition();
  const [isTransitioningStatus, startTransition] = useTransition();
  const [isUpdatingRole, startUpdateRole] = useTransition();
  const [roleOptions, setRoleOptions] = useState<SelectOption[]>([]);

  useEffect(() => {
    let cancelled = false;
    listOrgRolesAction({ orgSlug }).then((result) => {
      if (cancelled || !result.ok) return;
      const sorted = [...result.data.roles].sort((a, b) => {
        if (a.source !== b.source) return a.source === "default" ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
      setRoleOptions(sorted.map((r) => ({ value: r.roleKey, label: r.label })));
    });
    return () => {
      cancelled = true;
    };
  }, [orgSlug]);

  const accountById = useMemo(() => {
    const map = new Map<string, PeopleDirectoryAccount>();
    for (const account of accounts) map.set(account.userId, account);
    return map;
  }, [accounts]);

  const profileEntryById = useMemo(() => {
    const map = new Map<string, ProfileEntry>();
    for (const account of accounts) {
      for (const entry of account.profiles) {
        map.set(entry.profile.id, entry);
      }
    }
    return map;
  }, [accounts]);

  function openAccountPanel(userId: string) {
    setOpenAccountIds((current) => (current.includes(userId) ? current : [...current, userId]));
  }
  function closeAccountPanel(userId: string) {
    setOpenAccountIds((current) => current.filter((id) => id !== userId));
  }
  function openProfilePanel(profileId: string) {
    setOpenProfileIds((current) => (current.includes(profileId) ? current : [...current, profileId]));
  }
  function closeProfilePanel(profileId: string) {
    setOpenProfileIds((current) => current.filter((id) => id !== profileId));
  }

  function handleRoleChange(userId: string, nextRole: string) {
    if (!canWritePeople) return;
    startUpdateRole(async () => {
      const result = await updateAccountRoleAction({ orgSlug, userId, role: nextRole });
      if (!result.ok) {
        toast({ title: "Could not update role", description: result.error, variant: "destructive" });
        return;
      }
      setAccounts((current) => current.map((row) => (row.userId === userId ? { ...row, role: result.data.role } : row)));
      toast({ title: "Role updated", variant: "success" });
    });
  }

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
        renderCell: (row) => <Chip variant="neutral">{row.role}</Chip>,
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
        label: "Profiles",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) =>
          row.profiles.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {row.profiles.map((entry) => {
                const relationshipLabels = Array.from(new Set(entry.links.map((link) => relationshipBadgeLabel(link.relationshipType))));
                const metaLabel = relationshipLabels.join(", ");
                const hasSelfLink = entry.links.some((link) => link.relationshipType === "self");

                return (
                  <EntityChip
                    key={entry.profile.id}
                    name={entry.profile.displayName}
                    status={
                      metaLabel.length > 0
                        ? { label: metaLabel, variant: hasSelfLink ? "success" : "neutral" }
                        : undefined
                    }
                  />
                );
              })}
            </div>
          ) : (
            <span className="text-text-muted">—</span>
          ),
        renderSortValue: (row) => row.profiles.length
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

  function handleLinkProfile(payload: ProfileLinkPayload) {
    if (!canWritePeople) return;
    startLinkProfile(async () => {
      const result = await linkProfileAction({
        orgSlug,
        profileId: payload.profileId,
        relationshipType: payload.relationshipType,
        email: payload.email
      });

      if (!result.ok) {
        toast({ title: "Unable to link profile", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "Profile linked", variant: "success" });
      setLinkPopupOpen(false);
    });
  }

  function handleTransition(profileId: string, nextStatus: PeopleProfileStatus) {
    if (!canWritePeople) return;
    startTransition(async () => {
      const result = await transitionProfileStatusAction({
        orgSlug,
        profileId,
        nextStatus,
        source: "people_sidebar"
      });

      if (!result.ok) {
        toast({ title: "Status update failed", description: result.error, variant: "destructive" });
        return;
      }

      setAccounts((current) =>
        current.map((account) => ({
          ...account,
          profiles: account.profiles.map((entry) =>
            entry.profile.id === result.data.profile.id ? { ...entry, profile: result.data.profile } : entry
          )
        }))
      );

      toast({ title: "Profile status updated", variant: "success" });
    });
  }

  // The data-table only supports a single highlighted row; show whichever account panel was
  // opened most recently. The selection-checkbox column tracks bulk selection separately.
  const lastOpenedAccountId = openAccountIds[openAccountIds.length - 1] ?? null;
  const editAccount = editAccountId ? accountById.get(editAccountId) ?? null : null;

  function renderAccountPanel(account: PeopleDirectoryAccount) {
    const displayName = accountDisplayName(account);
    const canEdit = canWritePeople || account.userId === currentUserId;
    const footer = (
      <>
        <Button disabled={!canWritePeople} onClick={() => setLinkPopupOpen(true)} size="sm" type="button" variant="secondary">
          Link profile
        </Button>
        <Button disabled={!canEdit} onClick={() => setEditAccountId(account.userId)} size="sm" variant="secondary">
          Edit account
        </Button>
      </>
    );
    return (
      <Panel
        footer={footer}
        headerAvatarAlt={displayName}
        headerAvatarSlot={
          <EditableAvatar
            ariaLabel="Change profile picture"
            disabled={!canEdit}
            name={displayName}
            onSelect={async (result) => {
              const asset = await saveProfilePhoto(result, { orgSlug, targetUserId: account.userId });
              setAccounts((current) =>
                current.map((row) =>
                  row.userId === account.userId
                    ? { ...row, avatarPath: asset.path, avatarUrl: asset.publicUrl }
                    : row
                )
              );
              toast({ title: "Profile picture updated", variant: "success" });
              router.refresh();
            }}
            sizePx={44}
            src={account.avatarUrl ?? null}
          />
        }
        headerAvatarUrl={account.avatarUrl ?? null}
        headerShowAvatar
        key={`account-${account.userId}`}
        onClose={() => closeAccountPanel(account.userId)}
        open
        panelKey={`people-account-detail:${account.userId}`}
        subtitle={account.email ?? account.userId}
        title={displayName}
      >
        <div className="space-y-4">
          <div className="-mx-5 space-y-4 md:-mx-6">
            <PersonCard
              badges={[
                <Chip key="role" variant="neutral">
                  {account.role}
                </Chip>,
                <Chip key="status" variant={account.status === "active" ? "success" : "warning"}>
                  {account.status}
                </Chip>
              ]}
              layout="panel-edge"
              name={displayName}
              showIdentityHeader={false}
              sections={[
                {
                  key: "identity",
                  title: "Identity",
                  content: (
                    <div className="space-y-1 text-sm">
                      <p>
                        <span className="font-semibold">User ID:</span> {account.userId}
                      </p>
                      <p>
                        <span className="font-semibold">Phone:</span> {account.phone ?? "Unknown"}
                      </p>
                      <p>
                        <span className="font-semibold">Joined:</span> {account.joinedAt ?? "Unknown"}
                      </p>
                      <p>
                        <span className="font-semibold">Last activity:</span> {account.lastActivityAt ?? "Unknown"}
                      </p>
                    </div>
                  )
                },
                {
                  key: "profiles",
                  title: "Attached Profiles",
                  content: (
                    <div className="space-y-2">
                      {account.profiles.length === 0 ? <p className="text-sm text-text-muted">No linked profiles.</p> : null}
                      {account.profiles.map((entry) => (
                        <Button
                          key={entry.profile.id}
                          onClick={() => openProfilePanel(entry.profile.id)}
                          size="sm"
                          variant={openProfileIds.includes(entry.profile.id) ? "primary" : "secondary"}
                        >
                          {entry.profile.displayName} · {entry.profile.profileType}
                        </Button>
                      ))}
                    </div>
                  )
                },
                {
                  key: "activity",
                  title: "Activity",
                  content: <p className="text-sm text-text-muted">This account has {account.profiles.length} attached profiles.</p>
                }
              ]}
              subtitle="Account"
            />

            {account.profiles.length === 0 ? <Alert variant="info">No linked profiles yet.</Alert> : null}
          </div>

          {canWritePeople && roleOptions.length > 0 ? (
            <FormField hint="Changes apply immediately." label="Role">
              <Select
                disabled={isUpdatingRole}
                onChange={(event) => handleRoleChange(account.userId, event.target.value)}
                options={roleOptions}
                value={account.role}
              />
            </FormField>
          ) : null}
        </div>
      </Panel>
    );
  }

  function renderProfilePanel(entry: ProfileEntry) {
    const isSelf = entry.links.some((link) => link.relationshipType === "self");
    const badges = [
      <Chip key="type" variant="neutral">
        {entry.profile.profileType}
      </Chip>,
      <Chip key="status" variant={statusBadgeVariant(entry.profile.status)}>
        {entry.profile.status}
      </Chip>,
      ...entry.links.map((link) => (
        <Chip key={link.id} variant={link.relationshipType === "self" ? "success" : "neutral"}>
          {relationshipBadgeLabel(link.relationshipType)}
        </Chip>
      )),
      ...(isSelf
        ? [
            <Chip key="you" variant="success">
              You
            </Chip>
          ]
        : [])
    ];
    const footer = (
      <>
        <Button
          disabled={!canWritePeople || isTransitioningStatus || entry.profile.status === "active"}
          onClick={() => handleTransition(entry.profile.id, "active")}
          size="sm"
          variant="secondary"
        >
          Activate
        </Button>
        <Button
          disabled={!canWritePeople || isTransitioningStatus || entry.profile.status === "archived"}
          onClick={() => handleTransition(entry.profile.id, "archived")}
          size="sm"
          variant="ghost"
        >
          Archive
        </Button>
      </>
    );
    return (
      <Panel
        footer={footer}
        headerAvatarAlt={entry.profile.displayName}
        headerShowAvatar
        key={`profile-${entry.profile.id}`}
        onClose={() => closeProfilePanel(entry.profile.id)}
        open
        panelKey={`people-profile-detail:${entry.profile.id}`}
        subtitle={`${entry.profile.profileType} profile`}
        title={entry.profile.displayName}
      >
        <div className="-mx-5 space-y-4 md:-mx-6">
          <PersonCard
            badges={badges}
            layout="panel-edge"
            showIdentityHeader={false}
            name={entry.profile.displayName}
            sections={[
              {
                key: "identity",
                title: "Identity",
                content: (
                  <div className="space-y-1 text-sm">
                    <p>
                      <span className="font-semibold">Profile ID:</span> {entry.profile.id}
                    </p>
                    <p>
                      <span className="font-semibold">DOB:</span> {entry.profile.dob ?? "Not set"}
                    </p>
                  </div>
                )
              },
              {
                key: "relationships",
                title: "Relationships",
                content: (
                  <div className="space-y-1 text-sm">
                    {entry.links.map((link) => (
                      <p key={link.id}>
                        {relationshipBadgeLabel(link.relationshipType)} · {link.canManage ? "Can manage" : "Read only"}
                      </p>
                    ))}
                  </div>
                )
              },
              {
                key: "activity",
                title: "Activity",
                content: <p className="text-sm text-text-muted">Last updated {new Date(entry.profile.updatedAt).toLocaleString()}</p>
              }
            ]}
            subtitle={`${entry.profile.profileType} profile`}
          />
        </div>
      </Panel>
    );
  }

  return (
    <>
      {loadError ? <Alert variant="warning">{loadError}</Alert> : null}

      <Card className="app-card-fill">
        <CardHeader className="app-card-fill__header">
          <CardHeaderRow
            actions={
              <Button disabled={!canWritePeople} onClick={() => setCreateAccountPanelOpen(true)} type="button">
                Add account
              </Button>
            }
            description="Top-level account identities with nested linked profiles."
            title="Accounts"
          />
        </CardHeader>
        <CardContent className="app-card-fill__content px-5 pb-5 pt-2 md:px-6 md:pb-6">
          <DataTable
            ariaLabel="People accounts"
            columns={accountColumns}
            data={accounts}
            defaultSort={{ columnKey: "email", direction: "asc" }}
            emptyState="No accounts found."
            enableRowSelection
            onRowClick={(row) => openAccountPanel(row.userId)}
            onSelectedRowKeysChange={setSelectedAccountIds}
            rowKey={(row) => row.userId}
            searchPlaceholder="Search accounts"
            selectedRowKey={lastOpenedAccountId}
            selectedRowKeys={selectedAccountIds}
            storageKey={`people-accounts-table:${orgSlug}`}
          />
        </CardContent>
      </Card>

      {openAccountIds
        .map((userId) => accountById.get(userId))
        .filter((account): account is PeopleDirectoryAccount => Boolean(account))
        .map((account) => renderAccountPanel(account))}

      {openProfileIds
        .map((profileId) => profileEntryById.get(profileId))
        .filter((entry): entry is ProfileEntry => Boolean(entry))
        .map((entry) => renderProfilePanel(entry))}

      <ProfileLinkPopup
        loading={isLinkingProfile}
        onClose={() => setLinkPopupOpen(false)}
        onSubmit={handleLinkProfile}
        open={linkPopupOpen}
      />

      <AccountCreatePanel
        onClose={() => setCreateAccountPanelOpen(false)}
        open={createAccountPanelOpen}
        orgSlug={orgSlug}
      />

      <AccountEditPanel
        email={editAccount?.email}
        initialAvatarPath={editAccount?.avatarPath ?? null}
        initialAvatarUrl={editAccount?.avatarUrl ?? null}
        initialFirstName={editAccount?.firstName ?? null}
        initialLastName={editAccount?.lastName ?? null}
        onClose={() => setEditAccountId(null)}
        onSaved={(account) => {
          setAccounts((current) =>
            current.map((row) =>
              row.userId === account.userId
                ? {
                    ...row,
                    email: account.email ?? row.email,
                    firstName: account.firstName,
                    lastName: account.lastName,
                    avatarPath: account.avatarPath
                  }
                : row
            )
          );
        }}
        open={editAccountId !== null}
        orgSlug={orgSlug}
        panelKey="people-account-edit"
        targetUserId={editAccount?.userId}
      />
    </>
  );
}
