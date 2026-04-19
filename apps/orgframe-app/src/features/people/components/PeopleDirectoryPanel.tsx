"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowLeft } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Badge } from "@orgframe/ui/primitives/badge";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import { Panel } from "@orgframe/ui/primitives/panel";
import { PersonCard } from "@orgframe/ui/primitives/person-card";
import { PersonChip } from "@orgframe/ui/primitives/person-chip";
import { useToast } from "@orgframe/ui/primitives/toast";
import { AccountEditPopup } from "@/src/features/core/account/components/AccountEditPopup";
import {
  createProfileAction,
  linkProfileAction,
  transitionProfileStatusAction,
  type PeopleDirectoryPageData
} from "@/src/features/people/actions";
import type { PeopleDirectoryAccount, PeopleProfileStatus, PeopleRelationshipType } from "@/src/features/people/types";
import { ProfileCreatePopup, type ProfileCreatePayload } from "@/src/features/people/components/ProfileCreatePopup";
import { ProfileLinkPopup, type ProfileLinkPayload } from "@/src/features/people/components/ProfileLinkPopup";

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

export function PeopleDirectoryPanel({ orgSlug, currentUserId, canWritePeople, loadError, initialAccounts }: PeopleDirectoryPanelProps) {
  const { toast } = useToast();
  const [accounts, setAccounts] = useState(initialAccounts);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [selectedProfileId, setSelectedProfileId] = useState<string | null>(null);
  const [editAccountPopupOpen, setEditAccountPopupOpen] = useState(false);
  const [createPopupOpen, setCreatePopupOpen] = useState(false);
  const [linkPopupOpen, setLinkPopupOpen] = useState(false);
  const [isCreatingProfile, startCreateProfile] = useTransition();
  const [isLinkingProfile, startLinkProfile] = useTransition();
  const [isTransitioningStatus, startTransition] = useTransition();

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
        renderCell: (row) => <Badge variant="neutral">{row.role}</Badge>,
        renderSortValue: (row) => row.role
      },
      {
        key: "status",
        label: "Status",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => <Badge variant={row.status === "active" ? "success" : "warning"}>{row.status}</Badge>,
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
                  <PersonChip
                    key={entry.profile.id}
                    metaLabel={metaLabel.length > 0 ? metaLabel : undefined}
                    metaTone={hasSelfLink ? "success" : "neutral"}
                    name={entry.profile.displayName}
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

  const selectedAccount = useMemo(() => {
    if (!selectedAccountId) {
      return null;
    }

    return accounts.find((account) => account.userId === selectedAccountId) ?? null;
  }, [accounts, selectedAccountId]);

  const selectedProfileEntry = useMemo(() => {
    if (!selectedAccount || !selectedProfileId) {
      return null;
    }

    return selectedAccount.profiles.find((entry) => entry.profile.id === selectedProfileId) ?? null;
  }, [selectedAccount, selectedProfileId]);
  const canEditSelectedAccount = Boolean(selectedAccount && (canWritePeople || selectedAccount.userId === currentUserId));
  const selectedAccountDisplayName =
    selectedAccount && [selectedAccount.firstName, selectedAccount.lastName].filter(Boolean).join(" ").trim().length > 0
      ? [selectedAccount.firstName, selectedAccount.lastName].filter(Boolean).join(" ").trim()
      : (selectedAccount?.email ?? selectedAccount?.userId ?? "Account");
  const panelFooter = selectedAccount
    ? selectedProfileEntry
      ? (
          <>
            <Button
              disabled={!canWritePeople || isTransitioningStatus || selectedProfileEntry.profile.status === "active"}
              onClick={() => handleTransition(selectedProfileEntry.profile.id, "active")}
              size="sm"
              variant="secondary"
            >
              Activate
            </Button>
            <Button
              disabled={!canWritePeople || isTransitioningStatus || selectedProfileEntry.profile.status === "archived"}
              onClick={() => handleTransition(selectedProfileEntry.profile.id, "archived")}
              size="sm"
              variant="ghost"
            >
              Archive
            </Button>
          </>
        )
      : (
          <>
            <Button disabled={!canWritePeople} onClick={() => setLinkPopupOpen(true)} size="sm" type="button" variant="secondary">
              Link profile
            </Button>
            <Button disabled={!canEditSelectedAccount} onClick={() => setEditAccountPopupOpen(true)} size="sm" variant="secondary">
              Edit account
            </Button>
          </>
        )
    : null;
  const panelTitle = selectedProfileEntry ? selectedProfileEntry.profile.displayName : selectedAccountDisplayName;
  const panelSubtitle = selectedAccount?.email ?? (selectedProfileEntry ? `${selectedProfileEntry.profile.profileType} profile` : selectedAccount?.userId ?? null);
  const panelHeaderTopAction = selectedProfileEntry ? (
    <Button onClick={() => setSelectedProfileId(null)} size="sm" variant="secondary">
      <ArrowLeft className="h-3.5 w-3.5" />
      Back to account
    </Button>
  ) : undefined;

  function refreshAccounts(next: PeopleDirectoryPageData["directory"]["accounts"]) {
    setAccounts(next);
  }

  function handleCreateProfile(payload: ProfileCreatePayload) {
    if (!canWritePeople) {
      return;
    }

    startCreateProfile(async () => {
      const result = await createProfileAction({
        orgSlug,
        accountUserId: payload.accountUserId,
        profileType: payload.profileType,
        displayName: payload.displayName,
        firstName: payload.firstName,
        lastName: payload.lastName,
        dob: payload.dob
      });

      if (!result.ok) {
        toast({ title: "Unable to create profile", description: result.error, variant: "destructive" });
        return;
      }

      refreshAccounts(result.data.directory.accounts);
      setCreatePopupOpen(false);
      toast({ title: "Profile created", variant: "success" });
    });
  }

  function handleLinkProfile(payload: ProfileLinkPayload) {
    if (!canWritePeople) {
      return;
    }

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
    if (!canWritePeople) {
      return;
    }

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
            entry.profile.id === result.data.profile.id
              ? {
                  ...entry,
                  profile: result.data.profile
                }
              : entry
          )
        }))
      );

      toast({ title: "Profile status updated", variant: "success" });
    });
  }

  return (
    <div className="ui-stack-page">
      {loadError ? <Alert variant="warning">{loadError}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Profiles</CardTitle>
          <CardDescription>Create and link universal player or staff profiles.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button disabled={!canWritePeople} onClick={() => setCreatePopupOpen(true)} type="button">
              Create profile
            </Button>
            <Button disabled={!canWritePeople} onClick={() => setLinkPopupOpen(true)} type="button" variant="secondary">
              Link profile
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Accounts</CardTitle>
          <CardDescription>Top-level account identities with nested linked profiles.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-2 md:px-6 md:pb-6">
          <DataTable
            ariaLabel="People accounts"
            columns={accountColumns}
            data={accounts}
            defaultSort={{
              columnKey: "email",
              direction: "asc"
            }}
            emptyState="No accounts found."
            onRowClick={(row) => {
              setSelectedAccountId(row.userId);
              setSelectedProfileId(null);
            }}
            rowKey={(row) => row.userId}
            searchPlaceholder="Search accounts"
            selectedRowKey={selectedAccountId}
            storageKey={`people-accounts-table:${orgSlug}`}
          />
        </CardContent>
      </Card>

      <Panel
        footer={panelFooter}
        onClose={() => {
          setSelectedAccountId(null);
          setSelectedProfileId(null);
        }}
        open={Boolean(selectedAccount)}
        headerAvatarAlt={selectedAccountDisplayName}
        headerAvatarUrl={selectedAccount?.avatarUrl ?? null}
        headerShowAvatar
        headerTopAction={panelHeaderTopAction}
        subtitle={panelSubtitle}
        title={panelTitle}
      >
        {selectedAccount ? (
          <div className="space-y-4">
            {selectedProfileEntry ? (
              <div className="-mx-5 space-y-4 md:-mx-6">
                {(() => {
                  const entry = selectedProfileEntry;
                  const isSelf = entry.links.some((link) => link.relationshipType === "self");
                  const badges = [
                    <Badge key="type" variant="neutral">
                      {entry.profile.profileType}
                    </Badge>,
                    <Badge key="status" variant={statusBadgeVariant(entry.profile.status)}>
                      {entry.profile.status}
                    </Badge>,
                    ...entry.links.map((link) => (
                      <Badge key={link.id} variant={link.relationshipType === "self" ? "success" : "neutral"}>
                        {relationshipBadgeLabel(link.relationshipType)}
                      </Badge>
                    )),
                    ...(isSelf
                      ? [
                          <Badge key="you" variant="success">
                            You
                          </Badge>
                        ]
                      : [])
                  ];

                  return (
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
                  );
                })()}
              </div>
            ) : (
              <div className="-mx-5 space-y-4 md:-mx-6">
                <PersonCard
                  badges={[
                    <Badge key="role" variant="neutral">
                      {selectedAccount.role}
                    </Badge>,
                    <Badge key="status" variant={selectedAccount.status === "active" ? "success" : "warning"}>
                      {selectedAccount.status}
                    </Badge>
                  ]}
                  layout="panel-edge"
                  name={selectedAccountDisplayName}
                  showIdentityHeader={false}
                  sections={[
                    {
                      key: "identity",
                      title: "Identity",
                      content: (
                        <div className="space-y-1 text-sm">
                          <p>
                            <span className="font-semibold">User ID:</span> {selectedAccount.userId}
                          </p>
                          <p>
                            <span className="font-semibold">Phone:</span> {selectedAccount.phone ?? "Unknown"}
                          </p>
                          <p>
                            <span className="font-semibold">Joined:</span> {selectedAccount.joinedAt ?? "Unknown"}
                          </p>
                          <p>
                            <span className="font-semibold">Last activity:</span> {selectedAccount.lastActivityAt ?? "Unknown"}
                          </p>
                        </div>
                      )
                    },
                    {
                      key: "profiles",
                      title: "Attached Profiles",
                      content: (
                        <div className="space-y-2">
                          {selectedAccount.profiles.length === 0 ? <p className="text-sm text-text-muted">No linked profiles.</p> : null}
                          {selectedAccount.profiles.map((entry) => (
                            <Button key={entry.profile.id} onClick={() => setSelectedProfileId(entry.profile.id)} size="sm" variant="secondary">
                              {entry.profile.displayName} · {entry.profile.profileType}
                            </Button>
                          ))}
                        </div>
                      )
                    },
                    {
                      key: "activity",
                      title: "Activity",
                      content: <p className="text-sm text-text-muted">This account has {selectedAccount.profiles.length} attached profiles.</p>
                    }
                  ]}
                  subtitle="Account"
                />

                {selectedAccount.profiles.length === 0 ? <Alert variant="info">No linked profiles yet.</Alert> : null}
              </div>
            )}
          </div>
        ) : null}
      </Panel>

      <ProfileCreatePopup
        canSetAccountUserId
        loading={isCreatingProfile}
        onClose={() => setCreatePopupOpen(false)}
        onSubmit={handleCreateProfile}
        open={createPopupOpen}
        subtitle="Create a universal profile that can be attached to one or more accounts."
        title="Create profile"
      />

      <ProfileLinkPopup
        loading={isLinkingProfile}
        onClose={() => setLinkPopupOpen(false)}
        onSubmit={handleLinkProfile}
        open={linkPopupOpen}
      />

      <AccountEditPopup
        email={selectedAccount?.email}
        initialAvatarPath={selectedAccount?.avatarPath ?? null}
        initialFirstName={selectedAccount?.firstName ?? null}
        initialLastName={selectedAccount?.lastName ?? null}
        onClose={() => setEditAccountPopupOpen(false)}
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
        open={editAccountPopupOpen}
        orgSlug={orgSlug}
        submitLabel="Save Account"
        targetUserId={selectedAccount?.userId}
        title="Edit account details"
      />
    </div>
  );
}
