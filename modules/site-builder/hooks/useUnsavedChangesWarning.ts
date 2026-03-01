"use client";

import { useEffect } from "react";

type UseUnsavedChangesWarningInput = {
  enabled: boolean;
  message?: string;
};

export function useUnsavedChangesWarning({
  enabled,
  message = "You have unsaved changes. Leave this page?"
}: UseUnsavedChangesWarningInput) {
  useEffect(() => {
    if (!enabled) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = message;
    };

    const onDocumentClick = (event: MouseEvent) => {
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

      const shouldLeave = window.confirm(message);

      if (!shouldLeave) {
        event.preventDefault();
        event.stopPropagation();
      }
    };

    const onPopState = () => {
      const shouldLeave = window.confirm(message);

      if (!shouldLeave) {
        window.history.pushState(null, "", window.location.href);
      }
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
