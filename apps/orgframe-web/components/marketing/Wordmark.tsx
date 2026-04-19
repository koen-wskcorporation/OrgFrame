import Image from "next/image";

interface WordmarkProps {
  size?: "sm" | "md" | "lg";
  priority?: boolean;
}

const sizes: Record<NonNullable<WordmarkProps["size"]>, { w: number; className: string }> = {
  sm: { w: 108, className: "h-auto w-[108px]" },
  md: { w: 132, className: "h-auto w-[120px] md:w-[132px]" },
  lg: { w: 200, className: "h-auto w-[168px] md:w-[200px]" }
};

export function Wordmark({ size = "md", priority = false }: WordmarkProps) {
  const s = sizes[size];
  return (
    <Image alt="OrgFrame" className={s.className} height={Math.round(s.w * 0.245)} priority={priority} src="/brand/logo.svg" width={s.w} />
  );
}
