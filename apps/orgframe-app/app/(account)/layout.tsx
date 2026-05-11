import { redirect } from "next/navigation";
import { AppShell } from "@/src/features/core/layout/components/AppShell";
import { AccountSidebar } from "@/src/features/core/account/components/AccountSidebar";
import { getCurrentUser } from "@/src/features/core/account/server/getCurrentUser";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";
import { listUserOrgs } from "@/src/shared/org/listUserOrgs";

export default async function AccountAreaLayout({ children }: { children: React.ReactNode }) {
  const sessionUser = await requireAuth().catch(() => null);
  if (!sessionUser) {
    redirect("/auth");
  }

  const [currentUser, memberships] = await Promise.all([
    getCurrentUser({ sessionUser }).catch(() => null),
    listUserOrgs().catch(() => [])
  ]);

  return (
    <AppShell
      topbar={null}
      sidebar={
        <AccountSidebar
          avatarUrl={currentUser?.avatarUrl ?? null}
          email={currentUser?.email ?? sessionUser.email ?? null}
          firstName={currentUser?.firstName ?? null}
          lastName={currentUser?.lastName ?? null}
          orgCount={memberships.length}
        />
      }
    >
      {children}
    </AppShell>
  );
}
