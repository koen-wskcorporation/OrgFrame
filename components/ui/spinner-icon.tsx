import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type SpinnerIconProps = {
  className?: string;
};

export function SpinnerIcon({ className }: SpinnerIconProps) {
  return <Loader2 aria-hidden className={cn("inline-block shrink-0 animate-spin align-middle", className)} />;
}
