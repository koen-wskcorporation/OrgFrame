"use client";

import * as React from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Popup } from "@orgframe/ui/primitives/popup";

type ConfirmVariant = "default" | "destructive";

export type ConfirmDialogOptions = {
  title?: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: ConfirmVariant;
};

type ConfirmRequest = {
  options: ConfirmDialogOptions;
  resolve: (value: boolean) => void;
};

type ConfirmDialogContextValue = {
  confirm: (options: ConfirmDialogOptions) => Promise<boolean>;
};

const ConfirmDialogContext = React.createContext<ConfirmDialogContextValue | null>(null);

function normalizeOptions(options: ConfirmDialogOptions): Required<ConfirmDialogOptions> {
  return {
    title: options.title ?? "Confirm action",
    description: options.description ?? "",
    confirmLabel: options.confirmLabel ?? "Confirm",
    cancelLabel: options.cancelLabel ?? "Cancel",
    variant: options.variant ?? "default"
  };
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const queueRef = React.useRef<ConfirmRequest[]>([]);
  const [activeRequest, setActiveRequest] = React.useState<ConfirmRequest | null>(null);

  const flushQueue = React.useCallback(() => {
    if (activeRequest || queueRef.current.length === 0) {
      return;
    }

    const next = queueRef.current.shift() ?? null;
    setActiveRequest(next);
  }, [activeRequest]);

  const confirm = React.useCallback((options: ConfirmDialogOptions) => {
    return new Promise<boolean>((resolve) => {
      queueRef.current.push({ options, resolve });
      setActiveRequest((current) => current ?? queueRef.current.shift() ?? null);
    });
  }, []);

  const resolveActive = React.useCallback(
    (value: boolean) => {
      if (!activeRequest) {
        return;
      }

      activeRequest.resolve(value);
      setActiveRequest(null);
      window.requestAnimationFrame(() => {
        flushQueue();
      });
    },
    [activeRequest, flushQueue]
  );

  const normalized = activeRequest ? normalizeOptions(activeRequest.options) : null;
  const contextValue = React.useMemo<ConfirmDialogContextValue>(() => ({ confirm }), [confirm]);

  return (
    <ConfirmDialogContext.Provider value={contextValue}>
      {children}
      <Popup
        closeOnBackdrop
        onClose={() => resolveActive(false)}
        open={Boolean(activeRequest)}
        size="sm"
        subtitle={normalized?.description}
        title={normalized?.title}
      >
        <div className="flex items-center justify-end gap-2">
          <Button onClick={() => resolveActive(false)} size="sm" type="button" variant="ghost">
            {normalized?.cancelLabel ?? "Cancel"}
          </Button>
          <Button onClick={() => resolveActive(true)} size="sm" type="button" variant={normalized?.variant === "destructive" ? "primary" : "secondary"}>
            {normalized?.confirmLabel ?? "Confirm"}
          </Button>
        </div>
      </Popup>
    </ConfirmDialogContext.Provider>
  );
}

export function useConfirmDialog() {
  const context = React.useContext(ConfirmDialogContext);
  if (!context) {
    throw new Error("useConfirmDialog must be used within ConfirmDialogProvider.");
  }

  return context;
}

