import type { Metadata } from "next";
import { requirePlatformAdmin } from "@/src/shared/auth/requirePlatformAdmin";

export const metadata: Metadata = {
  title: "Platform Admin"
};

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requirePlatformAdmin();
  return (
    <div className="min-h-screen bg-neutral-50">
      <header className="border-b bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <h1 className="text-lg font-semibold">Platform Admin</h1>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">{children}</main>
    </div>
  );
}
