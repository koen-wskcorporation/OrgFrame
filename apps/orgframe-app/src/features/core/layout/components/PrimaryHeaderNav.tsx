"use client";

import { usePathname } from "next/navigation";
import { NavItem } from "@orgframe/ui/primitives/nav-item";

type PrimaryHeaderNavProps = {
  homeHref?: string;
};

function toPathname(href: string) {
  if (!href) {
    return "/";
  }

  if (href.startsWith("http://") || href.startsWith("https://")) {
    try {
      return new URL(href).pathname || "/";
    } catch {
      return "/";
    }
  }

  return href;
}

function isActivePath(pathname: string, hrefPathname: string, options?: { exact?: boolean }) {
  if (options?.exact) {
    return pathname === hrefPathname;
  }

  return pathname === hrefPathname || pathname.startsWith(`${hrefPathname}/`);
}

export function PrimaryHeaderNav({ homeHref = "/" }: PrimaryHeaderNavProps) {
  const pathname = usePathname();
  const dashboardPathname = toPathname(homeHref);
  const inboxHref = "/inbox";

  return (
    <nav aria-label="App navigation" className="hidden min-w-0 flex-1 items-center justify-center gap-2 md:flex">
      <NavItem active={isActivePath(pathname, dashboardPathname, { exact: dashboardPathname === "/" })} href={homeHref} variant="header">
        Dashboard
      </NavItem>
      <NavItem active={isActivePath(pathname, inboxHref)} href={inboxHref} variant="header">
        Inbox
      </NavItem>
    </nav>
  );
}
