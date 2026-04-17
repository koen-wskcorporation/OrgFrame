import Image from "next/image";
import { buttonVariants } from "@orgframe/ui";
import { getSessionUser } from "@/src/features/auth/server/getSessionUser";

function getAppOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_ORIGIN ?? process.env.ORGFRAME_APP_ORIGIN ?? "https://orgframe.app";
  return configuredOrigin.replace(/\/+$/, "");
}

function getAppAuthUrl() {
  const appOrigin = getAppOrigin();
  return `${appOrigin}/auth?next=${encodeURIComponent("/")}`;
}

function getAppDashboardUrl() {
  const appOrigin = getAppOrigin();
  return `${appOrigin}/`;
}

export default async function HomePage() {
  const appAuthUrl = getAppAuthUrl();
  const appDashboardUrl = getAppDashboardUrl();
  const user = await getSessionUser();
  const ctaHref = user ? appDashboardUrl : appAuthUrl;
  const ctaLabel = user ? "Open Dashboard" : "Sign In";

  return (
    <main className="landing-dramatic relative min-h-screen overflow-hidden">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-left" />
      <div className="landing-orb landing-orb-right" />
      <header className="relative z-20 mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-5 md:px-10">
        <Image alt="OrgFrame" className="h-auto w-[120px] md:w-[140px]" height={34} priority src="/brand/logo.svg" width={140} />
        <div className="flex items-center gap-3">
          {user ? <p className="hidden text-sm font-medium text-text-muted md:block">Signed in as {user.email ?? "account"}</p> : null}
          <a className={buttonVariants({ size: "sm" })} href={ctaHref}>
            {ctaLabel}
          </a>
        </div>
      </header>
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <Image alt="OrgFrame" className="mb-8 h-auto w-[180px] md:w-[220px]" height={52} src="/brand/logo.svg" width={220} />
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-text md:text-6xl lg:text-7xl">
            The first fully visual sports management software built for the everyday person.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-sm font-medium text-text-muted md:text-base">
            OrgFrame is not yet publicly available. Access is currently limited to organizations with existing login credentials.
          </p>
          <div className="mt-10">
            <a
              className={`${buttonVariants({ size: "lg" })} h-12 px-8 text-base`}
              href={ctaHref}
            >
              {ctaLabel}
            </a>
          </div>
        </div>
      </div>
    </main>
  );
}
