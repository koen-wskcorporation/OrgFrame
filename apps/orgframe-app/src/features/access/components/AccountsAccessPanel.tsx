"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { Eye, KeyRound, Trash2 } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Select, type SelectOption } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { can } from "@/src/shared/permissions/can";
import { getRoleLabel, isAdminLikeRole, type OrgRole, type Permission } from "@/src/features/core/access";
import {
  inviteUserToOrgAction,
  removeMembershipAction,
  sendPasswordResetAction,
  updateMembershipRoleAction,
  type AccessMember,
  type AccessRoleDefinition
} from "@/src/features/access/actions";

type AccountsAccessPanelProps = {
  orgSlug: string;
  currentUserRole: OrgRole;
  currentUserPermissions: Permission[];
  members: AccessMember[];
  roles: AccessRoleDefinition[];
  loadError: string | null;
  serviceRoleConfigured: boolean;
};

function roleBadgeVariant(role: OrgRole) {
  if (isAdminLikeRole(role)) {
    return "success";
  }

  return "neutral";
}

function statusBadgeVariant(status: AccessMember["status"]) {
  return status === "active" ? "success" : "warning";
}

function statusLabel(status: AccessMember["status"]) {
  return status === "active" ? "active" : "pending";
}

function canEditAdminMembership(currentUserRole: OrgRole, memberRole: OrgRole) {
  return isAdminLikeRole(currentUserRole) || !isAdminLikeRole(memberRole);
}

function toAssignableRole(role: OrgRole): OrgRole {
  return isAdminLikeRole(role) ? "admin" : "member";
}

function formatDateTime(value: string | null, formatter: Intl.DateTimeFormat) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  const parts = formatter.formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  const year = parts.find((part) => part.type === "year")?.value;
  const hour = parts.find((part) => part.type === "hour")?.value;
  const minute = parts.find((part) => part.type === "minute")?.value;
  const dayPeriod = parts.find((part) => part.type === "dayPeriod")?.value;

  if (!month || !day || !year || !hour || !minute || !dayPeriod) {
    return "-";
  }

  return `${month} ${day}, ${year} at ${hour}:${minute} ${dayPeriod}`;
}

function getDefaultInviteRole(options: SelectOption[]) {
  if (options.some((option) => option.value === "member")) {
    return "member";
  }

  return options[0]?.value ?? "member";
}

export function AccountsAccessPanel({
  orgSlug,
  currentUserRole,
  currentUserPermissions,
  members,
  roles,
  loadError,
  serviceRoleConfigured
}: AccountsAccessPanelProps) {
  const { toast } = useToast();
  const [membersState, setMembersState] = useState(members);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("member");
  const [roleDraftByMembershipId, setRoleDraftByMembershipId] = useState<Record<string, OrgRole>>({});
  const [removeTarget, setRemoveTarget] = useState<AccessMember | null>(null);
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(null);
  const [isInviting, startInviteTransition] = useTransition();
  const [isRemoving, startRemoveTransition] = useTransition();
  const [activeRoleSaveId, setActiveRoleSaveId] = useState<string | null>(null);
  const [activeResetMembershipId, setActiveResetMembershipId] = useState<string | null>(null);

  const dateFormatter = useMemo(
    () =>
      new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        hour12: true,
        timeZone: "UTC"
      }),
    []
  );

  const roleByKey = useMemo(() => {
    return new Map(roles.map((role) => [role.roleKey, role]));
  }, [roles]);

  const assignableRoleOptions = useMemo<SelectOption[]>(
    () =>
      roles.map((role) => ({
        value: role.roleKey,
        label: role.label
      })),
    [roles]
  );

  const nonAdminRoleOptions = useMemo(
    () => assignableRoleOptions.filter((option) => option.value !== "admin"),
    [assignableRoleOptions]
  );

  const canManageActions = serviceRoleConfigured && !loadError && can(currentUserPermissions, "org.manage.read");

  const selectedMember = useMemo(() => {
    if (!selectedMembershipId) {
      return null;
    }

    return membersState.find((member) => member.membershipId === selectedMembershipId) ?? null;
  }, [membersState, selectedMembershipId]);

  useEffect(() => {
    if (assignableRoleOptions.length === 0) {
      return;
    }

    const inviteRoleStillValid = assignableRoleOptions.some((option) => option.value === inviteRole);

    if (!inviteRoleStillValid) {
      setInviteRole(getDefaultInviteRole(assignableRoleOptions));
    }
  }, [assignableRoleOptions, inviteRole]);

  useEffect(() => {
    setMembersState(members);
  }, [members]);

  useEffect(() => {
    setRoleDraftByMembershipId(
      membersState.reduce<Record<string, OrgRole>>((drafts, member) => {
        drafts[member.membershipId] = toAssignableRole(member.role);
        return drafts;
      }, {})
    );
  }, [membersState]);

  useEffect(() => {
    if (!selectedMembershipId) {
      return;
    }

    const stillExists = membersState.some((member) => member.membershipId === selectedMembershipId);

    if (!stillExists) {
      setSelectedMembershipId(null);
    }
  }, [membersState, selectedMembershipId]);

  const resolveRoleLabel = useCallback(
    (roleKey: OrgRole) => {
      return roleByKey.get(roleKey)?.label ?? getRoleLabel(roleKey);
    },
    [roleByKey]
  );

  function getRoleOptions(member: AccessMember) {
    if (isAdminLikeRole(currentUserRole)) {
      return assignableRoleOptions;
    }

    if (isAdminLikeRole(member.role)) {
      return [{ value: "admin", label: resolveRoleLabel("admin") }];
    }

    return nonAdminRoleOptions;
  }

  const displayUser = useCallback((member: AccessMember) => {
    if (member.email) {
      return member.email;
    }

    return member.userId;
  }, []);

  function handleInviteSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!canManageActions) {
      return;
    }

    startInviteTransition(async () => {
      const result = await inviteUserToOrgAction({
        orgSlug,
        email: inviteEmail,
        role: inviteRole
      });

      if (!result.ok) {
        toast({
          title: "Invite failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Invite sent",
        variant: "success"
      });
      setInviteEmail("");
      setInviteRole(getDefaultInviteRole(assignableRoleOptions));
      setMembersState(result.data.members);
    });
  }

  function handleRoleSave(member: AccessMember) {
    if (!canManageActions) {
      return;
    }

    const currentRole = toAssignableRole(member.role);
    const nextRole = roleDraftByMembershipId[member.membershipId] ?? currentRole;

    if (nextRole === currentRole) {
      toast({
        title: "No changes to save",
        variant: "info"
      });
      return;
    }

    setActiveRoleSaveId(member.membershipId);

    void (async () => {
      const result = await updateMembershipRoleAction({
        orgSlug,
        membershipId: member.membershipId,
        role: nextRole
      });

      setActiveRoleSaveId(null);

      if (!result.ok) {
        toast({
          title: "Role update failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Role updated",
        variant: "success"
      });
      setMembersState(result.data.members);
    })();
  }

  function handleSendReset(member: AccessMember) {
    if (!canManageActions || !member.email) {
      return;
    }

    setActiveResetMembershipId(member.membershipId);

    const redirectTo = `${window.location.origin}/auth`;

    void (async () => {
      const result = await sendPasswordResetAction({
        orgSlug,
        email: member.email ?? "",
        redirectTo
      });

      setActiveResetMembershipId(null);

      if (!result.ok) {
        toast({
          title: "Password reset failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({
        title: "Password reset sent",
        variant: "success"
      });
    })();
  }

  function handleRemoveConfirm() {
    if (!canManageActions || !removeTarget) {
      return;
    }

    startRemoveTransition(async () => {
      const result = await removeMembershipAction({
        orgSlug,
        membershipId: removeTarget.membershipId
      });

      if (!result.ok) {
        toast({
          title: "Remove access failed",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setRemoveTarget(null);
      setSelectedMembershipId(null);
      toast({
        title: "Access removed",
        variant: "success"
      });
      setMembersState(result.data.members);
    });
  }

  const memberTableColumns = useMemo<DataTableColumn<AccessMember>[]>(
    () => [
      {
        key: "user",
        label: "User",
        defaultVisible: true,
        sortable: true,
        renderCell: (member) => (
          <div className="space-y-1">
            <p className="font-medium">
              {displayUser(member)} {member.isCurrentUser ? "(you)" : ""}
            </p>
          </div>
        ),
        renderSearchValue: (member) => `${displayUser(member)} ${member.userId}`,
        renderSortValue: (member) => displayUser(member)
      },
      {
        key: "role",
        label: "Role",
        defaultVisible: true,
        sortable: true,
        renderCell: (member) => <Chip status={false} variant={roleBadgeVariant(member.role)}>{resolveRoleLabel(member.role)}</Chip>,
        renderSearchValue: (member) => resolveRoleLabel(member.role),
        renderSortValue: (member) => resolveRoleLabel(member.role)
      },
      {
        key: "status",
        label: "Status",
        defaultVisible: true,
        sortable: true,
        renderCell: (member) => <Chip status={false} variant={statusBadgeVariant(member.status)}>{statusLabel(member.status)}</Chip>,
        renderSearchValue: (member) => statusLabel(member.status),
        renderSortValue: (member) => statusLabel(member.status)
      },
      {
        key: "joined",
        label: "Joined",
        defaultVisible: true,
        sortable: true,
        renderCell: (member) => formatDateTime(member.joinedAt, dateFormatter),
        renderSortValue: (member) => (member.joinedAt ? new Date(member.joinedAt).getTime() : 0)
      },
      {
        key: "lastActivity",
        label: "Last activity",
        defaultVisible: true,
        sortable: true,
        renderCell: (member) => formatDateTime(member.lastActivityAt, dateFormatter),
        renderSortValue: (member) => (member.lastActivityAt ? new Date(member.lastActivityAt).getTime() : 0)
      },
      {
        key: "userId",
        label: "User ID",
        defaultVisible: false,
        sortable: true,
        className: "font-mono text-xs",
        renderCell: (member) => member.userId,
        renderSearchValue: (member) => member.userId,
        renderSortValue: (member) => member.userId
      }
    ],
    [dateFormatter, displayUser, resolveRoleLabel]
  );

  function renderMemberRowActions(member: AccessMember) {
    const canEditThisMember = canEditAdminMembership(currentUserRole, member.role);

    return (
      <>
        <Button
          aria-label={`Open ${displayUser(member)}`}
          className="h-7 px-2 text-[11px]"
          onClick={() => setSelectedMembershipId(member.membershipId)}
          size="sm"
          variant="secondary"
        >
          <Eye aria-hidden className="h-3.5 w-3.5" />
          Open
        </Button>
        <Button
          aria-label={`Send password reset to ${displayUser(member)}`}
          className="h-7 px-2 text-[11px]"
          disabled={!canManageActions || !member.email || activeResetMembershipId === member.membershipId}
          loading={activeResetMembershipId === member.membershipId}
          onClick={() => handleSendReset(member)}
          size="sm"
          variant="ghost"
        >
          <KeyRound aria-hidden className="h-3.5 w-3.5" />
          Reset
        </Button>
        <Button
          aria-label={`Remove ${displayUser(member)}`}
          className="ui-button-danger h-7 px-2 text-[11px]"
          disabled={!canManageActions || !canEditThisMember || isRemoving}
          onClick={() => setRemoveTarget(member)}
          size="sm"
          variant="secondary"
        >
          <Trash2 aria-hidden className="h-3.5 w-3.5" />
          Remove
        </Button>
      </>
    );
  }

  const selectedRoleOptions = selectedMember ? getRoleOptions(selectedMember) : [];
  const selectedRoleDraft = selectedMember ? (roleDraftByMembershipId[selectedMember.membershipId] ?? toAssignableRole(selectedMember.role)) : "";
  const selectedRoleValue = selectedRoleOptions.some((option) => option.value === selectedRoleDraft)
    ? selectedRoleDraft
    : (selectedRoleOptions[0]?.value ?? selectedRoleDraft);

  return (
    <div className="ui-stack-page">
      {loadError ? <Alert variant="warning">{loadError}</Alert> : null}

      <Card>
        <CardHeader>
          <CardTitle>Invite user</CardTitle>
          <CardDescription>Add a user by email and assign their initial organization role.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form className="grid gap-3 md:grid-cols-[2fr_1fr_auto]" onSubmit={handleInviteSubmit}>
            <FormField className="md:col-span-1" label="Email">
              <Input
                autoComplete="email"
                disabled={!canManageActions || isInviting}
                onChange={(event) => setInviteEmail(event.target.value)}
                placeholder="name@example.com"
                required
                type="email"
                value={inviteEmail}
              />
            </FormField>

            <FormField className="md:col-span-1" label="Role">
              <Select
                disabled={!canManageActions || isInviting || assignableRoleOptions.length === 0}
                onChange={(event) => {
                  setInviteRole(event.target.value as OrgRole);
                }}
                options={assignableRoleOptions}
                value={inviteRole}
              />
            </FormField>

            <div className="md:pt-[26px]">
              <Button disabled={!canManageActions || isInviting || assignableRoleOptions.length === 0} loading={isInviting} type="submit">
                {isInviting ? "Sending..." : "Send Invite"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>Drag header handles to reorder columns, and click rows to open member details.</CardDescription>
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-2 md:px-6 md:pb-6">
          <DataTable
            ariaLabel="Organization members"
            columns={memberTableColumns}
            data={membersState}
            defaultSort={{
              columnKey: "user",
              direction: "asc"
            }}
            emptyState="No org members found."
            onRowClick={(member) => setSelectedMembershipId(member.membershipId)}
            renderRowActions={renderMemberRowActions}
            rowActionsLabel="Quick actions"
            rowKey={(member) => member.membershipId}
            searchPlaceholder="Search"
            selectedRowKey={selectedMembershipId}
            storageKey={`accounts-access-table:${orgSlug}`}
          />
        </CardContent>
      </Card>

      <Panel
        footer={
          selectedMember ? (
            <div className="flex flex-wrap justify-end gap-2">
              <Button
                disabled={!canManageActions || !canEditAdminMembership(currentUserRole, selectedMember.role) || activeRoleSaveId === selectedMember.membershipId}
                loading={activeRoleSaveId === selectedMember.membershipId}
                onClick={() => handleRoleSave(selectedMember)}
                variant="secondary"
              >
                {activeRoleSaveId === selectedMember.membershipId ? "Saving..." : "Save Role"}
              </Button>
              <Button
                disabled={!canManageActions || !selectedMember.email || activeResetMembershipId === selectedMember.membershipId}
                loading={activeResetMembershipId === selectedMember.membershipId}
                onClick={() => handleSendReset(selectedMember)}
                variant="ghost"
              >
                {activeResetMembershipId === selectedMember.membershipId ? "Sending..." : "Send Password Reset"}
              </Button>
              <Button
                className="ui-button-danger"
                disabled={!canManageActions || !canEditAdminMembership(currentUserRole, selectedMember.role) || isRemoving}
                onClick={() => setRemoveTarget(selectedMember)}
                variant="secondary"
              >
                Remove access
              </Button>
            </div>
          ) : null
        }
        onClose={() => {
          if (!isRemoving) {
            setSelectedMembershipId(null);
          }
        }}
        open={Boolean(selectedMember)}
        subtitle="Manage role, account recovery, and access for this user."
        title={selectedMember ? displayUser(selectedMember) : "Member profile"}
      >
        {selectedMember ? (
          <div className="space-y-4">
            <Card className="shadow-none">
              <CardContent className="grid gap-3 py-5 md:grid-cols-2">
                <div>
                  <p className="ui-kv-label">Status</p>
                  <Chip status={false} className="mt-1" variant={statusBadgeVariant(selectedMember.status)}>
                    {statusLabel(selectedMember.status)}
                  </Chip>
                </div>
                <div>
                  <p className="ui-kv-label">Role</p>
                  <Chip status={false} className="mt-1" variant={roleBadgeVariant(selectedMember.role)}>
                    {resolveRoleLabel(selectedMember.role)}
                  </Chip>
                </div>
                <div>
                  <p className="ui-kv-label">Joined</p>
                  <p className="mt-1 ui-kv-value">{formatDateTime(selectedMember.joinedAt, dateFormatter)}</p>
                </div>
                <div>
                  <p className="ui-kv-label">Last activity</p>
                  <p className="mt-1 ui-kv-value">{formatDateTime(selectedMember.lastActivityAt, dateFormatter)}</p>
                </div>
                <div className="md:col-span-2">
                  <p className="ui-kv-label">User ID</p>
                  <p className="mt-1 break-all font-mono text-xs text-text-muted">{selectedMember.userId}</p>
                </div>
              </CardContent>
            </Card>

            <div className="grid gap-3">
              <FormField label="Change role">
                <Select
                  disabled={!canManageActions || !canEditAdminMembership(currentUserRole, selectedMember.role) || activeRoleSaveId === selectedMember.membershipId}
                  onChange={(event) => {
                    setRoleDraftByMembershipId((current) => ({
                      ...current,
                      [selectedMember.membershipId]: event.target.value as OrgRole
                    }));
                  }}
                  options={selectedRoleOptions}
                  value={selectedRoleValue}
                />
              </FormField>
            </div>
          </div>
        ) : null}
      </Panel>

      <Popup
        footer={
          <>
            <Button disabled={isRemoving} onClick={() => setRemoveTarget(null)} variant="ghost">
              Cancel
            </Button>
            <Button className="ui-button-danger" disabled={isRemoving} loading={isRemoving} onClick={handleRemoveConfirm} variant="secondary">
              {isRemoving ? "Removing..." : "Confirm remove"}
            </Button>
          </>
        }
        onClose={() => {
          if (!isRemoving) {
            setRemoveTarget(null);
          }
        }}
        open={Boolean(removeTarget)}
        size="sm"
        subtitle={removeTarget ? `Remove ${displayUser(removeTarget)} from this organization?` : "Remove this membership?"}
        title="Remove access"
      >
        <div className="space-y-2 text-sm text-text-muted">
          <p>This action removes this account from the organization workspace immediately.</p>
          <p>They can only regain access if invited again.</p>
        </div>
      </Popup>
    </div>
  );
}
