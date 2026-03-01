"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type SubmitButtonProps = Omit<ButtonProps, "loading" | "type"> & {
  loading?: boolean;
};

export function SubmitButton({ disabled, loading = false, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();
  const isLoading = loading || pending;

  return <Button {...props} disabled={disabled || pending} loading={isLoading} type="submit" />;
}
