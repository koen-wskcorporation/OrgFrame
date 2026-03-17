import { asText, defaultPageTitleFromSlug, sanitizePageSlug } from "@/modules/site-builder/blocks/helpers";
import { createDefaultBlocksForPage, normalizeDraftBlocks, normalizeRowBlocks } from "@/modules/site-builder/blocks/registry";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { LinkPickerPageOption } from "@/lib/links";
import type { BlockContext, DraftBlockInput, OrgManagePage, OrgNavItem, OrgSitePage, OrgSitePageWithBlocks } from "@/modules/site-builder/types";

const pageSelect = "id, org_id, slug, title, is_published, sort_index, created_at, updated_at";
const blockSelect = "id, type, sort_index, config";
const navSelect = "id, org_id, parent_id, label, link_type, page_slug, external_url, open_in_new_tab, is_visible, sort_index, created_at, updated_at";

type PageRow = {
  id: string;
  org_id: string;
  slug: string;
  title: string;
  is_published: boolean;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

type PageBlockRow = {
  id: string;
  type: string;
  sort_index: number;
  config: unknown;
};

type NavRow = {
  id: string;
  org_id: string;
  parent_id: string | null;
  label: string;
  link_type: "none" | "internal" | "external";
  page_slug: string | null;
  external_url: string | null;
  open_in_new_tab: boolean;
  is_visible: boolean;
  sort_index: number;
  created_at: string;
  updated_at: string;
};

function mapPage(row: PageRow): OrgSitePage {
  return {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    title: row.title,
    isPublished: row.is_published,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapManagePage(row: PageRow): OrgManagePage {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    isPublished: row.is_published,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapNavItem(row: NavRow): OrgNavItem {
  return {
    id: row.id,
    orgId: row.org_id,
    parentId: row.parent_id,
    label: row.label,
    linkType: row.link_type,
    pageSlug: row.page_slug,
    externalUrl: row.external_url,
    openInNewTab: row.open_in_new_tab,
    isVisible: row.is_visible,
    sortIndex: Number.isFinite(row.sort_index) ? row.sort_index : 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getNextPageSortIndex(orgId: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_pages")
    .select("sort_index")
    .eq("org_id", orgId)
    .order("sort_index", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to determine page order: ${error.message}`);
  }

  if (!data || typeof data.sort_index !== "number") {
    return 0;
  }

  return data.sort_index + 1;
}

async function getNextNavSortIndex(orgId: string, parentId: string | null) {
  const supabase = await createSupabaseServer();
  let query = supabase.from("org_nav_items").select("sort_index").eq("org_id", orgId).order("sort_index", { ascending: false }).limit(1);

  if (parentId) {
    query = query.eq("parent_id", parentId);
  } else {
    query = query.is("parent_id", null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to determine menu order: ${error.message}`);
  }

  if (!data || typeof data.sort_index !== "number") {
    return 0;
  }

  return data.sort_index + 1;
}

function sortNavItems(items: OrgNavItem[]) {
  return [...items].sort((a, b) => {
    if (a.parentId !== b.parentId) {
      const aKey = a.parentId ?? "";
      const bKey = b.parentId ?? "";
      return aKey.localeCompare(bKey);
    }

    if (a.sortIndex !== b.sortIndex) {
      return a.sortIndex - b.sortIndex;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

async function listRawOrgNavItems(orgId: string): Promise<OrgNavItem[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_nav_items")
    .select(navSelect)
    .eq("org_id", orgId)
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list org menu items: ${error.message}`);
  }

  return sortNavItems((data ?? []).map((row) => mapNavItem(row as NavRow)));
}

async function ensureOrgNavItemsSeeded(orgId: string, pages?: OrgManagePage[]) {
  const current = await listRawOrgNavItems(orgId);

  if (current.length > 0) {
    return current;
  }

  const sourcePages = pages ?? (await listOrgPagesForManage(orgId));

  if (sourcePages.length === 0) {
    return [];
  }

  const supabase = await createSupabaseServer();
  const orderedPages = [...sourcePages].sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt.localeCompare(b.createdAt));
  const { error } = await supabase.from("org_nav_items").insert(
    orderedPages.map((page, index) => ({
      org_id: orgId,
      parent_id: null,
      label: page.title,
      link_type: "internal",
      page_slug: page.slug,
      external_url: null,
      open_in_new_tab: false,
      is_visible: page.isPublished,
      sort_index: index
    }))
  );

  if (error) {
    // Another request may have seeded at the same time; return latest rows.
    return listRawOrgNavItems(orgId);
  }

  return listRawOrgNavItems(orgId);
}

async function loadBlocks(orgPageId: string, context: BlockContext) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_page_blocks").select(blockSelect).eq("org_page_id", orgPageId).order("sort_index", { ascending: true });

  if (error) {
    throw new Error(`Failed to load org page blocks: ${error.message}`);
  }

  return normalizeRowBlocks((data ?? []) as Array<{ id: string; type: string; sort_index: number | null; config: unknown }>, context);
}

async function loadPageBySlug(orgId: string, pageSlug: string, includeUnpublished: boolean) {
  const supabase = await createSupabaseServer();
  let query = supabase.from("org_pages").select(pageSelect).eq("org_id", orgId).eq("slug", pageSlug);

  if (!includeUnpublished) {
    query = query.eq("is_published", true);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to load org page: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapPage(data as PageRow);
}

export async function getOrgPageById(orgId: string, pageId: string): Promise<OrgSitePage | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_pages").select(pageSelect).eq("org_id", orgId).eq("id", pageId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load org page: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapPage(data as PageRow);
}

export async function getPublishedOrgPageBySlug({
  orgId,
  pageSlug,
  context
}: {
  orgId: string;
  pageSlug: string;
  context: BlockContext;
}): Promise<OrgSitePageWithBlocks | null> {
  const normalizedSlug = sanitizePageSlug(pageSlug);
  const page = await loadPageBySlug(orgId, normalizedSlug, false);

  if (!page) {
    return null;
  }

  const blocks = await loadBlocks(page.id, {
    ...context,
    pageSlug: normalizedSlug
  });

  return {
    page,
    blocks
  };
}

export async function getEditableOrgPageBySlug({
  orgId,
  pageSlug,
  context
}: {
  orgId: string;
  pageSlug: string;
  context: BlockContext;
}): Promise<OrgSitePageWithBlocks | null> {
  const normalizedSlug = sanitizePageSlug(pageSlug);
  const page = await loadPageBySlug(orgId, normalizedSlug, true);

  if (!page) {
    return null;
  }

  const blocks = await loadBlocks(page.id, {
    ...context,
    pageSlug: normalizedSlug
  });

  return {
    page,
    blocks
  };
}

export async function ensureOrgPageExists({
  orgId,
  pageSlug,
  title,
  context
}: {
  orgId: string;
  pageSlug: string;
  title?: string;
  context: BlockContext;
}): Promise<OrgSitePageWithBlocks> {
  const normalizedSlug = sanitizePageSlug(pageSlug);
  const existing = await getEditableOrgPageBySlug({
    orgId,
    pageSlug: normalizedSlug,
    context: {
      ...context,
      pageSlug: normalizedSlug
    }
  });

  if (existing) {
    await ensureInternalNavItemForPage({
      orgId,
      pageSlug: existing.page.slug,
      label: existing.page.title,
      isVisible: existing.page.isPublished
    });

    return existing;
  }

  const supabase = await createSupabaseServer();
  const nextTitle = asText(title, defaultPageTitleFromSlug(normalizedSlug), 120);
  const nextSortIndex = await getNextPageSortIndex(orgId);
  const { data, error } = await supabase
    .from("org_pages")
    .insert({
      org_id: orgId,
      slug: normalizedSlug,
      title: nextTitle,
      is_published: true,
      sort_index: nextSortIndex
    })
    .select(pageSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create org page: ${error.message}`);
  }

  const page = mapPage(data as PageRow);
  await ensureInternalNavItemForPage({
    orgId,
    pageSlug: page.slug,
    label: page.title,
    isVisible: page.isPublished
  });

  const defaultBlocks = createDefaultBlocksForPage(normalizedSlug, {
    ...context,
    pageSlug: normalizedSlug
  });

  const { error: insertBlocksError } = await supabase.from("org_page_blocks").insert(
    defaultBlocks.map((block, index) => ({
      org_page_id: page.id,
      type: block.type,
      sort_index: index,
      config: block.config
    }))
  );

  if (insertBlocksError) {
    throw new Error(`Failed to seed org page blocks: ${insertBlocksError.message}`);
  }

  const blocks = await loadBlocks(page.id, {
    ...context,
    pageSlug: normalizedSlug
  });

  return {
    page,
    blocks
  };
}

export async function saveOrgPageAndBlocks({
  orgId,
  pageSlug,
  title,
  isPublished,
  blocks,
  context
}: {
  orgId: string;
  pageSlug: string;
  title: string;
  isPublished: boolean;
  blocks: DraftBlockInput[];
  context: BlockContext;
}): Promise<OrgSitePageWithBlocks> {
  const normalizedSlug = sanitizePageSlug(pageSlug);
  const normalizedBlocks = normalizeDraftBlocks(blocks, {
    ...context,
    pageSlug: normalizedSlug
  });

  const existing = await ensureOrgPageExists({
    orgId,
    pageSlug: normalizedSlug,
    title,
    context: {
      ...context,
      pageSlug: normalizedSlug
    }
  });

  const supabase = await createSupabaseServer();
  const nextTitle = asText(title, existing.page.title, 120);
  const { data: updatedPage, error: updateError } = await supabase
    .from("org_pages")
    .update({
      title: nextTitle,
      is_published: isPublished
    })
    .eq("id", existing.page.id)
    .select(pageSelect)
    .single();

  if (updateError) {
    throw new Error(`Failed to update org page: ${updateError.message}`);
  }

  const { error: deleteError } = await supabase.from("org_page_blocks").delete().eq("org_page_id", existing.page.id);

  if (deleteError) {
    throw new Error(`Failed to replace org page blocks: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase.from("org_page_blocks").insert(
    normalizedBlocks.map((block, index) => ({
      org_page_id: existing.page.id,
      type: block.type,
      sort_index: index,
      config: block.config
    }))
  );

  if (insertError) {
    throw new Error(`Failed to save org page blocks: ${insertError.message}`);
  }

  const savedBlocks = await loadBlocks(existing.page.id, {
    ...context,
    pageSlug: normalizedSlug
  });

  return {
    page: mapPage(updatedPage as PageRow),
    blocks: savedBlocks
  };
}

async function ensureInternalNavItemForPage({
  orgId,
  pageSlug,
  label,
  isVisible
}: {
  orgId: string;
  pageSlug: string;
  label: string;
  isVisible: boolean;
}) {
  const supabase = await createSupabaseServer();
  const { data: existing, error: existingError } = await supabase
    .from("org_nav_items")
    .select("id")
    .eq("org_id", orgId)
    .eq("link_type", "internal")
    .eq("page_slug", pageSlug)
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load menu links: ${existingError.message}`);
  }

  if (existing) {
    return;
  }

  const sortIndex = await getNextNavSortIndex(orgId, null);
  const { error } = await supabase.from("org_nav_items").insert({
    org_id: orgId,
    parent_id: null,
    label,
    link_type: "internal",
    page_slug: pageSlug,
    external_url: null,
    open_in_new_tab: false,
    is_visible: isVisible,
    sort_index: sortIndex
  });

  if (error) {
    throw new Error(`Failed to create menu link: ${error.message}`);
  }
}

export async function listOrgNavItemsForManage(orgId: string): Promise<OrgNavItem[]> {
  const pages = await listOrgPagesForManage(orgId);
  return ensureOrgNavItemsSeeded(orgId, pages);
}

export async function getOrgNavItemById(orgId: string, itemId: string): Promise<OrgNavItem | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_nav_items").select(navSelect).eq("org_id", orgId).eq("id", itemId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load menu item: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapNavItem(data as NavRow);
}

export async function listOrgNavItemsForHeader({
  orgId,
  includeUnpublished
}: {
  orgId: string;
  includeUnpublished: boolean;
}): Promise<OrgNavItem[]> {
  const pages = await listOrgPagesForHeader({
    orgId,
    includeUnpublished: true
  });
  const items = await ensureOrgNavItemsSeeded(orgId, pages);

  if (includeUnpublished) {
    return items;
  }

  const pageBySlug = new Map(pages.map((page) => [page.slug, page]));
  const byParent = new Map<string | null, OrgNavItem[]>();

  for (const item of items) {
    const list = byParent.get(item.parentId) ?? [];
    list.push(item);
    byParent.set(item.parentId, list);
  }

  const filtered: OrgNavItem[] = [];

  const walk = (parentId: string | null): boolean => {
    const children = byParent.get(parentId) ?? [];
    let hasVisibleDescendant = false;

    for (const child of children) {
      const childHasDescendant = walk(child.id);
      const linkedPage = child.pageSlug ? pageBySlug.get(child.pageSlug) ?? null : null;
      const hasValidLink =
        child.linkType === "external"
          ? Boolean(child.externalUrl)
          : child.linkType === "internal"
            ? Boolean(linkedPage?.isPublished)
            : false;
      const shouldInclude = child.isVisible && (hasValidLink || childHasDescendant);

      if (shouldInclude) {
        filtered.push(child);
        hasVisibleDescendant = true;
      }
    }

    return hasVisibleDescendant;
  };

  walk(null);

  return sortNavItems(filtered);
}

export async function createOrgNavItem({
  orgId,
  parentId,
  label,
  linkType,
  pageSlug,
  externalUrl,
  openInNewTab,
  isVisible
}: {
  orgId: string;
  parentId: string | null;
  label: string;
  linkType: OrgNavItem["linkType"];
  pageSlug?: string | null;
  externalUrl?: string | null;
  openInNewTab?: boolean;
  isVisible?: boolean;
}): Promise<OrgNavItem> {
  const supabase = await createSupabaseServer();
  const sortIndex = await getNextNavSortIndex(orgId, parentId);
  const payload = {
    org_id: orgId,
    parent_id: parentId,
    label,
    link_type: linkType,
    page_slug: linkType === "internal" ? pageSlug ?? null : null,
    external_url: linkType === "external" ? externalUrl ?? null : null,
    open_in_new_tab: linkType === "external" ? Boolean(openInNewTab) : false,
    is_visible: isVisible ?? true,
    sort_index: sortIndex
  };

  const { data, error } = await supabase.from("org_nav_items").insert(payload).select(navSelect).single();

  if (error) {
    throw new Error(`Failed to create menu item: ${error.message}`);
  }

  return mapNavItem(data as NavRow);
}

export async function updateOrgNavItemById({
  orgId,
  itemId,
  label,
  isVisible,
  linkType,
  pageSlug,
  externalUrl,
  openInNewTab
}: {
  orgId: string;
  itemId: string;
  label?: string;
  isVisible?: boolean;
  linkType?: OrgNavItem["linkType"];
  pageSlug?: string | null;
  externalUrl?: string | null;
  openInNewTab?: boolean;
}): Promise<OrgNavItem | null> {
  const supabase = await createSupabaseServer();
  const updates: Record<string, unknown> = {};

  if (label !== undefined) {
    updates.label = label;
  }

  if (isVisible !== undefined) {
    updates.is_visible = isVisible;
  }

  if (linkType !== undefined) {
    updates.link_type = linkType;
    updates.page_slug = linkType === "internal" ? pageSlug ?? null : null;
    updates.external_url = linkType === "external" ? externalUrl ?? null : null;
    updates.open_in_new_tab = linkType === "external" ? Boolean(openInNewTab) : false;
  }

  if (Object.keys(updates).length === 0) {
    const current = await supabase.from("org_nav_items").select(navSelect).eq("org_id", orgId).eq("id", itemId).maybeSingle();

    if (current.error) {
      throw new Error(`Failed to load menu item: ${current.error.message}`);
    }

    return current.data ? mapNavItem(current.data as NavRow) : null;
  }

  const { data, error } = await supabase.from("org_nav_items").update(updates).eq("org_id", orgId).eq("id", itemId).select(navSelect).maybeSingle();

  if (error) {
    throw new Error(`Failed to update menu item: ${error.message}`);
  }

  return data ? mapNavItem(data as NavRow) : null;
}

export async function deleteOrgNavItemById(orgId: string, itemId: string): Promise<boolean> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_nav_items").delete().eq("org_id", orgId).eq("id", itemId).select("id").maybeSingle();

  if (error) {
    throw new Error(`Failed to delete menu item: ${error.message}`);
  }

  return Boolean(data);
}

export async function deleteOrgNavItemsByPageSlug(orgId: string, pageSlug: string) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase.from("org_nav_items").delete().eq("org_id", orgId).eq("link_type", "internal").eq("page_slug", pageSlug);

  if (error) {
    throw new Error(`Failed to delete menu links: ${error.message}`);
  }
}

export async function syncOrgNavItemsForPageSettings({
  orgId,
  previousSlug,
  nextSlug,
  nextTitle
}: {
  orgId: string;
  previousSlug: string;
  nextSlug: string;
  nextTitle: string;
}) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .from("org_nav_items")
    .update({
      page_slug: nextSlug,
      label: nextTitle
    })
    .eq("org_id", orgId)
    .eq("link_type", "internal")
    .eq("page_slug", previousSlug);

  if (error) {
    throw new Error(`Failed to sync menu links: ${error.message}`);
  }
}

export async function saveOrgNavItemsTree(
  orgId: string,
  items: Array<{
    id: string;
    parentId: string | null;
    sortIndex: number;
  }>
) {
  const supabase = await createSupabaseServer();
  const offset = items.length + 2000;

  for (const [index, item] of items.entries()) {
    const { error } = await supabase
      .from("org_nav_items")
      .update({
        parent_id: item.parentId,
        sort_index: offset + index
      })
      .eq("org_id", orgId)
      .eq("id", item.id);

    if (error) {
      throw new Error(`Failed to stage menu order: ${error.message}`);
    }
  }

  for (const item of items) {
    const { error } = await supabase
      .from("org_nav_items")
      .update({
        sort_index: item.sortIndex
      })
      .eq("org_id", orgId)
      .eq("id", item.id);

    if (error) {
      throw new Error(`Failed to save menu order: ${error.message}`);
    }
  }
}

export async function listOrgPagesForManage(orgId: string): Promise<OrgManagePage[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_pages")
    .select(pageSelect)
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list org pages: ${error.message}`);
  }

  return (data ?? []).map((row) => mapManagePage(row as PageRow));
}

export async function listOrgPagesForHeader({
  orgId,
  includeUnpublished
}: {
  orgId: string;
  includeUnpublished: boolean;
}): Promise<OrgManagePage[]> {
  const supabase = await createSupabaseServer();
  let query = supabase
    .from("org_pages")
    .select(pageSelect)
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeUnpublished) {
    query = query.eq("is_published", true);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Failed to list org pages: ${error.message}`);
  }

  return (data ?? []).map((row) => mapManagePage(row as PageRow));
}

export async function updateOrgPageSettingsById({
  orgId,
  pageId,
  title,
  slug,
  isPublished
}: {
  orgId: string;
  pageId: string;
  title: string;
  slug: string;
  isPublished: boolean;
}): Promise<OrgManagePage | null> {
  const supabase = await createSupabaseServer();
  const { data: existing, error: existingError } = await supabase
    .from("org_pages")
    .select(pageSelect)
    .eq("org_id", orgId)
    .eq("id", pageId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load page settings: ${existingError.message}`);
  }

  if (!existing) {
    return null;
  }

  const previousPage = mapManagePage(existing as PageRow);
  const { data, error } = await supabase
    .from("org_pages")
    .update({
      title,
      slug,
      is_published: isPublished
    })
    .eq("org_id", orgId)
    .eq("id", pageId)
    .select(pageSelect)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update page settings: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const updated = mapManagePage(data as PageRow);
  await syncOrgNavItemsForPageSettings({
    orgId,
    previousSlug: previousPage.slug,
    nextSlug: updated.slug,
    nextTitle: updated.title
  });

  return updated;
}

export async function duplicateOrgPageWithBlocks({
  orgId,
  sourcePageId,
  slug,
  title
}: {
  orgId: string;
  sourcePageId: string;
  slug: string;
  title: string;
}): Promise<OrgManagePage | null> {
  const supabase = await createSupabaseServer();
  const { data: sourcePage, error: sourcePageError } = await supabase
    .from("org_pages")
    .select(pageSelect)
    .eq("org_id", orgId)
    .eq("id", sourcePageId)
    .maybeSingle();

  if (sourcePageError) {
    throw new Error(`Failed to load source page: ${sourcePageError.message}`);
  }

  if (!sourcePage) {
    return null;
  }

  const nextSortIndex = await getNextPageSortIndex(orgId);
  const source = sourcePage as PageRow;
  const { data: duplicatedPage, error: duplicatedPageError } = await supabase
    .from("org_pages")
    .insert({
      org_id: orgId,
      slug,
      title,
      is_published: false,
      sort_index: nextSortIndex
    })
    .select(pageSelect)
    .single();

  if (duplicatedPageError) {
    throw new Error(`Failed to duplicate page: ${duplicatedPageError.message}`);
  }

  const { data: sourceBlocks, error: sourceBlocksError } = await supabase
    .from("org_page_blocks")
    .select(blockSelect)
    .eq("org_page_id", source.id)
    .order("sort_index", { ascending: true });

  if (sourceBlocksError) {
    throw new Error(`Failed to load source blocks: ${sourceBlocksError.message}`);
  }

  const blockRows = (sourceBlocks ?? []) as PageBlockRow[];

  if (blockRows.length > 0) {
    const { error: insertBlocksError } = await supabase.from("org_page_blocks").insert(
      blockRows.map((blockRow, index) => ({
        org_page_id: String((duplicatedPage as PageRow).id),
        type: blockRow.type,
        sort_index: index,
        config: blockRow.config
      }))
    );

    if (insertBlocksError) {
      throw new Error(`Failed to duplicate page blocks: ${insertBlocksError.message}`);
    }
  }

  const mapped = mapManagePage(duplicatedPage as PageRow);
  await ensureInternalNavItemForPage({
    orgId,
    pageSlug: mapped.slug,
    label: mapped.title,
    isVisible: mapped.isPublished
  });

  return mapped;
}

export async function deleteOrgPageById(orgId: string, pageId: string): Promise<boolean> {
  const supabase = await createSupabaseServer();
  const { data: existing, error: existingError } = await supabase
    .from("org_pages")
    .select("id, slug")
    .eq("org_id", orgId)
    .eq("id", pageId)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load page: ${existingError.message}`);
  }

  if (!existing) {
    return false;
  }

  const { data, error } = await supabase.from("org_pages").delete().eq("org_id", orgId).eq("id", pageId).select("id").maybeSingle();

  if (error) {
    throw new Error(`Failed to delete page: ${error.message}`);
  }

  if (data) {
    await deleteOrgNavItemsByPageSlug(orgId, String(existing.slug));
  }

  return Boolean(data);
}

export async function reorderOrgPages(orgId: string, orderedPageIds: string[]): Promise<OrgManagePage[]> {
  const supabase = await createSupabaseServer();
  const offset = orderedPageIds.length + 1000;

  for (const [index, pageId] of orderedPageIds.entries()) {
    const { error } = await supabase.from("org_pages").update({ sort_index: index + offset }).eq("org_id", orgId).eq("id", pageId);

    if (error) {
      throw new Error(`Failed to stage page order: ${error.message}`);
    }
  }

  for (const [index, pageId] of orderedPageIds.entries()) {
    const { error } = await supabase.from("org_pages").update({ sort_index: index }).eq("org_id", orgId).eq("id", pageId);

    if (error) {
      throw new Error(`Failed to save page order: ${error.message}`);
    }
  }

  return listOrgPagesForManage(orgId);
}

export async function listOrgPagesForLinkPicker(orgId: string): Promise<LinkPickerPageOption[]> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .from("org_pages")
    .select("slug, title, is_published, sort_index, created_at")
    .eq("org_id", orgId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list org pages: ${error.message}`);
  }

  const pages = (data ?? []).map((row) => ({
    slug: String(row.slug),
    title: String(row.title),
    isPublished: Boolean(row.is_published)
  }));

  const hasHome = pages.some((page) => page.slug === "home");

  if (!hasHome) {
    return [
      {
        slug: "home",
        title: "Home",
        isPublished: true
      },
      ...pages
    ];
  }

  return pages;
}
