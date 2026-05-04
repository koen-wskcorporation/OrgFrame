"use client";

import { usePathname } from "next/navigation";
import { PageTabs } from "@orgframe/ui/primitives/page-tabs";

type FormPageTabsProps = {
  orgSlug: string;
  formId: string;
};

export function FormPageTabs({ orgSlug, formId }: FormPageTabsProps) {
  const pathname = usePathname() ?? "";
  const base = `/${orgSlug}/manage/forms/${formId}`;
  const active = pathname.endsWith("/settings")
    ? "settings"
    : pathname.endsWith("/submissions")
      ? "submissions"
      : "builder";

  return (
    <PageTabs
      active={active}
      ariaLabel="Form pages"
      items={[
        { key: "builder", label: "Builder", description: "Fields, pages, and logic", href: `${base}/editor`, prefetch: false },
        { key: "submissions", label: "Submissions", description: "Review, triage, and exports", href: `${base}/submissions`, prefetch: false },
        { key: "settings", label: "Settings", description: "Metadata, publishing, and rules", href: `${base}/settings`, prefetch: false }
      ]}
    />
  );
}
