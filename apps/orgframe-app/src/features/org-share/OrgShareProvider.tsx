"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { listOrgShareCatalogAction } from "@/src/features/org-share/actions";
import { UniversalSharePopup } from "@/src/features/org-share/components/UniversalSharePopup";
import type { SharePermission, ShareSelectionPayload, ShareTarget, ShareTargetType } from "@/src/features/org-share/types";
import { useToast } from "@orgframe/ui/primitives/toast";

type OpenOrgShareInput = {
  title?: string;
  subtitle?: string;
  allowedTypes?: ShareTargetType[];
  initialTargets?: ShareTarget[];
  initialPermission?: SharePermission;
  showPermissionControl?: boolean;
  primaryActionLabel?: string;
  searchPlaceholder?: string;
  selectedLabel?: string;
  allowManualPeople?: boolean;
  onApply: (payload: ShareSelectionPayload) => void | Promise<void>;
};

type OrgShareContextValue = {
  openShare: (input: OpenOrgShareInput) => Promise<void>;
};

const OrgShareContext = createContext<OrgShareContextValue | null>(null);

export function OrgShareProvider({ orgSlug, children }: { orgSlug: string; children: React.ReactNode }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ShareTarget[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [config, setConfig] = useState<OpenOrgShareInput | null>(null);

  const openShare = useCallback(
    async (input: OpenOrgShareInput) => {
      setConfig(input);
      setOpen(true);
      setLoadingOptions(true);

      const response = await listOrgShareCatalogAction({
        orgSlug,
        requestedTypes: input.allowedTypes
      });

      setLoadingOptions(false);

      if (!response.ok) {
        setOptions([]);
        toast({
          title: "Unable to load recipients",
          description: response.error,
          variant: "destructive"
        });
        return;
      }

      setOptions(response.data.options);
    },
    [orgSlug, toast]
  );

  const contextValue = useMemo(
    () => ({
      openShare
    }),
    [openShare]
  );

  return (
    <OrgShareContext.Provider value={contextValue}>
      {children}
      {config ? (
        <UniversalSharePopup
          allowManualPeople={config.allowManualPeople}
          allowedTypes={config.allowedTypes}
          initialPermission={config.initialPermission}
          initialTargets={config.initialTargets}
          onApply={async (payload) => {
            await config.onApply(payload);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
          open={open}
          options={options}
          primaryActionLabel={config.primaryActionLabel}
          searchPlaceholder={config.searchPlaceholder ?? (loadingOptions ? "Loading recipients..." : undefined)}
          selectedLabel={config.selectedLabel}
          showPermissionControl={config.showPermissionControl}
          subtitle={config.subtitle}
          title={config.title}
        />
      ) : null}
    </OrgShareContext.Provider>
  );
}

export function useOrgSharePopup() {
  const context = useContext(OrgShareContext);

  if (!context) {
    throw new Error("useOrgSharePopup must be used within OrgShareProvider.");
  }

  return context;
}
