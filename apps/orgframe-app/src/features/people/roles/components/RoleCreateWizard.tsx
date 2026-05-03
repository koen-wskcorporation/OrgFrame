"use client";

import { useMemo } from "react";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { CreateWizard, type CreateWizardSubmitResult, type WizardStep } from "@/src/shared/components/CreateWizard";
import {
  isReservedOrgRoleKey,
  isValidRoleKey,
  normalizeRoleKey,
  permissionDefinitions,
  type Permission
} from "@/src/features/core/access";
import { createOrgRoleAction, type OrgRoleDefinition } from "@/src/features/people/roles/actions";

type RoleCreateWizardProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  onCreated?: (role: OrgRoleDefinition) => void;
};

type WizardState = {
  label: string;
  roleKey: string;
  permissions: Permission[];
};

const groupedPermissions = (() => {
  const groups = new Map<string, typeof permissionDefinitions>();
  for (const def of permissionDefinitions) {
    const list = groups.get(def.group) ?? [];
    list.push(def);
    groups.set(def.group, list);
  }
  return Array.from(groups.entries());
})();

function togglePermission(state: WizardState, permission: Permission): WizardState {
  const set = new Set(state.permissions);
  if (set.has(permission)) set.delete(permission);
  else set.add(permission);
  return { ...state, permissions: Array.from(set) };
}

export function RoleCreateWizard({ open, onClose, orgSlug, onCreated }: RoleCreateWizardProps) {
  const initialState = useMemo<WizardState>(
    () => ({ label: "", roleKey: "", permissions: [] }),
    []
  );

  const steps: WizardStep<WizardState>[] = [
    {
      id: "identity",
      label: "Identity",
      description: "Give the role a clear name. The key is auto-derived for permission checks.",
      validate: (state) => {
        const errors: Record<string, string> = {};
        if (state.label.trim().length < 2) {
          errors.label = "Role name must be at least 2 characters.";
        }
        const candidateKey = state.roleKey.trim() || normalizeRoleKey(state.label);
        if (!candidateKey || !isValidRoleKey(candidateKey)) {
          errors.roleKey = "Role key must start with a letter and use only lowercase letters, numbers, or hyphens.";
        } else if (isReservedOrgRoleKey(candidateKey)) {
          errors.roleKey = `"${candidateKey}" is reserved by OrgFrame.`;
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField error={fieldErrors.label} label="Role name">
            <Input
              autoFocus
              onChange={(event) => setField("label", event.target.value)}
              placeholder="Treasurer, Coach, Volunteer..."
              value={state.label}
            />
          </FormField>
          <FormField
            error={fieldErrors.roleKey}
            hint="Auto-generated from the name if blank. Lowercase letters, numbers, and hyphens only."
            label="Role key"
          >
            <Input
              onChange={(event) => setField("roleKey", normalizeRoleKey(event.target.value))}
              placeholder={state.label ? normalizeRoleKey(state.label) : "treasurer"}
              value={state.roleKey}
            />
          </FormField>
        </div>
      )
    },
    {
      id: "permissions",
      label: "Permissions",
      description: "Pick which capabilities members of this role should have. You can change this later.",
      render: ({ state, setState }) => {
        const selected = new Set(state.permissions);
        return (
          <div className="space-y-4">
            {groupedPermissions.map(([groupLabel, defs]) => (
              <section className="space-y-1.5" key={groupLabel}>
                <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{groupLabel}</p>
                <div className="space-y-1">
                  {defs.map((def) => {
                    const checked = selected.has(def.permission);
                    return (
                      <label
                        className="flex items-start gap-3 rounded-control border border-border/60 bg-surface px-3 py-2 text-sm hover:bg-surface-muted/40"
                        key={def.permission}
                      >
                        <Checkbox
                          checked={checked}
                          onChange={() => setState((current) => togglePermission(current, def.permission))}
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
        );
      }
    }
  ];

  return (
    <CreateWizard
      draftId={`role-create.${orgSlug}`}
      initialState={initialState}
      onClose={onClose}
      onSubmit={async (state): Promise<CreateWizardSubmitResult> => {
        const result = await createOrgRoleAction({
          orgSlug,
          label: state.label.trim(),
          roleKey: state.roleKey.trim() || normalizeRoleKey(state.label),
          permissions: state.permissions
        });
        if (!result.ok) {
          return { ok: false, message: result.error };
        }
        onCreated?.(result.data.role);
        return { ok: true };
      }}
      open={open}
      steps={steps}
      submitLabel="Create role"
      subtitle="Define a custom role and the permissions it grants."
      title="Create role"
    />
  );
}
