"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useToast } from "@/components/ui/toast";

type OrgInfoPageToastsProps = {
  successMessage: string | null;
  errorMessage: string | null;
};

export function OrgInfoPageToasts({ successMessage, errorMessage }: OrgInfoPageToastsProps) {
  const { toast } = useToast();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const lastToastKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (!successMessage && !errorMessage) {
      return;
    }

    const toastKey = `success:${successMessage ?? ""}|error:${errorMessage ?? ""}|query:${searchParams.toString()}`;

    if (lastToastKeyRef.current === toastKey) {
      return;
    }
    lastToastKeyRef.current = toastKey;

    if (errorMessage) {
      toast({
        title: errorMessage,
        variant: "destructive"
      });
    } else if (successMessage) {
      toast({
        title: successMessage,
        variant: "success"
      });
    }

    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.delete("saved");
    nextParams.delete("error");
    const nextQuery = nextParams.toString();
    router.replace(nextQuery ? `${pathname}?${nextQuery}` : pathname, { scroll: false });
  }, [errorMessage, pathname, router, searchParams, successMessage, toast]);

  return null;
}
