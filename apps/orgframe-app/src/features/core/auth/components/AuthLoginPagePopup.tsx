"use client";

import { AuthDialog, type AuthMode } from "@/src/features/core/auth/components/AuthDialog";

type AuthLoginPagePopupProps = {
  initialMode?: AuthMode;
  errorMessage?: string | null;
  infoMessage?: string | null;
  nextPath?: string;
  returnTo?: string | null;
};

export function AuthLoginPagePopup({
  initialMode = "signin",
  errorMessage = null,
  infoMessage = null,
  nextPath = "/",
  returnTo = null
}: AuthLoginPagePopupProps) {
  return (
    <AuthDialog
      errorMessage={errorMessage}
      infoMessage={infoMessage}
      initialMode={initialMode}
      nextPath={nextPath}
      onClose={() => {}}
      open
      presentation="inline"
      returnTo={returnTo}
    />
  );
}
