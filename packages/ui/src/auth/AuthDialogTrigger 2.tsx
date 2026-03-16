"use client";

import { useState } from "react";
import { AuthDialog, type AuthMode } from "@orgframe/ui/auth/AuthDialog";
import { Button, type ButtonProps } from "@orgframe/ui/ui/button";

type AuthDialogTriggerProps = Pick<ButtonProps, "className" | "size" | "variant"> & {
  initialMode?: AuthMode;
  label?: string;
};

export function AuthDialogTrigger({
  className,
  initialMode = "signin",
  label = "Sign in",
  size = "sm",
  variant = "secondary"
}: AuthDialogTriggerProps) {
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
