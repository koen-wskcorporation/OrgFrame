"use client";

import { useState, useTransition } from "react";
import type { OrgToolAvailability, OrgToolKey } from "@/src/features/core/config/tools";
import { setOrgToolsAction } from "./actions";

type ToolEntry = { key: OrgToolKey; label: string };

type Props = {
  orgId: string;
  orgName: string;
  orgSlug: string;
  tools: ToolEntry[];
  availability: OrgToolAvailability;
};

export function OrgFeaturesForm({ orgId, orgName, orgSlug, tools, availability }: Props) {
  const [enabled, setEnabled] = useState<Record<OrgToolKey, boolean>>(() => ({ ...availability }));
  const [isPending, startTransition] = useTransition();
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function toggle(key: OrgToolKey) {
    setEnabled((prev) => ({ ...prev, [key]: !prev[key] }));
    setStatus("idle");
  }

  function save() {
    setStatus("idle");
    setErrorMessage(null);
    startTransition(async () => {
      try {
        const enabledKeys = (Object.keys(enabled) as OrgToolKey[]).filter((k) => enabled[k]);
        await setOrgToolsAction(orgId, enabledKeys);
        setStatus("saved");
      } catch (err) {
        setStatus("error");
        setErrorMessage(err instanceof Error ? err.message : "Save failed");
      }
    });
  }

  function setAll(value: boolean) {
    const next: Record<OrgToolKey, boolean> = { ...enabled };
    for (const tool of tools) next[tool.key] = value;
    setEnabled(next);
    setStatus("idle");
  }

  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-base font-semibold">{orgName}</h3>
          <p className="text-xs text-neutral-500">/{orgSlug}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAll(true)}
            className="rounded border px-2 py-1 text-xs hover:bg-neutral-50"
          >
            Enable all
          </button>
          <button
            type="button"
            onClick={() => setAll(false)}
            className="rounded border px-2 py-1 text-xs hover:bg-neutral-50"
          >
            Disable all
          </button>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4">
        {tools.map((tool) => (
          <label
            key={tool.key}
            className="flex items-center gap-2 rounded border px-3 py-2 text-sm hover:bg-neutral-50"
          >
            <input
              type="checkbox"
              checked={enabled[tool.key] ?? false}
              onChange={() => toggle(tool.key)}
            />
            <span>{tool.label}</span>
          </label>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={isPending}
          className="rounded bg-neutral-900 px-4 py-2 text-sm font-medium text-white hover:bg-neutral-800 disabled:opacity-50"
        >
          {isPending ? "Saving…" : "Save"}
        </button>
        {status === "saved" && <span className="text-sm text-green-600">Saved</span>}
        {status === "error" && (
          <span className="text-sm text-red-600">{errorMessage ?? "Save failed"}</span>
        )}
      </div>
    </div>
  );
}
