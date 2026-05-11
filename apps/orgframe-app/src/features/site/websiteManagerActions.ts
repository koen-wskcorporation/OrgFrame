"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import {
  defaultPageTitleFromSlug,
  isReservedPageSlug,
  sanitizePageSlug
} from "@/src/features/site/blocks/helpers";
import {
  createOrgSiteStructureNode,
  deleteOrgPageById,
  deleteOrgSiteStructureNodeById,
  ensureOrgPageExists,
  getEditableOrgPageBySlug,
  getOrgSiteStructureNodeById,
  listOrgPagesForManage,
  listOrgSiteStructureNodesForManage,
  reorderOrgSiteStructureNodes,
  saveOrgPageAndBlocks,
  updateOrgPageSettingsById,
  updateOrgSiteStructureNodeById
} from "@/src/features/site/db/queries";
import { createDefaultBlock } from "@/src/features/site/blocks/registry";
import { findDynamicPagePreset } from "@/src/features/site/dynamicPagePresets";
import type { OrgManagePage, OrgSiteStructureItem } from "@/src/features/site/types";

export type WebsiteManagerSnapshot = {
  items: OrgSiteStructureItem[];
  pages: OrgManagePage[];
};

export type WebsiteManagerActionResult =
  | { ok: true; snapshot: WebsiteManagerSnapshot }
  | { ok: false; error: string };

async function loadSnapshot(orgId: string): Promise<WebsiteManagerSnapshot> {
  const [items, pages] = await Promise.all([
    listOrgSiteStructureNodesForManage(orgId),
    listOrgPagesForManage(orgId)
  ]);
  return { items, pages };
}

function bumpRevalidate(orgSlug: string) {
  revalidatePath(`/${orgSlug}`, "layout");
  revalidatePath(`/${orgSlug}/manage/website`);
}

function validateNotReserved(slug: string): string | null {
  if (isReservedPageSlug(slug)) {
    return "That URL is reserved. Pick another.";
  }
  return null;
}

// ---------------------------------------------------------------------------
// Create page
// ---------------------------------------------------------------------------

// `showInMenu` was retired as a user-controllable field — it now mirrors
// `isPublished` (one truth: published = visible everywhere, unpublished =
// hidden everywhere). Every create/update path forces the two to match;
// see migration `202605100001_*` for the historical backfill.
const createPageSchema = z.object({
  orgSlug: z.string().trim().min(1),
  parentId: z.string().trim().uuid().nullable(),
  title: z.string().trim().min(1).max(120),
  slug: z.string().trim().max(120).optional(),
  isPublished: z.boolean().optional()
});

export async function createWebsitePageAction(
  input: z.infer<typeof createPageSchema>
): Promise<WebsiteManagerActionResult> {
  const parsed = createPageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the page details." };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");

    const desiredSlug = sanitizePageSlug(payload.slug ?? payload.title);
    const reservedError = validateNotReserved(desiredSlug);
    if (reservedError) {
      return { ok: false, error: reservedError };
    }

    const existing = await getEditableOrgPageBySlug({
      orgId: org.orgId,
      pageSlug: desiredSlug,
      context: { orgSlug: org.orgSlug, orgName: org.orgName, pageSlug: desiredSlug }
    });
    if (existing) {
      return { ok: false, error: "Another page already uses that URL." };
    }

    if (payload.parentId) {
      const parent = await getOrgSiteStructureNodeById(org.orgId, payload.parentId);
      if (!parent) {
        return { ok: false, error: "The parent item no longer exists." };
      }
    }

    const title = payload.title.trim() || defaultPageTitleFromSlug(desiredSlug);
    const created = await ensureOrgPageExists({
      orgId: org.orgId,
      pageSlug: desiredSlug,
      title,
      context: { orgSlug: org.orgSlug, orgName: org.orgName, pageSlug: desiredSlug }
    });

    if (payload.isPublished === false) {
      await updateOrgPageSettingsById({
        orgId: org.orgId,
        pageId: created.page.id,
        title,
        slug: desiredSlug,
        isPublished: false
      });
    }

    const published = payload.isPublished ?? true;
    await createOrgSiteStructureNode({
      orgId: org.orgId,
      parentId: payload.parentId,
      type: "page",
      title,
      slug: desiredSlug,
      urlPath: desiredSlug === "home" ? "/" : `/${desiredSlug}`,
      showInMenu: published,
      isPublished: published,
      linkTargetJson: { kind: "page", pageSlug: desiredSlug }
    });

    bumpRevalidate(org.orgSlug);
    return { ok: true, snapshot: await loadSnapshot(org.orgId) };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to create this page right now." };
  }
}

// ---------------------------------------------------------------------------
// Create dropdown (placeholder) — header parent with no link
// ---------------------------------------------------------------------------

const createDropdownSchema = z.object({
  orgSlug: z.string().trim().min(1),
  parentId: z.string().trim().uuid().nullable(),
  title: z.string().trim().min(1).max(120)
});

export async function createWebsiteDropdownAction(
  input: z.infer<typeof createDropdownSchema>
): Promise<WebsiteManagerActionResult> {
  const parsed = createDropdownSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please provide a title for the dropdown." };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const slug = sanitizePageSlug(payload.title);

    await createOrgSiteStructureNode({
      orgId: org.orgId,
      parentId: payload.parentId,
      type: "placeholder",
      title: payload.title.trim(),
      slug,
      urlPath: "",
      showInMenu: true,
      isPublished: true,
      linkTargetJson: { kind: "none" }
    });

    bumpRevalidate(org.orgSlug);
    return { ok: true, snapshot: await loadSnapshot(org.orgId) };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to create dropdown right now." };
  }
}

// ---------------------------------------------------------------------------
// Create external link
// ---------------------------------------------------------------------------

const createExternalLinkSchema = z.object({
  orgSlug: z.string().trim().min(1),
  parentId: z.string().trim().uuid().nullable(),
  title: z.string().trim().min(1).max(120),
  url: z.string().trim().url(),
  openInNewTab: z.boolean().optional()
});

export async function createWebsiteExternalLinkAction(
  input: z.infer<typeof createExternalLinkSchema>
): Promise<WebsiteManagerActionResult> {
  const parsed = createExternalLinkSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please enter a valid title and URL." };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const slug = sanitizePageSlug(payload.title);

    await createOrgSiteStructureNode({
      orgId: org.orgId,
      parentId: payload.parentId,
      type: "page",
      title: payload.title.trim(),
      slug,
      urlPath: payload.url,
      showInMenu: true,
      isPublished: true,
      openInNewTab: payload.openInNewTab ?? true,
      linkTargetJson: { kind: "external", url: payload.url }
    });

    bumpRevalidate(org.orgSlug);
    return { ok: true, snapshot: await loadSnapshot(org.orgId) };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to create link right now." };
  }
}

// ---------------------------------------------------------------------------
// Create dynamic page — a regular content page seeded with a single locked
// block (program_catalog / events / teams_directory / facility_space_list).
// The slug is reserved per `dynamicPagePresets`, so once one of these pages
// exists the slug can never be re-used by anything else.
// ---------------------------------------------------------------------------

const createDynamicPageSchema = z.object({
  orgSlug: z.string().trim().min(1),
  parentId: z.string().trim().uuid().nullable(),
  presetKey: z.string().trim().min(1),
  isPublished: z.boolean().optional()
});

export async function createWebsiteDynamicPageAction(
  input: z.infer<typeof createDynamicPageSchema>
): Promise<WebsiteManagerActionResult> {
  const parsed = createDynamicPageSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Pick a dynamic page type to add." };
  }

  try {
    const payload = parsed.data;
    const preset = findDynamicPagePreset(payload.presetKey);
    if (!preset) {
      return { ok: false, error: "That dynamic page type isn't recognized." };
    }

    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");

    // The slug is reserved by definition, so the only way it'd already exist
    // is if this dynamic page was already created. Detect and refuse.
    const existingPage = await getEditableOrgPageBySlug({
      orgId: org.orgId,
      pageSlug: preset.slug,
      context: { orgSlug: org.orgSlug, orgName: org.orgName, pageSlug: preset.slug }
    });
    if (existingPage) {
      return { ok: false, error: `A ${preset.title} page already exists.` };
    }

    if (payload.parentId) {
      const parent = await getOrgSiteStructureNodeById(org.orgId, payload.parentId);
      if (!parent) {
        return { ok: false, error: "The parent item no longer exists." };
      }
    }

    const blockContext = {
      orgSlug: org.orgSlug,
      orgName: org.orgName,
      pageSlug: preset.slug
    };

    // Seed the page with one block of the preset's type. Once the block
    // editor enforces locked-root semantics, this block will be undeletable.
    // TODO(website-manager): mark the seed block as `lockedRoot: true` once
    // OrgPageBlock supports a meta field, and have OrgPageEditor refuse to
    // delete it. For now there's nothing actually preventing removal — the
    // user can manually delete it from the editor and lose the dynamic
    // listing.
    const seedBlock = createDefaultBlock(preset.blockType, blockContext);
    const published = payload.isPublished ?? true;

    await saveOrgPageAndBlocks({
      orgId: org.orgId,
      pageSlug: preset.slug,
      title: preset.title,
      isPublished: published,
      blocks: [{ id: seedBlock.id, type: seedBlock.type, config: seedBlock.config }],
      context: blockContext
    });

    await createOrgSiteStructureNode({
      orgId: org.orgId,
      parentId: payload.parentId,
      type: "page",
      title: preset.title,
      slug: preset.slug,
      urlPath: `/${preset.slug}`,
      showInMenu: published,
      isPublished: published,
      linkTargetJson: { kind: "page", pageSlug: preset.slug }
    });

    bumpRevalidate(org.orgSlug);
    return { ok: true, snapshot: await loadSnapshot(org.orgId) };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to create dynamic page right now." };
  }
}

// ---------------------------------------------------------------------------
// Update item — partial updates for inline toggles + edit dialog
// ---------------------------------------------------------------------------

const updateItemSchema = z.object({
  orgSlug: z.string().trim().min(1),
  itemId: z.string().trim().uuid(),
  patch: z.object({
    title: z.string().trim().min(1).max(120).optional(),
    slug: z.string().trim().max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    isPublished: z.boolean().optional(),
    openInNewTab: z.boolean().optional(),
    externalUrl: z.string().trim().url().optional(),
    seoTitle: z.string().trim().max(120).nullable().optional(),
    metaDescription: z.string().trim().max(320).nullable().optional(),
    ogImagePath: z.string().trim().max(500).nullable().optional()
  })
});

export async function updateWebsiteItemAction(
  input: z.infer<typeof updateItemSchema>
): Promise<WebsiteManagerActionResult> {
  const parsed = updateItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Please check the fields." };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const current = await getOrgSiteStructureNodeById(org.orgId, payload.itemId);
    if (!current) {
      return { ok: false, error: "This item no longer exists." };
    }

    const linkKind = typeof current.linkTargetJson?.kind === "string" ? (current.linkTargetJson.kind as string) : "none";
    const linkedPageSlug = typeof current.linkTargetJson?.pageSlug === "string" ? (current.linkTargetJson.pageSlug as string) : null;

    const updates: Parameters<typeof updateOrgSiteStructureNodeById>[0] = {
      orgId: org.orgId,
      nodeId: payload.itemId
    };

    if (payload.patch.title !== undefined) updates.title = payload.patch.title.trim();
    if (payload.patch.description !== undefined) updates.description = payload.patch.description;
    if (payload.patch.isPublished !== undefined) {
      // Single source of truth: published === visible in nav. Always keep
      // show_in_menu in lockstep with is_published.
      updates.isPublished = payload.patch.isPublished;
      updates.showInMenu = payload.patch.isPublished;
    }
    if (payload.patch.openInNewTab !== undefined) updates.openInNewTab = payload.patch.openInNewTab;

    // Slug edit only valid for type=page with linked page
    if (payload.patch.slug !== undefined && current.type === "page" && linkKind === "page" && linkedPageSlug) {
      const nextSlug = sanitizePageSlug(payload.patch.slug);
      const reservedError = validateNotReserved(nextSlug);
      if (reservedError) return { ok: false, error: reservedError };

      if (nextSlug !== linkedPageSlug) {
        const conflicting = await getEditableOrgPageBySlug({
          orgId: org.orgId,
          pageSlug: nextSlug,
          context: { orgSlug: org.orgSlug, orgName: org.orgName, pageSlug: nextSlug }
        });
        if (conflicting) {
          return { ok: false, error: "Another page already uses that URL." };
        }
        const linkedPage = await getEditableOrgPageBySlug({
          orgId: org.orgId,
          pageSlug: linkedPageSlug,
          context: { orgSlug: org.orgSlug, orgName: org.orgName, pageSlug: linkedPageSlug }
        });
        if (linkedPage) {
          await updateOrgPageSettingsById({
            orgId: org.orgId,
            pageId: linkedPage.page.id,
            title: payload.patch.title?.trim() ?? linkedPage.page.title,
            slug: nextSlug,
            isPublished: payload.patch.isPublished ?? linkedPage.page.isPublished
          });
        }
        updates.slug = nextSlug;
        updates.urlPath = nextSlug === "home" ? "/" : `/${nextSlug}`;
        updates.linkTargetJson = { kind: "page", pageSlug: nextSlug };
      }
    }

    // External URL edit
    if (payload.patch.externalUrl !== undefined && linkKind === "external") {
      updates.urlPath = payload.patch.externalUrl;
      updates.linkTargetJson = { kind: "external", url: payload.patch.externalUrl };
    }

    // Sync title/published/SEO into linked page
    const seoTouched =
      payload.patch.seoTitle !== undefined ||
      payload.patch.metaDescription !== undefined ||
      payload.patch.ogImagePath !== undefined;
    if (
      linkKind === "page" &&
      linkedPageSlug &&
      (payload.patch.title !== undefined || payload.patch.isPublished !== undefined || seoTouched)
    ) {
      const linkedPage = await getEditableOrgPageBySlug({
        orgId: org.orgId,
        pageSlug: linkedPageSlug,
        context: { orgSlug: org.orgSlug, orgName: org.orgName, pageSlug: linkedPageSlug }
      });
      if (linkedPage && updates.slug === undefined) {
        await updateOrgPageSettingsById({
          orgId: org.orgId,
          pageId: linkedPage.page.id,
          title: payload.patch.title?.trim() ?? linkedPage.page.title,
          slug: linkedPage.page.slug,
          isPublished: payload.patch.isPublished ?? linkedPage.page.isPublished,
          seoTitle: payload.patch.seoTitle,
          metaDescription: payload.patch.metaDescription,
          ogImagePath: payload.patch.ogImagePath
        });
      }
    }

    await updateOrgSiteStructureNodeById(updates);

    bumpRevalidate(org.orgSlug);
    return { ok: true, snapshot: await loadSnapshot(org.orgId) };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to save changes right now." };
  }
}

// ---------------------------------------------------------------------------
// Delete item
// ---------------------------------------------------------------------------

const deleteItemSchema = z.object({
  orgSlug: z.string().trim().min(1),
  itemId: z.string().trim().uuid(),
  alsoDeletePage: z.boolean().optional()
});

export async function deleteWebsiteItemAction(
  input: z.infer<typeof deleteItemSchema>
): Promise<WebsiteManagerActionResult> {
  const parsed = deleteItemSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Unable to delete." };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const current = await getOrgSiteStructureNodeById(org.orgId, payload.itemId);
    if (!current) {
      return { ok: true, snapshot: await loadSnapshot(org.orgId) };
    }

    if (current.flagsJson?.locked === true || current.flagsJson?.systemGenerated === true) {
      return { ok: false, error: "This item is locked and cannot be deleted." };
    }

    await deleteOrgSiteStructureNodeById(org.orgId, payload.itemId);

    // Optional cascade to delete the underlying page
    if (payload.alsoDeletePage && current.type === "page") {
      const linkKind = typeof current.linkTargetJson?.kind === "string" ? (current.linkTargetJson.kind as string) : "none";
      const linkedPageSlug = typeof current.linkTargetJson?.pageSlug === "string" ? (current.linkTargetJson.pageSlug as string) : null;
      if (linkKind === "page" && linkedPageSlug && linkedPageSlug !== "home") {
        const linkedPage = await getEditableOrgPageBySlug({
          orgId: org.orgId,
          pageSlug: linkedPageSlug,
          context: { orgSlug: org.orgSlug, orgName: org.orgName, pageSlug: linkedPageSlug }
        });
        if (linkedPage) {
          await deleteOrgPageById(org.orgId, linkedPage.page.id);
        }
      }
    }

    bumpRevalidate(org.orgSlug);
    return { ok: true, snapshot: await loadSnapshot(org.orgId) };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to delete right now." };
  }
}

// ---------------------------------------------------------------------------
// Reorder / reparent — accepts the full flat tree post-drag
// ---------------------------------------------------------------------------

const reorderSchema = z.object({
  orgSlug: z.string().trim().min(1),
  items: z
    .array(
      z.object({
        id: z.string().trim().uuid(),
        parentId: z.string().trim().uuid().nullable(),
        sortIndex: z.number().int().min(0)
      })
    )
    .min(1)
});

export async function reorderWebsiteItemsAction(
  input: z.infer<typeof reorderSchema>
): Promise<WebsiteManagerActionResult> {
  const parsed = reorderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Unable to reorder." };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");

    const ids = payload.items.map((i) => i.id);
    const parentMap = new Map(payload.items.map((i) => [i.id, i.parentId]));
    for (const item of payload.items) {
      let cursor: string | null = item.parentId;
      const seen = new Set<string>([item.id]);
      while (cursor) {
        if (seen.has(cursor)) {
          return { ok: false, error: "Invalid nesting (cycle detected)." };
        }
        seen.add(cursor);
        cursor = parentMap.get(cursor) ?? null;
      }
    }
    if (new Set(ids).size !== ids.length) {
      return { ok: false, error: "Duplicate items in order." };
    }

    await reorderOrgSiteStructureNodes(org.orgId, payload.items);

    bumpRevalidate(org.orgSlug);
    return { ok: true, snapshot: await loadSnapshot(org.orgId) };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to reorder right now." };
  }
}

// ---------------------------------------------------------------------------
// Read snapshot (for client refreshes)
// ---------------------------------------------------------------------------

export async function loadWebsiteManagerSnapshotAction(
  orgSlug: string
): Promise<WebsiteManagerActionResult> {
  try {
    const org = await requireOrgPermission(orgSlug, "org.pages.read");
    return { ok: true, snapshot: await loadSnapshot(org.orgId) };
  } catch (error) {
    rethrowIfNavigationError(error);
    return { ok: false, error: "Unable to load website data." };
  }
}
