import Image from "next/image";
import { Button } from "@orgframe/ui";

export default function HomePage() {
  return (
    <main className="landing-dramatic relative min-h-screen overflow-hidden">
      <div className="landing-grid" />
      <div className="landing-orb landing-orb-left" />
      <div className="landing-orb landing-orb-right" />
      <div className="relative z-10 flex min-h-screen items-center justify-center px-6">
        <div className="mx-auto flex max-w-5xl flex-col items-center text-center">
          <Image alt="OrgFrame" className="mb-8 h-auto w-[180px] md:w-[220px]" height={52} priority src="/brand/logo.svg" width={220} />
          <h1 className="text-balance text-4xl font-semibold leading-[1.05] tracking-[-0.03em] text-text md:text-6xl lg:text-7xl">
            The first fully visual sports management software built for the everyday person.
          </h1>
          <p className="mt-6 max-w-2xl text-pretty text-sm font-medium text-text-muted md:text-base">
            OrgFrame is not yet publicly available. Access is currently limited to organizations with existing login credentials.
          </p>
          <div className="mt-10">
            <Button className="h-12 px-8 text-base" href="/login" size="lg">
              Log In
            </Button>
          </div>
        </div>
      </div>
    </main>
  );
}
