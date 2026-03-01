import { redirect } from "next/navigation";
import { AccountSidebar, AccountSidebarMobile } from "@/components/account/AccountSidebar";
import { UniversalAppShell } from "@/components/shared/UniversalAppShell";
import { requireAuth } from "@/lib/auth/requireAuth";

export default async function AccountLayout({ children }: { children: React.ReactNode }) {
  const user = await requireAuth().catch(() => null);

  if (!user) {
    redirect("/auth/login");
  }

  return <UniversalAppShell mobileSidebar={<AccountSidebarMobile />} sidebar={<AccountSidebar />}>{children}</UniversalAppShell>;
}
