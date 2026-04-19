"use client";

import { useState } from "react";
import { AuthDialog, type AuthMode } from "@/src/features/core/auth/components/AuthDialog";
import { Button, type ButtonProps } from "@orgframe/ui/primitives/button";

type AuthDialogTriggerProps = Pick<ButtonProps, "className" | "size" | "variant"> & {
  initialMode?: AuthMode;
  label?: string;
  authHref?: string;
};

export function AuthDialogTrigger({
  className,
  authHref,
  initialMode = "signin",
  label = "Sign In",
  size = "sm",
  variant = "secondary"
}: AuthDialogTriggerProps) {
  if (authHref) {
    return (
      <Button className={className} href={authHref} size={size} variant={variant}>
        {label}
      </Button>
    );
  }

  const [open, setOpen] = useState(false);

  return (
    <>
      <Button className={className} onClick={() => setOpen(true)} size={size} variant={variant}>
        {label}
      </Button>
      <AuthDialog initialMode={initialMode} onClose={() => setOpen(false)} open={open} />
    </>
  );
}
