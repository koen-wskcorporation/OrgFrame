import { asText, defaultPageTitleFromSlug, sanitizePageSlug } from "@/modules/site-builder/blocks/helpers";
import { createDefaultBlocksForPage, normalizeDraftBlocks, normalizeRowBlocks } from "@/modules/site-builder/blocks/registry";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { LinkPickerPageOption } from "@/lib/links";
import type { BlockContext, DraftBlockInput, OrgManagePage, OrgSitePage, OrgSitePageWithBlocks } from "@/modules/site-builder/types";

const pageSelect = "id, org_id, slug, title, is_published, sort_index, created_at, updated_at";
const blockSelect = "id, type, sort_index, config";

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

  return mapManagePage(data as PageRow);
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

  return mapManagePage(duplicatedPage as PageRow);
}

export async function deleteOrgPageById(orgId: string, pageId: string): Promise<boolean> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_pages").delete().eq("org_id", orgId).eq("id", pageId).select("id").maybeSingle();

  if (error) {
    throw new Error(`Failed to delete page: ${error.message}`);
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
