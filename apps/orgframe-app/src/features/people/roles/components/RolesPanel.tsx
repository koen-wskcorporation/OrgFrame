"use client";

import { useEffect, useState } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { Section } from "@orgframe/ui/primitives/section";
import { RoleWizard } from "@/src/features/people/roles/components/RoleWizard";
import {
  listOrgRoleMembershipsAction,
  type OrgRoleDefinition,
  type OrgRoleMember
} from "@/src/features/people/roles/actions";

type RolesPanelProps = {
  orgSlug: string;
  initialRoles: OrgRoleDefinition[];
  canManageRoles: boolean;
  loadError: string | null;
};

export function RolesPanel({ orgSlug, initialRoles, canManageRoles, loadError }: RolesPanelProps) {
  const [roles, setRoles] = useState<OrgRoleDefinition[]>(initialRoles);
  const [activeRole, setActiveRole] = useState<OrgRoleDefinition | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const [members, setMembers] = useState<OrgRoleMember[]>([]);
  const [membersLoading, setMembersLoading] = useState(true);
  const [membersError, setMembersError] = useState<string | null>(null);

  const refreshMembers = async () => {
    setMembersLoading(true);
    const result = await listOrgRoleMembershipsAction({ orgSlug });
    if (result.ok) {
      setMembers(result.data.members);
      setMembersError(null);
    } else {
      setMembersError(result.error);
    }
    setMembersLoading(false);
  };

  useEffect(() => {
    void refreshMembers();
  }, [orgSlug]);

  const memberCountByRoleKey = members.reduce<Record<string, number>>((acc, m) => {
    acc[m.roleKey] = (acc[m.roleKey] ?? 0) + 1;
    return acc;
  }, {});

  const handleRoleSaved = (role: OrgRoleDefinition) => {
    setRoles((current) => {
      const without = current.filter((entry) => entry.id !== role.id);
      return [...without, role].sort((a, b) => {
        if (a.source !== b.source) return a.source === "default" ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
    });
    setActiveRole((current) => (current && current.id === role.id ? role : current));
  };

  const handleRoleDeleted = (roleId: string) => {
    setRoles((current) => current.filter((entry) => entry.id !== roleId));
    setActiveRole((current) => (current && current.id === roleId ? null : current));
  };

  return (
    <>
      {canManageRoles ? (
        <Section.Actions>
          <Button intent="add" object="Role" onClick={() => setCreateOpen(true)} />
        </Section.Actions>
      ) : null}

      <div className="ui-stack-page">
        {loadError ? <Alert variant="warning">{loadError}</Alert> : null}

        <Repeater<OrgRoleDefinition>
          disableViewToggle
          fixedView="list"
          getItem={(role) => {
            const memberCount = memberCountByRoleKey[role.roleKey] ?? 0;
            return {
              id: role.id,
              title: role.label,
              meta: (
                <span>{memberCount} {memberCount === 1 ? "member" : "members"}</span>
              ),
              chips: (
                <Chip
                  className={
                    role.source === "default"
                      ? undefined
                      : "border-accent/30 bg-accent/10 text-accent dark:text-accent"
                  }
                  status={false}
                  variant={role.source === "default" ? "neutral" : undefined}
                >
                  {role.source === "default" ? "Built-in" : "Custom"}
                </Chip>
              ),
              primaryAction: (
                <Button
                  intent="manage"
                  object="Role"
                  onClick={() => setActiveRole(role)}
                  size="sm"
                />
              )
            };
          }}
          getSearchValue={(role) => `${role.label} ${role.roleKey}`}
          items={roles}
          searchPlaceholder="Search roles"
        />
      </div>

      {activeRole ? (
        <RoleWizard
          allMembers={members}
          membersLoadError={membersError}
          membersLoading={membersLoading}
          mode="edit"
          onClose={() => setActiveRole(null)}
          onDeleted={handleRoleDeleted}
          onMembersChanged={() => void refreshMembers()}
          onSaved={handleRoleSaved}
          open={activeRole !== null}
          orgSlug={orgSlug}
          role={activeRole}
        />
      ) : null}

      <RoleWizard
        allMembers={members}
        membersLoadError={membersError}
        membersLoading={membersLoading}
        mode="create"
        onClose={() => setCreateOpen(false)}
        onCreated={(role) => {
          handleRoleSaved(role);
          void refreshMembers();
        }}
        onMembersChanged={() => void refreshMembers()}
        open={createOpen}
        orgSlug={orgSlug}
      />
    </>
  );
}
