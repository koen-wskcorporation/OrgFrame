import type { ButtonVariant } from "@/src/shared/links";

export type { ButtonConfig } from "@/src/shared/links";

export const buttonVariantOptions: Array<{ label: string; value: ButtonVariant }> = [
  { label: "Primary", value: "primary" },
  { label: "Secondary", value: "secondary" },
  { label: "Ghost", value: "ghost" }
];

export const buttonVariantLabelByValue: Record<ButtonVariant, string> = {
  primary: "Primary",
  secondary: "Secondary",
  ghost: "Ghost"
};
