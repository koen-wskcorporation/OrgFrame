import { redirect } from "next/navigation";
import { AccountSidebar, AccountSidebarMobile } from "@/src/features/core/account/components/AccountSidebar";
import { AppShell } from "@/src/features/core/layout/components/AppShell";
import { SidebarShell } from "@/src/features/core/layout/components/SidebarShell";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";

export default async function AccountAreaLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth().catch(() => null);

  if (!user) {
    redirect("/auth");
  }

  return (
    <AppShell topbar={null}>
      <SidebarShell
        sidebar={
          <>
            <div className="hidden lg:block"><AccountSidebar /></div>
            <div className="lg:hidden"><AccountSidebarMobile /></div>
          </>
        }
      >
        {children}
      </SidebarShell>
    </AppShell>
  );
}
