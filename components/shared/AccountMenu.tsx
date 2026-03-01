"use client";

import { ChevronDown } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { NavItem } from "@/components/ui/nav-item";

type AccountMenuProps = {
  email?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  avatarUrl?: string | null;
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

export function AccountMenu({ email, firstName, lastName, avatarUrl, signOutAction }: AccountMenuProps) {
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
        className="inline-flex items-center gap-2 rounded-control border border-transparent px-2 py-1 transition-colors hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
        <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[20rem] max-w-[calc(100vw-1rem)] rounded-card border bg-surface p-2 shadow-floating" role="menu">
          <div className="space-y-1">
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
            <p className="px-3 pt-1 text-xs text-text-muted">{accountLabel}</p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
