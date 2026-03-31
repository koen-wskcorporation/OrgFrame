import { asText, defaultPageTitleFromSlug, sanitizePageSlug } from "@/src/features/site/blocks/helpers";
import { createDefaultBlocksForPage, normalizeDraftBlocks, normalizeRowBlocks } from "@/src/features/site/blocks/registry";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { LinkPickerPageOption } from "@/src/shared/links";
import { listPublishedCalendarCatalog } from "@/src/features/calendar/db/queries";
import { listPublishedFormsForOrg } from "@/src/features/forms/db/queries";
import { listProgramNodes, listPublishedProgramsForCatalog } from "@/src/features/programs/db/queries";
import type {
  BlockContext,
  DraftBlockInput,
  OrgManagePage,
  OrgNavItem,
  OrgSitePage,
  OrgSitePageWithBlocks,
  OrgSiteStructureItem,
  ResolvedOrgSiteStructureItemNode
} from "@/src/features/site/types";

const pageSelect =
  "id, org_id, slug, title, is_published, page_lifecycle, temporary_window_start_utc, temporary_window_end_utc, sort_index, created_at, updated_at";
const blockSelect = "id, type, sort_index, config";
const navSelect = "id, org_id, parent_id, label, link_type, page_slug, external_url, open_in_new_tab, is_visible, sort_index, created_at, updated_at";
const siteStructureItemSelect =
  "id, org_id, parent_id, type, title, slug, url_path, description, icon, show_in_menu, is_published, open_in_new_tab, order_index, dynamic_config_json, link_target_json, flags_json, created_at, updated_at";

type PageRow = {
  id: string;
  org_id: string;
  slug: string;
  title: string;
  is_published: boolean;
  page_lifecycle: "permanent" | "temporary";
  temporary_window_start_utc: string | null;
  temporary_window_end_utc: string | null;
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

type SiteStructureItemRow = {
  id: string;
  org_id: string;
  parent_id: string | null;
  type: OrgSiteStructureItem["type"];
  title: string;
  slug: string;
  url_path: string;
  description: string | null;
  icon: string | null;
  show_in_menu: boolean;
  is_published: boolean;
  open_in_new_tab: boolean;
  order_index: number;
  dynamic_config_json: unknown;
  link_target_json: unknown;
  flags_json: unknown;
  created_at: string;
  updated_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapPage(row: PageRow): OrgSitePage {
  return {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    title: row.title,
    isPublished: row.is_published,
    pageLifecycle: row.page_lifecycle === "temporary" ? "temporary" : "permanent",
    temporaryWindowStartUtc: row.temporary_window_start_utc,
    temporaryWindowEndUtc: row.temporary_window_end_utc,
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
    pageLifecycle: row.page_lifecycle === "temporary" ? "temporary" : "permanent",
    temporaryWindowStartUtc: row.temporary_window_start_utc,
    temporaryWindowEndUtc: row.temporary_window_end_utc,
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

function mapSiteStructureItemToNavItem(item: OrgSiteStructureItem): OrgNavItem {
  const linkTarget = item.linkTargetJson ?? {};
  const kind = typeof linkTarget.kind === "string" ? linkTarget.kind : "none";
  const linkType: OrgNavItem["linkType"] = kind === "page" ? "internal" : kind === "external" ? "external" : "none";
  return {
    id: item.id,
    orgId: item.orgId,
    parentId: item.parentId,
    label: item.title,
    linkType,
    pageSlug: linkType === "internal" && typeof linkTarget.pageSlug === "string" ? linkTarget.pageSlug : null,
    externalUrl: linkType === "external" && typeof linkTarget.url === "string" ? linkTarget.url : null,
    openInNewTab: item.openInNewTab,
    isVisible: item.showInMenu,
    sortIndex: item.orderIndex,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt
  };
}

function mapSiteStructureItem(row: SiteStructureItemRow): OrgSiteStructureItem {
  return {
    id: row.id,
    orgId: row.org_id,
    parentId: row.parent_id,
    type: row.type,
    title: row.title,
    slug: row.slug,
    urlPath: row.url_path,
    description: row.description,
    icon: row.icon,
    showInMenu: Boolean(row.show_in_menu),
    isPublished: Boolean(row.is_published),
    openInNewTab: Boolean(row.open_in_new_tab),
    orderIndex: Number.isFinite(row.order_index) ? row.order_index : 0,
    dynamicConfigJson: asObject(row.dynamic_config_json),
    linkTargetJson: asObject(row.link_target_json),
    flagsJson: asObject(row.flags_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function getNextPageSortIndex(orgId: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("site").from("site_pages")
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
  let query = supabase.schema("site").from("org_site_structure_items").select("order_index").eq("org_id", orgId).order("order_index", { ascending: false }).limit(1);

  if (parentId) {
    query = query.eq("parent_id", parentId);
  } else {
    query = query.is("parent_id", null);
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to determine menu order: ${error.message}`);
  }

  if (!data || typeof data.order_index !== "number") {
    return 0;
  }

  return data.order_index + 1;
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
  const items = await listOrgSiteStructureNodesForManage(orgId);
  return sortNavItems(items.map((item) => mapSiteStructureItemToNavItem(item)));
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

  const orderedPages = [...sourcePages].sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt.localeCompare(b.createdAt));
  for (const page of orderedPages) {
    await createOrgSiteStructureNode({
      orgId,
      parentId: null,
      type: "page",
      title: page.title,
      slug: page.slug,
      urlPath: page.slug === "home" ? "/" : `/${page.slug}`,
      description: null,
      icon: null,
      showInMenu: page.isPublished,
      isPublished: page.isPublished,
      openInNewTab: false,
      dynamicConfigJson: {},
      linkTargetJson: { kind: "page", pageSlug: page.slug },
      flagsJson: {}
    });
  }

  return listRawOrgNavItems(orgId);
}

async function loadBlocks(orgPageId: string, context: BlockContext) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("site").from("site_page_blocks").select(blockSelect).eq("org_page_id", orgPageId).order("sort_index", { ascending: true });

  if (error) {
    throw new Error(`Failed to load org page blocks: ${error.message}`);
  }

  return normalizeRowBlocks((data ?? []) as Array<{ id: string; type: string; sort_index: number | null; config: unknown }>, context);
}

async function loadPageBySlug(orgId: string, pageSlug: string, includeUnpublished: boolean) {
  const supabase = await createSupabaseServer();
  let query = supabase.schema("site").from("site_pages").select(pageSelect).eq("org_id", orgId).eq("slug", pageSlug);

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

  const mapped = mapPage(data as PageRow);

  if (!includeUnpublished && mapped.pageLifecycle === "temporary") {
    const nowIso = new Date().toISOString();
    if (mapped.temporaryWindowStartUtc && mapped.temporaryWindowStartUtc > nowIso) {
      return null;
    }
    if (mapped.temporaryWindowEndUtc && mapped.temporaryWindowEndUtc <= nowIso) {
      return null;
    }
  }

  return mapped;
}

export async function getOrgPageById(orgId: string, pageId: string): Promise<OrgSitePage | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("site").from("site_pages").select(pageSelect).eq("org_id", orgId).eq("id", pageId).maybeSingle();

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
    .schema("site").from("site_pages")
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

  const { error: insertBlocksError } = await supabase.schema("site").from("site_page_blocks").insert(
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
    .schema("site").from("site_pages")
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

  const { error: deleteError } = await supabase.schema("site").from("site_page_blocks").delete().eq("org_page_id", existing.page.id);

  if (deleteError) {
    throw new Error(`Failed to replace org page blocks: ${deleteError.message}`);
  }

  const { error: insertError } = await supabase.schema("site").from("site_page_blocks").insert(
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
    .schema("site").from("org_site_structure_items")
    .select("id")
    .eq("org_id", orgId)
    .contains("link_target_json", { kind: "page", pageSlug })
    .limit(1)
    .maybeSingle();

  if (existingError) {
    throw new Error(`Failed to load menu links: ${existingError.message}`);
  }

  if (existing) {
    return;
  }

  await createOrgSiteStructureNode({
    orgId,
    parentId: null,
    type: "page",
    title: label,
    slug: pageSlug,
    urlPath: pageSlug === "home" ? "/" : `/${pageSlug}`,
    description: null,
    icon: null,
    showInMenu: isVisible,
    isPublished: true,
    openInNewTab: false,
    dynamicConfigJson: {},
    linkTargetJson: { kind: "page", pageSlug },
    flagsJson: {}
  });
}

export async function listOrgNavItemsForManage(orgId: string): Promise<OrgNavItem[]> {
  const pages = await listOrgPagesForManage(orgId);
  return ensureOrgNavItemsSeeded(orgId, pages);
}

export async function getOrgNavItemById(orgId: string, itemId: string): Promise<OrgNavItem | null> {
  const item = await getOrgSiteStructureNodeById(orgId, itemId);
  return item ? mapSiteStructureItemToNavItem(item) : null;
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
  const created = await createOrgSiteStructureNode({
    orgId,
    parentId,
    type: linkType === "none" ? "placeholder" : "page",
    title: label,
    slug: linkType === "internal" ? pageSlug ?? slugifyNavLabel(label) : slugifyNavLabel(label),
    urlPath: linkType === "external" ? externalUrl ?? "/" : linkType === "internal" ? (pageSlug === "home" ? "/" : `/${pageSlug ?? ""}`) : "/",
    description: null,
    icon: null,
    showInMenu: isVisible ?? true,
    isPublished: true,
    openInNewTab: linkType === "external" ? Boolean(openInNewTab) : false,
    dynamicConfigJson: {},
    linkTargetJson:
      linkType === "internal"
        ? { kind: "page", pageSlug: pageSlug ?? "home" }
        : linkType === "external"
          ? { kind: "external", url: externalUrl ?? "" }
          : { kind: "none" },
    flagsJson: {}
  });

  return mapSiteStructureItemToNavItem(created);
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
  const current = await getOrgSiteStructureNodeById(orgId, itemId);
  if (!current) {
    return null;
  }

  const nextLinkType = linkType ?? mapSiteStructureItemToNavItem(current).linkType;
  const updated = await updateOrgSiteStructureNodeById({
    orgId,
    nodeId: itemId,
    title: label ?? current.title,
    showInMenu: isVisible ?? current.showInMenu,
    openInNewTab: nextLinkType === "external" ? Boolean(openInNewTab) : false,
    linkTargetJson:
      nextLinkType === "internal"
        ? { kind: "page", pageSlug: pageSlug ?? "home" }
        : nextLinkType === "external"
          ? { kind: "external", url: externalUrl ?? "" }
          : { kind: "none" },
    urlPath:
      nextLinkType === "internal"
        ? pageSlug === "home"
          ? "/"
          : `/${pageSlug ?? ""}`
        : nextLinkType === "external"
          ? externalUrl ?? current.urlPath
          : current.urlPath
  });
  return updated ? mapSiteStructureItemToNavItem(updated) : null;
}

export async function deleteOrgNavItemById(orgId: string, itemId: string): Promise<boolean> {
  return deleteOrgSiteStructureNodeById(orgId, itemId);
}

export async function deleteOrgNavItemsByPageSlug(orgId: string, pageSlug: string) {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("site").from("org_site_structure_items")
    .delete()
    .eq("org_id", orgId)
    .contains("link_target_json", { kind: "page", pageSlug });

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
    .schema("site").from("org_site_structure_items")
    .update({
      title: nextTitle,
      slug: nextSlug,
      url_path: nextSlug === "home" ? "/" : `/${nextSlug}`,
      link_target_json: { kind: "page", pageSlug: nextSlug }
    })
    .eq("org_id", orgId)
    .contains("link_target_json", { kind: "page", pageSlug: previousSlug });

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
  await reorderOrgSiteStructureNodes(orgId, items);
}

function slugifyNavLabel(label: string) {
  return label
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "") || "item";
}

export async function listOrgPagesForManage(orgId: string): Promise<OrgManagePage[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("site").from("site_pages")
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
    .schema("site").from("site_pages")
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
  isPublished,
  pageLifecycle,
  temporaryWindowStartUtc,
  temporaryWindowEndUtc
}: {
  orgId: string;
  pageId: string;
  title: string;
  slug: string;
  isPublished: boolean;
  pageLifecycle?: OrgManagePage["pageLifecycle"];
  temporaryWindowStartUtc?: string | null;
  temporaryWindowEndUtc?: string | null;
}): Promise<OrgManagePage | null> {
  const supabase = await createSupabaseServer();
  const { data: existing, error: existingError } = await supabase
    .schema("site").from("site_pages")
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
    .schema("site").from("site_pages")
    .update({
      title,
      slug,
      is_published: isPublished,
      page_lifecycle: pageLifecycle,
      temporary_window_start_utc: temporaryWindowStartUtc,
      temporary_window_end_utc: temporaryWindowEndUtc
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
    .schema("site").from("site_pages")
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
    .schema("site").from("site_pages")
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
    .schema("site").from("site_page_blocks")
    .select(blockSelect)
    .eq("org_page_id", source.id)
    .order("sort_index", { ascending: true });

  if (sourceBlocksError) {
    throw new Error(`Failed to load source blocks: ${sourceBlocksError.message}`);
  }

  const blockRows = (sourceBlocks ?? []) as PageBlockRow[];

  if (blockRows.length > 0) {
    const { error: insertBlocksError } = await supabase.schema("site").from("site_page_blocks").insert(
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
    .schema("site").from("site_pages")
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

  const { data, error } = await supabase.schema("site").from("site_pages").delete().eq("org_id", orgId).eq("id", pageId).select("id").maybeSingle();

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
    const { error } = await supabase.schema("site").from("site_pages").update({ sort_index: index + offset }).eq("org_id", orgId).eq("id", pageId);

    if (error) {
      throw new Error(`Failed to stage page order: ${error.message}`);
    }
  }

  for (const [index, pageId] of orderedPageIds.entries()) {
    const { error } = await supabase.schema("site").from("site_pages").update({ sort_index: index }).eq("org_id", orgId).eq("id", pageId);

    if (error) {
      throw new Error(`Failed to save page order: ${error.message}`);
    }
  }

  return listOrgPagesForManage(orgId);
}

export async function listOrgPagesForLinkPicker(orgId: string): Promise<LinkPickerPageOption[]> {
  const supabase = await createSupabaseServer();

  const { data, error } = await supabase
    .schema("site").from("site_pages")
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

export async function listOrgSiteStructureNodesForManage(orgId: string): Promise<OrgSiteStructureItem[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("site").from("org_site_structure_items")
    .select(siteStructureItemSelect)
    .eq("org_id", orgId)
    .order("parent_id", { ascending: true, nullsFirst: true })
    .order("order_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list site structure items: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSiteStructureItem(row as SiteStructureItemRow));
}

export async function getOrgSiteStructureNodeById(orgId: string, nodeId: string): Promise<OrgSiteStructureItem | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("site").from("org_site_structure_items")
    .select(siteStructureItemSelect)
    .eq("org_id", orgId)
    .eq("id", nodeId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load site structure item: ${error.message}`);
  }

  return data ? mapSiteStructureItem(data as SiteStructureItemRow) : null;
}

export async function createOrgSiteStructureNode(input: {
  orgId: string;
  parentId: string | null;
  type: OrgSiteStructureItem["type"];
  title: string;
  slug: string;
  urlPath: string;
  description?: string | null;
  icon?: string | null;
  showInMenu?: boolean;
  isPublished?: boolean;
  openInNewTab?: boolean;
  dynamicConfigJson?: Record<string, unknown>;
  linkTargetJson?: Record<string, unknown>;
  flagsJson?: Record<string, unknown>;
}) {
  const supabase = await createSupabaseServer();
  const sortIndex = await getNextOrgSiteStructureOrderIndex(input.orgId, input.parentId);
  const { data, error } = await supabase
    .schema("site").from("org_site_structure_items")
    .insert({
      org_id: input.orgId,
      parent_id: input.parentId,
      type: input.type,
      title: input.title,
      slug: input.slug,
      url_path: input.urlPath,
      description: input.description ?? null,
      icon: input.icon ?? null,
      show_in_menu: input.showInMenu ?? true,
      is_published: input.isPublished ?? true,
      open_in_new_tab: input.openInNewTab ?? false,
      order_index: sortIndex,
      dynamic_config_json: input.dynamicConfigJson ?? {},
      link_target_json: input.linkTargetJson ?? {},
      flags_json: input.flagsJson ?? {}
    })
    .select(siteStructureItemSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create site structure item: ${error.message}`);
  }

  return mapSiteStructureItem(data as SiteStructureItemRow);
}

export async function updateOrgSiteStructureNodeById(input: {
  orgId: string;
  nodeId: string;
  parentId?: string | null;
  type?: OrgSiteStructureItem["type"];
  title?: string;
  slug?: string;
  urlPath?: string;
  description?: string | null;
  icon?: string | null;
  showInMenu?: boolean;
  isPublished?: boolean;
  openInNewTab?: boolean;
  dynamicConfigJson?: Record<string, unknown>;
  linkTargetJson?: Record<string, unknown>;
  flagsJson?: Record<string, unknown>;
}) {
  const supabase = await createSupabaseServer();
  const updates: Record<string, unknown> = {};
  if (input.parentId !== undefined) updates.parent_id = input.parentId;
  if (input.type !== undefined) updates.type = input.type;
  if (input.title !== undefined) updates.title = input.title;
  if (input.slug !== undefined) updates.slug = input.slug;
  if (input.urlPath !== undefined) updates.url_path = input.urlPath;
  if (input.description !== undefined) updates.description = input.description;
  if (input.icon !== undefined) updates.icon = input.icon;
  if (input.showInMenu !== undefined) updates.show_in_menu = input.showInMenu;
  if (input.isPublished !== undefined) updates.is_published = input.isPublished;
  if (input.openInNewTab !== undefined) updates.open_in_new_tab = input.openInNewTab;
  if (input.dynamicConfigJson !== undefined) updates.dynamic_config_json = input.dynamicConfigJson;
  if (input.linkTargetJson !== undefined) updates.link_target_json = input.linkTargetJson;
  if (input.flagsJson !== undefined) updates.flags_json = input.flagsJson;

  const { data, error } = await supabase
    .schema("site").from("org_site_structure_items")
    .update(updates)
    .eq("org_id", input.orgId)
    .eq("id", input.nodeId)
    .select(siteStructureItemSelect)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update site structure item: ${error.message}`);
  }

  return data ? mapSiteStructureItem(data as SiteStructureItemRow) : null;
}

export async function deleteOrgSiteStructureNodeById(orgId: string, nodeId: string): Promise<boolean> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("site").from("org_site_structure_items")
    .delete()
    .eq("org_id", orgId)
    .eq("id", nodeId)
    .select("id")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to delete site structure item: ${error.message}`);
  }

  return Boolean(data);
}

async function getNextOrgSiteStructureOrderIndex(orgId: string, parentId: string | null) {
  const supabase = await createSupabaseServer();
  let query = supabase.schema("site").from("org_site_structure_items").select("order_index").eq("org_id", orgId).order("order_index", { ascending: false }).limit(1);
  if (parentId) {
    query = query.eq("parent_id", parentId);
  } else {
    query = query.is("parent_id", null);
  }
  const { data, error } = await query.maybeSingle();
  if (error) {
    throw new Error(`Failed to determine site structure order: ${error.message}`);
  }
  if (!data || typeof data.order_index !== "number") {
    return 0;
  }
  return data.order_index + 1;
}

export async function reorderOrgSiteStructureNodes(
  orgId: string,
  items: Array<{ id: string; parentId: string | null; sortIndex: number }>
): Promise<OrgSiteStructureItem[]> {
  const supabase = await createSupabaseServer();
  const offset = items.length + 4000;

  for (const [index, item] of items.entries()) {
    const { error } = await supabase
      .schema("site").from("org_site_structure_items")
      .update({
        parent_id: item.parentId,
        order_index: offset + index
      })
      .eq("org_id", orgId)
      .eq("id", item.id);

    if (error) {
      throw new Error(`Failed to stage site structure order: ${error.message}`);
    }
  }

  for (const item of items) {
    const { error } = await supabase
      .schema("site").from("org_site_structure_items")
      .update({
        parent_id: item.parentId,
        order_index: item.sortIndex
      })
      .eq("org_id", orgId)
      .eq("id", item.id);

    if (error) {
      throw new Error(`Failed to save site structure order: ${error.message}`);
    }
  }

  return listOrgSiteStructureNodesForManage(orgId);
}

function buildResolvedTree(items: ResolvedOrgSiteStructureItemNode[]) {
  const byId = new Map<string, ResolvedOrgSiteStructureItemNode>();
  const roots: ResolvedOrgSiteStructureItemNode[] = [];

  for (const item of items) {
    byId.set(item.id, item);
  }

  for (const item of items) {
    if (!item.parentId) {
      roots.push(item);
      continue;
    }
    const parent = byId.get(item.parentId);
    if (!parent) {
      roots.push(item);
      continue;
    }
    parent.children.push(item);
  }

  const sortNode = (node: ResolvedOrgSiteStructureItemNode) => {
    node.children.sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title));
    node.children.forEach(sortNode);
  };
  roots.sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title));
  roots.forEach(sortNode);
  return roots;
}

function resolveItemHref(orgSlug: string, item: OrgSiteStructureItem, pagesBySlug: Map<string, OrgManagePage>) {
  const linkTarget = item.linkTargetJson ?? {};
  const kind = typeof linkTarget.kind === "string" ? linkTarget.kind : "none";
  if (kind === "page") {
    const pageSlug = typeof linkTarget.pageSlug === "string" ? linkTarget.pageSlug : "";
    const page = pagesBySlug.get(pageSlug);
    if (!page) {
      return null;
    }
    return page.slug === "home" ? `/${orgSlug}` : `/${orgSlug}/${page.slug}`;
  }
  if (kind === "external") {
    const url = typeof linkTarget.url === "string" ? linkTarget.url.trim() : "";
    return url || null;
  }
  if (kind === "dynamic") {
    const trimmed = item.urlPath.trim();
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return trimmed;
    }
    if (trimmed.startsWith("/")) {
      return `/${orgSlug}${trimmed === "/" ? "" : trimmed}`;
    }
  }
  return null;
}

function isEditableGenerated(item: OrgSiteStructureItem) {
  return !(item.flagsJson.systemGenerated === true || item.flagsJson.locked === true);
}

export async function resolveOrgSiteStructureForHeader({
  orgId,
  orgSlug,
  includeUnpublished
}: {
  orgId: string;
  orgSlug: string;
  includeUnpublished: boolean;
}): Promise<ResolvedOrgSiteStructureItemNode[]> {
  const [items, pages, programs, forms, events] = await Promise.all([
    listOrgSiteStructureNodesForManage(orgId),
    listOrgPagesForHeader({ orgId, includeUnpublished: true }),
    listPublishedProgramsForCatalog(orgId).catch(() => []),
    listPublishedFormsForOrg(orgId).catch(() => []),
    listPublishedCalendarCatalog(orgId, { limit: 200 }).catch(() => [])
  ]);

  const pagesBySlug = new Map(pages.map((page) => [page.slug, page]));
  const base: ResolvedOrgSiteStructureItemNode[] = [];

  for (const item of items) {
    if (!item.showInMenu) {
      continue;
    }
    if (!includeUnpublished && !item.isPublished) {
      continue;
    }

    const href = resolveItemHref(orgSlug, item, pagesBySlug);
    const isExternal = Boolean(href && /^https?:\/\//i.test(href));
    base.push({
      id: item.id,
      parentId: item.parentId,
      title: item.title,
      href,
      target: item.openInNewTab || isExternal ? "_blank" : null,
      rel: item.openInNewTab || isExternal ? "noopener noreferrer" : null,
      orderIndex: item.orderIndex,
      itemType: item.type,
      isVisible: true,
      isGenerated: false,
      isEditable: isEditableGenerated(item),
      reasonDisabled: isEditableGenerated(item) ? null : "System generated and locked.",
      badges: [item.type, item.isPublished ? "published" : "draft", item.showInMenu ? "menu" : "hidden"],
      metaJson: {
        slug: item.slug,
        urlPath: item.urlPath
      },
      children: []
    });

    if (item.type !== "dynamic") {
      continue;
    }

    const dynamicConfig = item.dynamicConfigJson ?? {};
    const sourceType = typeof dynamicConfig.sourceType === "string" ? dynamicConfig.sourceType : "programs";
    const hierarchyMode = typeof dynamicConfig.hierarchyMode === "string" ? dynamicConfig.hierarchyMode : "programs_divisions_teams";
    const includeEmptyGroups = dynamicConfig.includeEmptyGroups !== false;

    if (sourceType === "programs") {
      for (const [programIndex, program] of programs.entries()) {
        const programNodeId = `${item.id}:generated:program:${program.id}`;
        base.push({
          id: programNodeId,
          parentId: item.id,
          title: program.name,
          href: `/${orgSlug}/programs/${program.slug}`,
          target: null,
          rel: null,
          orderIndex: programIndex,
          itemType: "dynamic",
          isVisible: true,
          isGenerated: true,
          isEditable: false,
          reasonDisabled: "Generated from program data.",
          badges: ["generated", "program"],
          metaJson: { generatedLevel: "program", programId: program.id },
          children: []
        });

        if (hierarchyMode === "programs_only") {
          continue;
        }

        const programNodes = await listProgramNodes(program.id, { publishedOnly: true }).catch(() => []);
        const divisions = programNodes.filter((entry) => entry.nodeKind === "division");
        const teams = programNodes.filter((entry) => entry.nodeKind === "team");
        const teamsByDivision = new Map<string, Array<{ id: string; name: string; slug: string }>>();
        for (const team of teams) {
          const parentId = team.parentId ?? "";
          const current = teamsByDivision.get(parentId) ?? [];
          current.push({ id: team.id, name: team.name, slug: team.slug });
          teamsByDivision.set(parentId, current);
        }

        for (const [divisionIndex, division] of divisions.entries()) {
          const divisionNodeId = `${item.id}:generated:division:${division.id}`;
          base.push({
            id: divisionNodeId,
            parentId: programNodeId,
            title: division.name,
            href: `/${orgSlug}/programs/${program.slug}/${division.slug}`,
            target: null,
            rel: null,
            orderIndex: divisionIndex,
            itemType: "dynamic",
            isVisible: true,
            isGenerated: true,
            isEditable: false,
            reasonDisabled: "Generated from division data.",
            badges: ["generated", "division"],
            metaJson: { generatedLevel: "division", divisionId: division.id, programId: program.id },
            children: []
          });

          if (hierarchyMode === "programs_divisions") {
            continue;
          }

          const divisionTeams = (teamsByDivision.get(division.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
          for (const [teamIndex, team] of divisionTeams.entries()) {
            const teamParentId = hierarchyMode === "teams_by_division" ? divisionNodeId : divisionNodeId;
            base.push({
              id: `${item.id}:generated:team:${team.id}`,
              parentId: teamParentId,
              title: team.name,
              href: `/${orgSlug}/programs/${program.slug}/${division.slug}/${team.slug}`,
              target: null,
              rel: null,
              orderIndex: teamIndex,
              itemType: "dynamic",
              isVisible: true,
              isGenerated: true,
              isEditable: false,
              reasonDisabled: "Generated from team data.",
              badges: ["generated", "team"],
              metaJson: { generatedLevel: "team", teamId: team.id, divisionId: division.id, programId: program.id },
              children: []
            });
          }
        }
      }
      continue;
    }

    if (sourceType === "forms") {
      for (const [index, form] of forms.entries()) {
        base.push({
          id: `${item.id}:generated:form:${form.id}`,
          parentId: item.id,
          title: form.name,
          href: `/${orgSlug}/register/${form.slug}`,
          target: null,
          rel: null,
          orderIndex: index,
          itemType: "dynamic",
          isVisible: true,
          isGenerated: true,
          isEditable: false,
          reasonDisabled: "Generated from published forms.",
          badges: ["generated", "form"],
          metaJson: { generatedLevel: "form", formId: form.id },
          children: []
        });
      }
      continue;
    }

    if (sourceType === "events") {
      const eventItems = events.filter((entry) => entry.entryType === "event");
      for (const [index, event] of eventItems.entries()) {
        base.push({
          id: `${item.id}:generated:event:${event.occurrenceId}`,
          parentId: item.id,
          title: event.title,
          href: `/${orgSlug}/calendar/${event.occurrenceId}`,
          target: null,
          rel: null,
          orderIndex: index,
          itemType: "dynamic",
          isVisible: true,
          isGenerated: true,
          isEditable: false,
          reasonDisabled: "Generated from published events.",
          badges: ["generated", "event"],
          metaJson: { generatedLevel: "event", occurrenceId: event.occurrenceId },
          children: []
        });
      }
    }

    if (includeEmptyGroups && base.every((entry) => entry.parentId !== item.id)) {
      base.push({
        id: `${item.id}:generated:empty`,
        parentId: item.id,
        title: "No published items",
        href: null,
        target: null,
        rel: null,
        orderIndex: 0,
        itemType: "dynamic",
        isVisible: true,
        isGenerated: true,
        isEditable: false,
        reasonDisabled: "No records currently available for this dynamic source.",
        badges: ["generated", "empty"],
        metaJson: { generatedLevel: "empty" },
        children: []
      });
    }
  }

  return buildResolvedTree(base);
}
