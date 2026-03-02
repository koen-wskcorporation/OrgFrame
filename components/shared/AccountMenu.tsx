"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { buttonVariants } from "@/components/ui/button";
import { NavItem } from "@/components/ui/nav-item";
import { cn } from "@/lib/utils";

type AccountMenuProps = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
  organizations?: {
    orgId: string;
    orgName: string;
    orgSlug: string;
    iconUrl: string | null;
  }[];
  signOutAction: (formData: FormData) => Promise<void>;
};

function initialsFromName(firstName?: string | null, lastName?: string | null, email?: string | null) {
  const first = firstName?.trim().charAt(0) ?? "";
  const last = lastName?.trim().charAt(0) ?? "";

  if (first || last) {
    return `${first}${last}`.toUpperCase();
  }

  return (email?.trim().charAt(0) ?? "A").toUpperCase();
}

export function AccountMenu({ email, firstName, lastName, avatarUrl, organizations = [], signOutAction }: AccountMenuProps) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current) {
        return;
      }

      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  const accountLabel = email ?? "Signed-in account";
  const fullName = useMemo(() => {
    const parts = [firstName?.trim(), lastName?.trim()].filter(Boolean) as string[];

    if (parts.length) {
      return parts.join(" ");
    }

    return "Account";
  }, [firstName, lastName]);
  const initials = initialsFromName(firstName, lastName, email);
  const currentOrgSlug = useMemo(() => {
    const [_, slug] = pathname.split("/");
    return slug ?? "";
  }, [pathname]);
  const orderedOrganizations = useMemo(() => {
    return [...organizations].sort((a, b) => {
      if (a.orgSlug === currentOrgSlug) {
        return -1;
      }
      if (b.orgSlug === currentOrgSlug) {
        return 1;
      }
      return a.orgName.localeCompare(b.orgName);
    });
  }, [currentOrgSlug, organizations]);
  const menuItems = useMemo(
    () => [
      {
        href: "/account",
        label: "Account settings",
        active: pathname === "/account" || pathname.startsWith("/account/")
      },
      {
        href: "/",
        label: "Home",
        active: pathname === "/"
      }
    ],
    [pathname]
  );

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className={cn(buttonVariants({ size: "md", variant: "ghost" }), "gap-2 px-2.5")}
        onClick={() => setOpen((prev) => !prev)}
        type="button"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={`${fullName} profile`} className="h-8 w-8 rounded-full border object-cover" src={avatarUrl} />
        ) : (
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-full border bg-surface-muted text-xs font-semibold text-text">
            {initials}
          </span>
        )}
        <span className="max-w-32 truncate text-sm font-semibold text-text">{fullName}</span>
        <ChevronDown className="h-4 w-4 text-text-muted" />
      </button>

      {open ? (
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[20rem] max-w-[calc(100vw-1rem)] rounded-card border bg-surface p-2 shadow-card" role="menu">
          <div className="space-y-1">
            {orderedOrganizations.length > 1 ? (
              <>
                <p className="px-3 pb-1 pt-1 text-xs font-semibold uppercase tracking-wide text-text-muted">Switch Organization</p>
                {orderedOrganizations.map((organization) => (
                  <NavItem
                    accentWhenActive
                    active={organization.orgSlug === currentOrgSlug}
                    href={`/${organization.orgSlug}`}
                    key={organization.orgId}
                    onClick={() => setOpen(false)}
                    role="menuitem"
                    size="md"
                    variant="sidebar"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {organization.iconUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center">
                          <img alt={`${organization.orgName} icon`} className="h-full w-full object-contain object-center" src={organization.iconUrl} />
                        </span>
                      ) : (
                        <span className="inline-flex h-6 min-w-6 shrink-0 items-center justify-center rounded-full border bg-surface-muted px-1.5 text-[10px] font-semibold text-text-muted">
                          {initialsFromName(organization.orgName, null, null)}
                        </span>
                      )}
                      <span className="truncate">{organization.orgName}</span>
                    </span>
                  </NavItem>
                ))}
                <div aria-hidden className="my-1 h-px bg-border" />
              </>
            ) : null}
            {menuItems.map((item) => (
              <NavItem
                accentWhenActive
                active={item.active}
                href={item.href}
                key={item.href}
                onClick={() => setOpen(false)}
                role="menuitem"
                size="md"
                variant="sidebar"
              >
                {item.label}
              </NavItem>
            ))}
            <form
              action={signOutAction}
              onSubmit={() => {
                setOpen(false);
              }}
            >
              <NavItem role="menuitem" size="md" type="submit" variant="sidebar">
                Sign out
              </NavItem>
            </form>
            <p className="px-3 pt-1 text-xs leading-relaxed text-text-muted">{accountLabel}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
