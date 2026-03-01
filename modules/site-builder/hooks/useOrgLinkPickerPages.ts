"use client";

import { useCallback, useEffect, useMemo, useState, type Dispatch, type SetStateAction } from "react";
import type { LinkPickerPageOption } from "@/lib/links";
import { listOrgPagesForLinkPickerAction } from "@/modules/site-builder/actions";

const pageCache = new Map<string, LinkPickerPageOption[]>();

export function useOrgLinkPickerPages(orgSlug: string | null | undefined) {
  const cacheKey = orgSlug ?? "__none__";
  const [pages, setPages] = useState<LinkPickerPageOption[]>(() => pageCache.get(cacheKey) ?? []);
  const [loading, setLoading] = useState(Boolean(orgSlug) && !pageCache.has(cacheKey));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const activeOrgSlug = orgSlug;

    if (!activeOrgSlug) {
      setPages([
        {
          slug: "home",
          title: "Home",
          isPublished: true
        }
      ]);
      setLoading(false);
      setError(null);
      return () => undefined;
    }

    const resolvedOrgSlug: string = activeOrgSlug;
    let isCancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const result = await listOrgPagesForLinkPickerAction({
        orgSlug: resolvedOrgSlug
      });

      if (isCancelled) {
        return;
      }

      if (!result.ok) {
        setError(result.error);
        setLoading(false);
        return;
      }

      pageCache.set(cacheKey, result.pages);
      setPages(result.pages);
      setLoading(false);
    }

    if (!pageCache.has(cacheKey)) {
      void load();
      return () => {
        isCancelled = true;
      };
    }

    setPages(pageCache.get(cacheKey) ?? []);
    setLoading(false);

    return () => {
      isCancelled = true;
    };
  }, [cacheKey, orgSlug]);

  const homePage = useMemo(() => pages.find((page) => page.slug === "home") ?? null, [pages]);

  const setPagesWithCache = useCallback<Dispatch<SetStateAction<LinkPickerPageOption[]>>>(
    (value) => {
      setPages((current) => {
        const next = typeof value === "function" ? value(current) : value;
        pageCache.set(cacheKey, next);
        return next;
      });
    },
    [cacheKey]
  );

  return {
    pages,
    loading,
    error,
    homePage,
    setPages: setPagesWithCache
  };
}
