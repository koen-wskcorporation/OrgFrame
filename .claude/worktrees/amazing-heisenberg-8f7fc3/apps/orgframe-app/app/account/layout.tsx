import { redirect } from "next/navigation";
import { AccountSidebar, AccountSidebarMobile } from "@/src/features/core/account/components/AccountSidebar";
import { UniversalAppShell } from "@/src/features/core/layout/components/UniversalAppShell";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth().catch(() => null);

  if (!user) {
    redirect("/auth");
  }

  return <UniversalAppShell mobileSidebar={<AccountSidebarMobile />} sidebar={<AccountSidebar />}>{children}</UniversalAppShell>;
}
