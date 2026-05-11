"use client";

import { useMemo, useState } from "react";
import { Trash2 } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { CreateWizard, type CreateWizardSubmitResult, type WizardStep } from "@/src/shared/components/CreateWizard";
import {
  isReservedOrgRoleKey,
  isValidRoleKey,
  normalizeRoleKey,
  permissionDefinitions,
  type Permission,
  type PermissionDefinition
} from "@/src/features/core/access";
import {
  assignRoleToMembersAction,
  createOrgRoleAction,
  deleteOrgRoleAction,
  unassignRoleFromMemberAction,
  updateOrgRoleAction,
  type OrgRoleDefinition,
  type OrgRoleMember
} from "@/src/features/people/roles/actions";

type SharedProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  allMembers: OrgRoleMember[];
  membersLoading?: boolean;
  membersLoadError?: string | null;
  onMembersChanged?: () => void;
};

type CreateProps = SharedProps & {
  mode: "create";
  onCreated?: (role: OrgRoleDefinition) => void;
};

type EditProps = SharedProps & {
  mode: "edit";
  role: OrgRoleDefinition;
  onSaved?: (role: OrgRoleDefinition) => void;
  onDeleted?: (roleId: string) => void;
};

type RoleWizardProps = CreateProps | EditProps;

type WizardState = {
  label: string;
  permissions: Permission[];
  memberUserIds: string[];
};

type PermissionGroupItem = {
  group: string;
  permissions: PermissionDefinition[];
};

const permissionGroups: PermissionGroupItem[] = (() => {
  const byGroup = new Map<string, PermissionDefinition[]>();
  const order: string[] = [];
  for (const def of permissionDefinitions) {
    if (!byGroup.has(def.group)) {
      byGroup.set(def.group, []);
      order.push(def.group);
    }
    byGroup.get(def.group)!.push(def);
  }
  return order.map((group) => ({ group, permissions: byGroup.get(group)! }));
})();

export function RoleWizard(props: RoleWizardProps) {
  const { toast } = useToast();
  const { open, onClose, orgSlug, allMembers, membersLoading, membersLoadError, onMembersChanged } = props;
  const isEdit = props.mode === "edit";
  const role = isEdit ? props.role : null;
  const editable = role?.editable ?? !isEdit;
  const deletable = role?.deletable ?? false;

  // Don't depend on `allMembers` here. In edit mode the People step's
  // selected values come from `allMembers` directly via the Select `values`
  // prop, so this memo only needs role identity. Adding `allMembers` here
  // makes every server refresh return a new `initialState` reference, which
  // triggers CreateWizard's reset-on-open effect and snaps the user back
  // to the Name step mid-selection.
  const initialState = useMemo<WizardState>(() => {
    if (isEdit && role) {
      return {
        label: role.label,
        permissions: role.permissions,
        memberUserIds: []
      };
    }
    return { label: "", permissions: [], memberUserIds: [] };
  }, [isEdit, role]);

  const [deleting, setDeleting] = useState(false);

  const liveAddMember = async (userId: string) => {
    if (!isEdit || !role) return;
    const result = await assignRoleToMembersAction({ orgSlug, roleKey: role.roleKey, userIds: [userId] });
    if (!result.ok) {
      toast({ title: "Could not add member", description: result.error, variant: "destructive" });
      return;
    }
    onMembersChanged?.();
  };

  const liveRemoveMember = async (userId: string) => {
    if (!isEdit || !role) return;
    const result = await unassignRoleFromMemberAction({ orgSlug, userId });
    if (!result.ok) {
      toast({ title: "Could not remove member", description: result.error, variant: "destructive" });
      return;
    }
    onMembersChanged?.();
  };

  const handleDelete = async () => {
    if (!isEdit || !role || !deletable || deleting) return;
    if (!window.confirm(`Delete the "${role.label}" role? Members holding this role will be moved to the default member role.`)) {
      return;
    }
    setDeleting(true);
    const result = await deleteOrgRoleAction({ orgSlug, roleId: role.id });
    setDeleting(false);
    if (!result.ok) {
      toast({ title: "Could not delete role", description: result.error, variant: "destructive" });
      return;
    }
    toast({ title: "Role deleted", variant: "success" });
    props.onDeleted?.(result.data.deletedId);
    onMembersChanged?.();
    onClose();
  };

  const steps: WizardStep<WizardState>[] = useMemo(() => [
    {
      id: "identity",
      label: "Name",
      description: editable
        ? "Give the role a clear name."
        : "Built-in role. The name and permissions are managed by OrgFrame.",
      validate: (state) => {
        if (!editable) return null;
        const errors: Record<string, string> = {};
        if (state.label.trim().length < 2) {
          errors.label = "Role name must be at least 2 characters.";
        }
        if (!isEdit) {
          const candidateKey = normalizeRoleKey(state.label);
          if (!candidateKey || !isValidRoleKey(candidateKey)) {
            errors.label = "Role name must contain letters so a stable key can be derived.";
          } else if (isReservedOrgRoleKey(candidateKey)) {
            errors.label = `"${state.label}" conflicts with a built-in role. Pick a different name.`;
          }
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField error={fieldErrors.label} label="Role name">
            <Input
              autoFocus
              disabled={!editable}
              onChange={(event) => setField("label", event.target.value)}
              placeholder="Treasurer, Coach, Volunteer..."
              value={state.label}
            />
          </FormField>
          {isEdit && !editable ? (
            <Alert variant="info">
              Built-in roles have a fixed name and permission set. You can still manage who holds this role on the People step.
            </Alert>
          ) : null}
        </div>
      )
    },
    {
      id: "permissions",
      label: "Permissions",
      description: editable
        ? "Pick which capabilities members of this role should have."
        : "Permissions for built-in roles are managed by OrgFrame.",
      render: ({ state, setState }) => {
        const selected = new Set(state.permissions);
        const toggleOne = (perm: Permission) => {
          if (!editable) return;
          setState((current) => {
            const set = new Set(current.permissions);
            if (set.has(perm)) set.delete(perm);
            else set.add(perm);
            return { ...current, permissions: Array.from(set) };
          });
        };
        const setGroupAll = (perms: Permission[], on: boolean) => {
          if (!editable) return;
          setState((current) => {
            const set = new Set(current.permissions);
            if (on) perms.forEach((p) => set.add(p));
            else perms.forEach((p) => set.delete(p));
            return { ...current, permissions: Array.from(set) };
          });
        };
        return (
          <Repeater<PermissionGroupItem>
            disableViewToggle
            fixedView="list"
            getItem={(g) => {
              const groupPerms = g.permissions.map((p) => p.permission);
              const selectedInGroup = groupPerms.filter((p) => selected.has(p));
              const allChecked = selectedInGroup.length === groupPerms.length;
              const someChecked = selectedInGroup.length > 0 && !allChecked;
              return {
                id: g.group,
                title: g.group,
                meta: `${selectedInGroup.length}/${groupPerms.length}`,
                leading: (
                  <Checkbox
                    aria-label={`Select all ${g.group} permissions`}
                    checked={allChecked}
                    disabled={!editable}
                    indeterminate={someChecked}
                    onCheckedChange={(next) => setGroupAll(groupPerms, next)}
                  />
                ),
                body: (
                  <ul className="space-y-3">
                    {g.permissions.map((def) => (
                      <li className="flex items-start gap-3" key={def.permission}>
                        <Checkbox
                          aria-label={def.label}
                          checked={selected.has(def.permission)}
                          className="mt-0.5 flex-none"
                          disabled={!editable}
                          onCheckedChange={() => toggleOne(def.permission)}
                        />
                        <div className="min-w-0">
                          <div className="text-sm font-medium text-text">{def.label}</div>
                          <div className="text-xs text-text-muted">{def.description}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                )
              };
            }}
            getSearchValue={(g) =>
              `${g.group} ${g.permissions.map((p) => `${p.label} ${p.description}`).join(" ")}`
            }
            items={permissionGroups}
            searchPlaceholder="Search permissions"
          />
        );
      }
    },
    {
      id: "people",
      label: "People",
      description: isEdit
        ? "Add or remove members from this role. Changes apply immediately."
        : "Add members to this role now, or skip and assign people later.",
      render: ({ state, setState }) => {
        const liveMode = isEdit;
        const memberRoleKey = role?.roleKey ?? null;
        const builtInMemberRole = memberRoleKey === "member";
        return (
          <div className="space-y-3">
            {builtInMemberRole ? (
              <Alert variant="info">
                Every org member holds this role by default. To grant a more specific role, manage it from that role.
              </Alert>
            ) : null}
            <Select
              disabled={builtInMemberRole}
              multiEmptyMessage={
                liveMode
                  ? "No members hold this role yet."
                  : "No members will be assigned yet. You can add them after creation."
              }
              multiple
              onValuesChange={(next) => {
                if (liveMode) {
                  const currentSelected = new Set(
                    memberRoleKey ? allMembers.filter((m) => m.roleKey === memberRoleKey).map((m) => m.userId) : []
                  );
                  const nextSet = new Set(next);
                  for (const userId of next) {
                    if (!currentSelected.has(userId)) void liveAddMember(userId);
                  }
                  for (const userId of currentSelected) {
                    if (!nextSet.has(userId)) void liveRemoveMember(userId);
                  }
                } else {
                  setState((current) => ({ ...current, memberUserIds: next }));
                }
              }}
              options={allMembers.map((m) => ({
                value: m.userId,
                label: m.displayName,
                subtext: m.email ?? undefined,
                avatar: { name: m.displayName, src: null }
              }))}
              placeholder="Search people to add"
              values={
                liveMode && memberRoleKey
                  ? allMembers.filter((m) => m.roleKey === memberRoleKey).map((m) => m.userId)
                  : state.memberUserIds
              }
            />
            {membersLoadError ? <Alert variant="warning">{membersLoadError}</Alert> : null}
          </div>
        );
      }
    }
  ], [editable, isEdit, allMembers, membersLoading, membersLoadError, role]);

  const handleSubmit = async (state: WizardState): Promise<CreateWizardSubmitResult> => {
    if (isEdit && role) {
      if (!editable) {
        // Built-in role — nothing on Save besides what's been done live on People.
        return { ok: true };
      }
      const result = await updateOrgRoleAction({
        orgSlug,
        roleId: role.id,
        label: state.label,
        permissions: state.permissions
      });
      if (!result.ok) {
        return { ok: false, message: result.error, stepId: "identity" };
      }
      toast({ title: "Role updated", variant: "success" });
      props.onSaved?.(result.data.role);
      return { ok: true };
    }

    const result = await createOrgRoleAction({
      orgSlug,
      label: state.label.trim(),
      permissions: state.permissions
    });
    if (!result.ok) {
      return { ok: false, message: result.error, stepId: "identity" };
    }

    if (state.memberUserIds.length > 0) {
      const assignResult = await assignRoleToMembersAction({
        orgSlug,
        roleKey: result.data.role.roleKey,
        userIds: state.memberUserIds
      });
      if (!assignResult.ok) {
        if (props.mode === "create") props.onCreated?.(result.data.role);
        return { ok: false, message: `Role created, but adding members failed: ${assignResult.error}`, stepId: "people" };
      }
    }

    toast({ title: "Role created", variant: "success" });
    if (props.mode === "create") props.onCreated?.(result.data.role);
    return { ok: true };
  };

  const title = isEdit && role ? role.label : "Create role";
  const subtitle = isEdit
    ? "Manage the role's name, permissions, and members."
    : "Define a custom role, choose its permissions, and add people.";

  const footerLeading = isEdit && deletable ? (
    <Button
      aria-label="Delete role"
      disabled={deleting}
      iconOnly
      onClick={handleDelete}
    >
      <Trash2 className="h-4 w-4 text-destructive" />
    </Button>
  ) : null;

  return (
    <CreateWizard
      draftId={isEdit ? undefined : `role-create.${orgSlug}`}
      footerLeading={footerLeading}
      hideCancel
      initialState={initialState}
      mode={isEdit ? "edit" : "create"}
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel={isEdit ? "Save changes" : "Create role"}
      subtitle={subtitle}
      title={title}
    />
  );
}
