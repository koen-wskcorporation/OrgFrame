"use client";

import { useEffect } from "react";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";

type UseUnsavedChangesWarningInput = {
  enabled: boolean;
  message?: string;
};

export function useUnsavedChangesWarning({
  enabled,
  message = "You have unsaved changes. Leave this page?"
}: UseUnsavedChangesWarningInput) {
  const { confirm } = useConfirmDialog();

  useEffect(() => {
    if (!enabled) {
      return;
    }

    let confirmInFlight = false;
    let currentUrl = window.location.href;
    window.history.replaceState({ __unsaved_guard: true }, "", currentUrl);

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };

    const onDocumentClick = (event: MouseEvent) => {
      if (event.defaultPrevented || confirmInFlight) {
        return;
      }

      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target as Element | null;
      const anchor = target?.closest("a[href]") as HTMLAnchorElement | null;

      if (!anchor) {
        return;
      }

      const href = anchor.getAttribute("href");

      if (!href || href.startsWith("#")) {
        return;
      }

      if (anchor.target === "_blank" || anchor.hasAttribute("download")) {
        return;
      }

      const url = new URL(href, window.location.href);

      if (url.origin !== window.location.origin) {
        return;
      }

      const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      const destination = `${url.pathname}${url.search}${url.hash}`;

      if (current === destination) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      confirmInFlight = true;
      void (async () => {
        const shouldLeave = await confirm({
          title: "Unsaved changes",
          description: message,
          confirmLabel: "Leave Page",
          cancelLabel: "Stay"
        });

        confirmInFlight = false;
        if (!shouldLeave) {
          return;
        }

        currentUrl = url.href;
        window.location.assign(url.href);
      })();
    };

    const onPopState = () => {
      if (confirmInFlight) {
        return;
      }

      const destination = window.location.href;
      if (destination === currentUrl) {
        return;
      }

      window.history.pushState({ __unsaved_guard: true }, "", currentUrl);
      confirmInFlight = true;
      void (async () => {
        const shouldLeave = await confirm({
          title: "Unsaved changes",
          description: message,
          confirmLabel: "Leave Page",
          cancelLabel: "Stay"
        });

        confirmInFlight = false;
        if (!shouldLeave) {
          return;
        }

        currentUrl = destination;
        window.location.assign(destination);
      })();
    };

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onDocumentClick, true);
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onDocumentClick, true);
      window.removeEventListener("popstate", onPopState);
    };
  }, [enabled, message]);
}
