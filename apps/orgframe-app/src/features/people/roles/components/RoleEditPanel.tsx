"use client";

import { useEffect, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { useToast } from "@orgframe/ui/primitives/toast";
import { permissionDefinitions, type Permission } from "@/src/features/core/access";
import {
  deleteOrgRoleAction,
  updateOrgRoleAction,
  type OrgRoleDefinition
} from "@/src/features/people/roles/actions";

type RoleEditPanelProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  role: OrgRoleDefinition | null;
  onSaved?: (role: OrgRoleDefinition) => void;
  onDeleted?: (roleId: string) => void;
};

const permissionGroups = (() => {
  const groups = new Map<string, typeof permissionDefinitions>();
  for (const def of permissionDefinitions) {
    const list = groups.get(def.group) ?? [];
    list.push(def);
    groups.set(def.group, list);
  }
  return Array.from(groups.entries());
})();

export function RoleEditPanel({ open, onClose, orgSlug, role, onSaved, onDeleted }: RoleEditPanelProps) {
  const { toast } = useToast();
  const editable = role?.editable ?? false;
  const deletable = role?.deletable ?? false;

  const [label, setLabel] = useState(role?.label ?? "");
  const [permissions, setPermissions] = useState<Set<Permission>>(new Set(role?.permissions ?? []));
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isDeleting, startDeleting] = useTransition();

  useEffect(() => {
    if (!open) return;
    setLabel(role?.label ?? "");
    setPermissions(new Set(role?.permissions ?? []));
    setErrorMessage(null);
  }, [open, role]);

  const togglePermission = (permission: Permission) => {
    if (!editable) return;
    setPermissions((current) => {
      const next = new Set(current);
      if (next.has(permission)) next.delete(permission);
      else next.add(permission);
      return next;
    });
  };

  const handleSave = () => {
    if (!editable || !role) return;
    setErrorMessage(null);
    startSaving(async () => {
      const result = await updateOrgRoleAction({
        orgSlug,
        roleId: role.id,
        label,
        permissions: Array.from(permissions)
      });
      if (!result.ok) {
        setErrorMessage(result.error);
        toast({ title: "Could not update role", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Role updated", variant: "success" });
      onSaved?.(result.data.role);
      onClose();
    });
  };

  const handleDelete = () => {
    if (!role || !deletable) return;
    if (!window.confirm(`Delete the "${role.label}" role? Members holding this role will keep the assignment until you change them.`)) {
      return;
    }
    setErrorMessage(null);
    startDeleting(async () => {
      const result = await deleteOrgRoleAction({ orgSlug, roleId: role.id });
      if (!result.ok) {
        setErrorMessage(result.error);
        toast({ title: "Could not delete role", description: result.error, variant: "destructive" });
        return;
      }
      toast({ title: "Role deleted", variant: "success" });
      onDeleted?.(result.data.deletedId);
      onClose();
    });
  };

  const subtitle = role?.source === "default"
    ? "Built-in role. Permissions are managed by OrgFrame and cannot be changed."
    : "Edit the role label and the permissions it grants.";

  const footer = role ? (
    <>
      {deletable ? (
        <Button disabled={isSaving || isDeleting} loading={isDeleting} onClick={handleDelete} type="button" variant="danger">
          Delete role
        </Button>
      ) : null}
      <Button disabled={isSaving || isDeleting} onClick={onClose} type="button" variant="ghost">
        {editable ? "Cancel" : "Close"}
      </Button>
      {editable ? (
        <Button disabled={isSaving || isDeleting || label.trim().length === 0} loading={isSaving} onClick={handleSave} type="button">
          Save changes
        </Button>
      ) : null}
    </>
  ) : null;

  return (
    <Panel
      footer={footer}
      onClose={onClose}
      open={open && role !== null}
      panelKey="people-role-edit"
      subtitle={subtitle}
      title={role ? `Edit "${role.label}"` : "Edit role"}
    >
      {role ? (
        <div className="space-y-5">
          {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

          <FormField label="Role name">
            <Input
              disabled={!editable || isSaving}
              onChange={(event) => setLabel(event.target.value)}
              value={label}
            />
          </FormField>

          <p className="text-xs text-text-muted">
            Role key: <code className="rounded bg-surface-muted px-1 py-0.5">{role.roleKey}</code>
          </p>

          <div className="space-y-3">
            <p className="text-sm font-semibold">Permissions</p>
            <div className="space-y-4">
              {permissionGroups.map(([groupLabel, defs]) => (
                <section className="space-y-1.5" key={groupLabel}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{groupLabel}</p>
                  <div className="space-y-1">
                    {defs.map((def) => {
                      const checked = permissions.has(def.permission);
                      return (
                        <label
                          className="flex items-start gap-3 rounded-control border border-border/60 bg-surface px-3 py-2 text-sm hover:bg-surface-muted/40"
                          key={def.permission}
                        >
                          <Checkbox
                            checked={checked}
                            disabled={!editable || isSaving}
                            onChange={() => togglePermission(def.permission)}
                          />
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight">{def.label}</p>
                            <p className="text-xs text-text-muted">{def.description}</p>
                          </div>
                        </label>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </Panel>
  );
}
