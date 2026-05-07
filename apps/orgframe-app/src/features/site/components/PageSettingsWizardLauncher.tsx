"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { PageWizard } from "@/app/[orgSlug]/manage/website/PageWizard";
import { loadWebsiteManagerSnapshotAction } from "@/src/features/site/websiteManagerActions";
import type { OrgManagePage, OrgSiteStructureItem } from "@/src/features/site/types";

type Props = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  /** Slug of the page to edit (e.g. "home", "about"). */
  pageSlug: string;
};

/**
 * Lazily fetches the website manager snapshot, finds the structure item linked
 * to the given page slug, and opens the PageWizard in edit mode. Used from
 * the public page editor's "Page settings" button.
 */
export function PageSettingsWizardLauncher({ open, onClose, orgSlug, pageSlug }: Props) {
  const router = useRouter();
  const [items, setItems] = React.useState<OrgSiteStructureItem[] | null>(null);
  const [pages, setPages] = React.useState<OrgManagePage[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  // The launcher is mounted on the public page itself, so the current
  // window host IS the org's public host (custom domain or subdomain). Using
  // it directly avoids a round-trip to recompute server-side.
  const displayHost =
    typeof window !== "undefined" ? window.location.host : `${orgSlug}.orgframe.app`;

  React.useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    void loadWebsiteManagerSnapshotAction(orgSlug).then((res) => {
      if (cancelled) return;
      if (res.ok) {
        setItems(res.snapshot.items);
        setPages(res.snapshot.pages);
      } else {
        setError(res.error);
      }
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [open, orgSlug]);

  const editingItem = React.useMemo(() => {
    if (!items) return null;
    return (
      items.find(
        (item) =>
          item.type === "page" &&
          typeof item.linkTargetJson?.pageSlug === "string" &&
          item.linkTargetJson.pageSlug === pageSlug
      ) ?? null
    );
  }, [items, pageSlug]);

  const editingPage = React.useMemo(() => {
    if (!pages) return null;
    return pages.find((p) => p.slug === pageSlug) ?? null;
  }, [pages, pageSlug]);

  if (!open) return null;
  if (loading || !items) {
    // Snapshot still loading. The wizard's chrome will animate in once ready;
    // showing nothing avoids a flash of an empty wizard.
    return null;
  }
  if (error) {
    return null;
  }
  if (!editingItem) {
    // Page exists but has no structure-item entry yet (legacy flat page).
    // Fall back: nothing to edit via the wizard until someone adds a nav entry.
    return null;
  }

  return (
    <PageWizard
      displayHost={displayHost}
      editingItem={editingItem}
      editingPage={editingPage}
      mode="edit"
      onClose={onClose}
      onResult={(res) => {
        if (res.ok) {
          router.refresh();
          onClose();
        }
      }}
      open={open}
      orgSlug={orgSlug}
      parentItems={items}
    />
  );
}
