"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { useToast } from "@orgframe/ui/primitives/toast";
import { permissionDefinitions, type Permission } from "@/src/features/core/access";
import {
  createOrgRoleAction,
  deleteOrgRoleAction,
  updateOrgRoleAction,
  type OrgRoleDefinition
} from "@/src/features/people/roles/actions";

type RoleEditPopupProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  /** When null, the popup is in "create" mode. */
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

export function RoleEditPopup({ open, onClose, orgSlug, role, onSaved, onDeleted }: RoleEditPopupProps) {
  const { toast } = useToast();
  const isCreateMode = role === null;
  const editable = isCreateMode || (role?.editable ?? false);
  const deletable = !isCreateMode && (role?.deletable ?? false);

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
    if (!editable) return;
    setErrorMessage(null);
    startSaving(async () => {
      const permissionList = Array.from(permissions);

      if (isCreateMode) {
        const result = await createOrgRoleAction({
          orgSlug,
          label,
          permissions: permissionList
        });
        if (!result.ok) {
          setErrorMessage(result.error);
          toast({ title: "Could not create role", description: result.error, variant: "destructive" });
          return;
        }
        toast({ title: "Role created", variant: "success" });
        onSaved?.(result.data.role);
        onClose();
      } else if (role) {
        const result = await updateOrgRoleAction({
          orgSlug,
          roleId: role.id,
          label,
          permissions: permissionList
        });
        if (!result.ok) {
          setErrorMessage(result.error);
          toast({ title: "Could not update role", description: result.error, variant: "destructive" });
          return;
        }
        toast({ title: "Role updated", variant: "success" });
        onSaved?.(result.data.role);
        onClose();
      }
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

  const subtitle = useMemo(() => {
    if (isCreateMode) return "Pick which permissions members of this role should have.";
    if (role?.source === "default") return "Built-in role. Permissions are managed by OrgFrame and cannot be changed.";
    return "Edit the role label and the permissions it grants.";
  }, [isCreateMode, role]);

  const footer = (
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
          {isCreateMode ? "Create role" : "Save changes"}
        </Button>
      ) : null}
    </>
  );

  return (
    <Popup
      footer={footer}
      onClose={onClose}
      open={open}
      size="lg"
      subtitle={subtitle}
      title={isCreateMode ? "Create role" : `Edit "${role?.label ?? "role"}"`}
    >
      <div className="space-y-5">
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        <FormField label="Role name">
          <Input
            disabled={!editable || isSaving}
            onChange={(event) => setLabel(event.target.value)}
            placeholder="Treasurer, Coach, Volunteer..."
            value={label}
          />
        </FormField>

        {!isCreateMode && role ? (
          <p className="text-xs text-text-muted">
            Role key: <code className="rounded bg-surface-muted px-1 py-0.5">{role.roleKey}</code>
          </p>
        ) : null}

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
    </Popup>
  );
}
