import type { ReactNode } from "react";

type Tone = "paper" | "paper-2" | "paper-3";

interface SectionProps {
  tone?: Tone;
  bleed?: boolean;
  children: ReactNode;
  id?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const toneBg: Record<Tone, string> = {
  paper: "bg-[hsl(var(--paper))]",
  "paper-2": "bg-[hsl(var(--paper-2))]",
  "paper-3": "bg-[hsl(var(--paper-3))]"
};

const sizePad: Record<NonNullable<SectionProps["size"]>, string> = {
  sm: "py-16 md:py-20",
  md: "py-24 md:py-32 lg:py-36",
  lg: "py-28 md:py-40 lg:py-48"
};

export function Section({ tone = "paper", bleed = false, children, id, className, size = "md" }: SectionProps) {
  return (
    <section id={id} className={`${toneBg[tone]} ${sizePad[size]} ${className ?? ""}`}>
      <div className={bleed ? "" : "container-editorial"}>{children}</div>
    </section>
  );
}
