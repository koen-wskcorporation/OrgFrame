import Link from "next/link";

export function AppFooter() {
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/15 text-white" style={{ backgroundColor: "#000000", color: "#ffffff" }}>
      <div className="app-shell overflow-x-auto px-6 py-4 md:px-8">
        <div className="flex min-w-max items-center gap-5">
          <Link className="inline-flex min-w-0 items-center pr-1" href="/">
            <span className="sr-only">Sports SaaS home</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              alt=""
              aria-hidden="true"
              className="block max-w-full object-contain"
              src="/brand/logo.svg"
              style={{ filter: "brightness(0) invert(1)", height: "auto", maxHeight: "28px", maxWidth: "170px", width: "auto" }}
            />
          </Link>

          <span aria-hidden="true" className="ml-auto h-5 w-px bg-black/25" />

          <p className="text-right text-sm text-white/75">{`© ${year} Koen Stewart. This app is experemental and may not behave as expected.`}</p>
        </div>
      </div>
    </footer>
  );
}
