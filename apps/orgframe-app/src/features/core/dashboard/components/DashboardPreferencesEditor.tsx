"use client";

import { useMemo, useState } from "react";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import type { DashboardUserPreferences, PersonalHubModuleKey } from "@/src/features/core/dashboard/types-v2";

type DashboardPreferencesEditorProps = {
  initialPreferences: DashboardUserPreferences;
  orgOptions: Array<{ orgId: string; orgName: string }>;
};

const moduleMeta: Array<{ key: PersonalHubModuleKey; label: string }> = [
  { key: "notifications", label: "Notifications" },
  { key: "schedule", label: "Schedule" },
  { key: "registrations", label: "Registrations" },
  { key: "inbox", label: "Inbox" }
];

export function DashboardPreferencesEditor({ initialPreferences, orgOptions }: DashboardPreferencesEditorProps) {
  const [open, setOpen] = useState(false);
  const [hiddenModules, setHiddenModules] = useState<PersonalHubModuleKey[]>(initialPreferences.hiddenModules);
  const [pinnedOrgIds, setPinnedOrgIds] = useState<string[]>(initialPreferences.pinnedOrgIds);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const moduleVisibility = useMemo(() => new Set(hiddenModules), [hiddenModules]);
  const pinnedSet = useMemo(() => new Set(pinnedOrgIds), [pinnedOrgIds]);

  async function savePreferences() {
    setSaving(true);
    setError(null);

    try {
      const response = await fetch("/api/account/dashboard-preferences", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          preferences: {
            ...initialPreferences,
            hiddenModules,
            pinnedOrgIds
          }
        })
      });

      if (!response.ok) {
        throw new Error("Failed to save");
      }

      setOpen(false);
      window.location.reload();
    } catch {
      setError("Unable to save preferences right now.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Dashboard Preferences</CardTitle>
            <CardDescription>Choose visible modules and pinned organizations.</CardDescription>
          </div>
          <Button onClick={() => setOpen((current) => !current)} size="sm" variant="secondary">
            {open ? "Close" : "Customize"}
          </Button>
        </div>
      </CardHeader>
      {open ? (
        <CardContent className="space-y-5 pt-0">
          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-text">Visible Personal Modules</h4>
            <div className="space-y-2">
              {moduleMeta.map((module) => {
                const checked = !moduleVisibility.has(module.key);
                return (
                  <label className="flex items-center gap-2 text-sm text-text" key={module.key}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(nextChecked) => {
                        setHiddenModules((current) => {
                          const set = new Set(current);
                          if (nextChecked) {
                            set.delete(module.key);
                          } else {
                            set.add(module.key);
                          }
                          return Array.from(set);
                        });
                      }}
                    />
                    {module.label}
                  </label>
                );
              })}
            </div>
          </section>

          <section className="space-y-2">
            <h4 className="text-sm font-semibold text-text">Pinned Organizations</h4>
            <div className="space-y-2">
              {orgOptions.map((org) => (
                <label className="flex items-center gap-2 text-sm text-text" key={org.orgId}>
                  <Checkbox
                    checked={pinnedSet.has(org.orgId)}
                    onCheckedChange={(nextChecked) => {
                      setPinnedOrgIds((current) => {
                        const set = new Set(current);
                        if (nextChecked) {
                          set.add(org.orgId);
                        } else {
                          set.delete(org.orgId);
                        }
                        return Array.from(set);
                      });
                    }}
                  />
                  {org.orgName}
                </label>
              ))}
            </div>
          </section>

          {error ? <p className="text-sm text-destructive">{error}</p> : null}

          <div className="flex justify-end">
            <Button loading={saving} onClick={savePreferences} size="sm" variant="primary">
              Save Preferences
            </Button>
          </div>
        </CardContent>
      ) : null}
    </Card>
  );
}
