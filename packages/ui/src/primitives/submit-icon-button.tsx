"use client";

import * as React from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@orgframe/ui/primitives/button";

type SubmitIconButtonProps = Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, "children" | "aria-label" | "type"> & {
  label: string;
  icon: React.ReactNode;
  loadingIcon?: React.ReactNode;
  loading?: boolean;
};

export function SubmitIconButton({ disabled, icon, label, loading = false, loadingIcon, ...props }: SubmitIconButtonProps) {
  const { pending } = useFormStatus();
  const isLoading = loading || pending;

  return (
    <Button
      iconOnly
      {...props}
      aria-label={label}
      disabled={disabled || isLoading}
      loading={isLoading && !loadingIcon}
      type="submit"
    >
      {isLoading && loadingIcon ? loadingIcon : icon}
    </Button>
  );
}
