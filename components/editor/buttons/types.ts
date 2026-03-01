import type { ButtonVariant } from "@/lib/links";

export type { ButtonConfig } from "@/lib/links";

export const buttonVariantOptions: Array<{ label: string; value: ButtonVariant }> = [
  { label: "Primary", value: "primary" },
  { label: "Secondary", value: "secondary" },
  { label: "Ghost", value: "ghost" },
  { label: "Link", value: "link" }
];

export const buttonVariantLabelByValue: Record<ButtonVariant, string> = {
  primary: "Primary",
  secondary: "Secondary",
  ghost: "Ghost",
  link: "Link"
};
