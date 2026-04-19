import type { ReactNode } from "react";

interface SectionHeadingProps {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: "left" | "center";
  as?: "h1" | "h2" | "h3";
  variant?: "display" | "headline" | "subhead";
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = "left",
  as: Tag = "h2",
  variant = "headline"
}: SectionHeadingProps) {
  const alignment = align === "center" ? "text-center mx-auto items-center" : "text-left items-start";
  const ledeAlign = align === "center" ? "mx-auto" : "";
  const variantClass = variant === "display" ? "display" : variant === "subhead" ? "subhead" : "headline";
  return (
    <div className={`flex max-w-3xl flex-col gap-5 ${alignment}`}>
      {eyebrow ? <span className="eyebrow eyebrow-accent">{eyebrow}</span> : null}
      <Tag className={variantClass}>{title}</Tag>
      {lede ? <p className={`lede ${ledeAlign}`}>{lede}</p> : null}
    </div>
  );
}
