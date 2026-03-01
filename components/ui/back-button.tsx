"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Button, type ButtonProps } from "@/components/ui/button";

type BackButtonProps = Omit<ButtonProps, "onClick"> & {
  label?: string;
  fallbackHref?: string;
};

export function BackButton({ label = "Back", fallbackHref, ...buttonProps }: BackButtonProps) {
  const router = useRouter();

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
      return;
    }

    if (fallbackHref) {
      router.push(fallbackHref);
    }
  }

  return (
    <Button onClick={handleBack} {...buttonProps}>
      <ArrowLeft className="h-4 w-4" />
      {label}
    </Button>
  );
}
