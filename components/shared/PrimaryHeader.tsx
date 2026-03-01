import Link from "next/link";
import { Suspense } from "react";
import { HeaderProgressBar } from "@/components/shared/HeaderProgressBar";
import { PrimaryAccountControls } from "@/components/shared/PrimaryAccountControls";

export function PrimaryHeader() {
  return (
    <header className="relative z-[200] w-full border-b bg-surface" id="app-primary-header">
      <Suspense fallback={null}>
        <HeaderProgressBar />
      </Suspense>
      <div className="app-shell flex h-16 w-full items-center justify-between px-6 md:px-8">
        <Link className="inline-flex min-w-0 items-center" href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            alt="Sports SaaS logo"
            className="block max-w-full object-contain"
            src="/brand/logo.svg"
            style={{ height: "auto", maxHeight: "32px", maxWidth: "180px", width: "auto" }}
          />
        </Link>

        <PrimaryAccountControls />
      </div>
    </header>
  );
}
