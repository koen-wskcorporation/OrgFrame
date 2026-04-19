import type { ReactNode } from "react";

export function Prose({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`prose-editorial ${className ?? ""}`}>{children}</div>;
}
