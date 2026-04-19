import Link from "next/link";
import type { ReactNode } from "react";
import { AdaptiveLogo } from "@orgframe/ui/primitives/adaptive-logo";

type CenteredFormShellProps = {
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  homeHref?: string;
};

export function CenteredFormShell({ title, subtitle, children, footer, homeHref = "/" }: CenteredFormShellProps) {
  return (
    <main className="relative flex h-screen min-h-screen w-full items-center justify-center overflow-hidden px-4 py-8 md:px-6">
      <div aria-hidden="true" className="centered-form-bg" />

      <section className="relative z-10 flex w-full max-w-md flex-col overflow-hidden rounded-card border border-border/60 bg-surface p-7 shadow-floating md:p-8">
        <div className="mb-7 flex justify-center">
          <Link aria-label="OrgFrame home" className="inline-flex items-center" href={homeHref}>
            <AdaptiveLogo
              alt="OrgFrame"
              className="block object-contain"
              src="/brand/logo.svg"
              style={{ height: "auto", width: "auto", maxWidth: "140px" }}
            />
          </Link>
        </div>

        <header className="mb-6 space-y-1 text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-text">{title}</h1>
          {subtitle ? <p className="text-sm text-text-muted">{subtitle}</p> : null}
        </header>

        {children}

        {footer ? <div className="mt-5 text-center text-sm text-text-muted">{footer}</div> : null}
      </section>
    </main>
  );
}
