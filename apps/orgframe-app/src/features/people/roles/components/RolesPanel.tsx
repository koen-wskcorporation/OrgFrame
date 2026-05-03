"use client";

import { useMemo, useState } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardHeader, CardHeaderRow } from "@orgframe/ui/primitives/card";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import { StatusChip } from "@orgframe/ui/primitives/status-chip";
import { RoleCreateWizard } from "@/src/features/people/roles/components/RoleCreateWizard";
import { RoleEditPanel } from "@/src/features/people/roles/components/RoleEditPanel";
import type { OrgRoleDefinition } from "@/src/features/people/roles/actions";

type RolesPanelProps = {
  orgSlug: string;
  initialRoles: OrgRoleDefinition[];
  canManageRoles: boolean;
  loadError: string | null;
};

export function RolesPanel({ orgSlug, initialRoles, canManageRoles, loadError }: RolesPanelProps) {
  const [roles, setRoles] = useState<OrgRoleDefinition[]>(initialRoles);
  const [popupRole, setPopupRole] = useState<OrgRoleDefinition | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const columns = useMemo<DataTableColumn<OrgRoleDefinition>[]>(
    () => [
      {
        key: "label",
        label: "Role",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => (
          <div>
            <p className="font-semibold">{row.label}</p>
            <p className="text-xs text-text-muted">
              <code className="rounded bg-surface-muted px-1 py-0.5">{row.roleKey}</code>
            </p>
          </div>
        ),
        renderSearchValue: (row) => `${row.label} ${row.roleKey}`,
        renderSortValue: (row) => row.label.toLowerCase()
      },
      {
        key: "source",
        label: "Source",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => (
          <StatusChip variant={row.source === "default" ? "neutral" : "success"}>
            {row.source === "default" ? "Built-in" : "Custom"}
          </StatusChip>
        ),
        renderSortValue: (row) => row.source
      },
      {
        key: "permissions",
        label: "Permissions",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => <span>{row.permissions.length}</span>,
        renderSortValue: (row) => row.permissions.length
      },
      {
        key: "updated",
        label: "Last updated",
        defaultVisible: false,
        sortable: true,
        renderCell: (row) => (row.updatedAt ? new Date(row.updatedAt).toLocaleString() : "—"),
        renderSortValue: (row) => row.updatedAt ?? ""
      }
    ],
    []
  );

  const handleSaved = (role: OrgRoleDefinition) => {
    setRoles((current) => {
      const without = current.filter((entry) => entry.id !== role.id);
      return [...without, role].sort((a, b) => {
        if (a.source !== b.source) return a.source === "default" ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
    });
  };

  const handleDeleted = (roleId: string) => {
    setRoles((current) => current.filter((entry) => entry.id !== roleId));
  };

  return (
    <div className="ui-stack-page">
      {loadError ? <Alert variant="warning">{loadError}</Alert> : null}

      <Card>
        <CardHeader>
          <CardHeaderRow
            actions={
              canManageRoles ? (
                <Button onClick={() => setCreateOpen(true)} type="button">
                  Create role
                </Button>
              ) : null
            }
            description="Built-in roles are managed by OrgFrame. Create custom roles to grant tailored permission sets."
            title="Roles"
          />
        </CardHeader>
        <CardContent className="px-5 pb-5 pt-2 md:px-6 md:pb-6">
          <DataTable
            ariaLabel="Org roles"
            columns={columns}
            data={roles}
            defaultSort={{ columnKey: "label", direction: "asc" }}
            emptyState="No roles yet."
            onRowClick={(row) => setPopupRole(row)}
            rowKey={(row) => row.id}
            searchPlaceholder="Search roles"
            storageKey={`people-roles-table:${orgSlug}`}
          />
        </CardContent>
      </Card>

      <RoleEditPanel
        onClose={() => setPopupRole(null)}
        onDeleted={handleDeleted}
        onSaved={handleSaved}
        open={popupRole !== null}
        orgSlug={orgSlug}
        role={popupRole}
      />

      <RoleCreateWizard
        onClose={() => setCreateOpen(false)}
        onCreated={handleSaved}
        open={createOpen}
        orgSlug={orgSlug}
      />
    </div>
  );
}
