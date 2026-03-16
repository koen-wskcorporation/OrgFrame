"use server";

import { z } from "zod";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { getOptionalOrgMembershipAccess } from "@/lib/org/getOptionalOrgMembershipAccess";
import { getOrgCapabilities } from "@/lib/permissions/orgCapabilities";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { defaultPageTitleFromSlug, isReservedPageSlug, sanitizePageSlug } from "@/modules/site-builder/blocks/helpers";
import {
  deleteOrgPageById,
  duplicateOrgPageWithBlocks,
  ensureOrgPageExists,
  getOrgPageById,
  getEditableOrgPageBySlug,
  getPublishedOrgPageBySlug,
  listOrgPagesForManage,
  listOrgPagesForLinkPicker,
  reorderOrgPages,
  saveOrgPageAndBlocks,
  updateOrgPageSettingsById
} from "@/modules/site-builder/db/queries";
import type { LinkPickerPageOption } from "@/lib/links";
import type { DraftBlockInput, OrgManagePage, OrgPageBlock, OrgSitePage } from "@/modules/site-builder/types";

export type LoadOrgPageInput = {
  orgSlug: string;
  pageSlug: string;
};

export type LoadOrgPageResult =
  | {
      ok: true;
      page: OrgSitePage;
      blocks: OrgPageBlock[];
      canEdit: boolean;
    }
  | {
      ok: false;
      error: "not_found" | "forbidden" | "unknown";
    };

export async function loadOrgPageAction(input: LoadOrgPageInput): Promise<LoadOrgPageResult> {
  try {
    const pageSlug = sanitizePageSlug(input.pageSlug);
    const org = await getOrgPublicContext(input.orgSlug);
    const membershipAccess = await getOptionalOrgMembershipAccess(org.orgId);
    const capabilities = membershipAccess ? getOrgCapabilities(membershipAccess.permissions) : null;
    const canReadEditorData = capabilities?.pages.canAccess ?? false;
    const canEdit = capabilities?.pages.canWrite ?? false;

    const pageData = canReadEditorData
      ? await getEditableOrgPageBySlug({
          orgId: org.orgId,
          pageSlug,
          context: {
            orgSlug: org.orgSlug,
            orgName: org.orgName,
            pageSlug
          }
        })
      : await getPublishedOrgPageBySlug({
          orgId: org.orgId,
          pageSlug,
          context: {
            orgSlug: org.orgSlug,
            orgName: org.orgName,
            pageSlug
          }
        });

    if (!pageData) {
      return {
        ok: false,
        error: "not_found"
      };
    }

    return {
      ok: true,
      page: pageData.page,
      blocks: pageData.blocks,
      canEdit
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "unknown"
    };
  }
}

export type SaveOrgPageInput = {
  orgSlug: string;
  pageSlug: string;
  title: string;
  isPublished: boolean;
  blocks: DraftBlockInput[];
};

export type SaveOrgPageResult =
  | {
      ok: true;
      page: OrgSitePage;
      blocks: OrgPageBlock[];
    }
  | {
      ok: false;
      error: string;
    };

export async function saveOrgPageAction(input: SaveOrgPageInput): Promise<SaveOrgPageResult> {
  try {
    const pageSlug = sanitizePageSlug(input.pageSlug);
    const org = await requireOrgPermission(input.orgSlug, "org.pages.write");

    const saved = await saveOrgPageAndBlocks({
      orgId: org.orgId,
      pageSlug,
      title: input.title,
      isPublished: input.isPublished,
      blocks: input.blocks,
      context: {
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        pageSlug
      }
    });

    return {
      ok: true,
      page: saved.page,
      blocks: saved.blocks
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to save this page right now."
    };
  }
}

type ListOrgPagesForLinkPickerResult =
  | {
      ok: true;
      pages: LinkPickerPageOption[];
    }
  | {
      ok: false;
      error: string;
    };

export async function listOrgPagesForLinkPickerAction(input: { orgSlug: string }): Promise<ListOrgPagesForLinkPickerResult> {
  try {
    const org = await getOrgPublicContext(input.orgSlug);
    const membershipAccess = await getOptionalOrgMembershipAccess(org.orgId);
    const capabilities = membershipAccess ? getOrgCapabilities(membershipAccess.permissions) : null;
    const canReadPages = capabilities?.pages.canAccess ?? false;

    if (!canReadPages) {
      return {
        ok: true,
        pages: [
          {
            slug: "home",
            title: "Home",
            isPublished: true
          }
        ]
      };
    }

    const pages = await listOrgPagesForLinkPicker(org.orgId);

    return {
      ok: true,
      pages
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to load page links right now."
    };
  }
}

type ManagePagesActionResult =
  | {
      ok: true;
      pages: OrgManagePage[];
    }
  | {
      ok: false;
      error: string;
    };

function normalizePageTitleInput(title: string, pageSlug: string) {
  const trimmedTitle = title.trim();

  if (trimmedTitle) {
    return trimmedTitle.slice(0, 120);
  }

  return defaultPageTitleFromSlug(pageSlug);
}

function validatePageSlugForManage(normalizedSlug: string) {
  if (normalizedSlug !== "home" && isReservedPageSlug(normalizedSlug)) {
    return "That URL is reserved by the system. Choose a different page URL.";
  }

  return null;
}

async function findNextDuplicatePageSlug({
  orgId,
  orgSlug,
  orgName,
  sourceSlug
}: {
  orgId: string;
  orgSlug: string;
  orgName: string;
  sourceSlug: string;
}) {
  const rawBase = sourceSlug === "home" ? "home-copy" : `${sourceSlug}-copy`;
  const baseSlug = sanitizePageSlug(rawBase);
  const sanitizedBase = validatePageSlugForManage(baseSlug) ? sanitizePageSlug(`page-${baseSlug}`) : baseSlug;

  for (let index = 0; index < 200; index += 1) {
    const candidateSlug = index === 0 ? sanitizedBase : sanitizePageSlug(`${sanitizedBase}-${index + 1}`);
    const existing = await getEditableOrgPageBySlug({
      orgId,
      pageSlug: candidateSlug,
      context: {
        orgSlug,
        orgName,
        pageSlug: candidateSlug
      }
    });

    if (!existing) {
      return candidateSlug;
    }
  }

  return null;
}

const savePageSettingsSchema = z.object({
  orgSlug: z.string().trim().min(1),
  pageId: z.string().trim().uuid(),
  title: z.string().trim().max(120),
  pageSlug: z.string().trim().min(1).max(120),
  isPublished: z.boolean()
});

export async function savePageSettingsAction(input: {
  orgSlug: string;
  pageId: string;
  title: string;
  pageSlug: string;
  isPublished: boolean;
}): Promise<ManagePagesActionResult> {
  const parsed = savePageSettingsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the page name and URL."
    };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const currentPage = await getOrgPageById(org.orgId, payload.pageId);

    if (!currentPage) {
      return {
        ok: false,
        error: "This page no longer exists."
      };
    }

    const requestedSlug = sanitizePageSlug(payload.pageSlug);
    const slugError = validatePageSlugForManage(requestedSlug);

    if (slugError) {
      return {
        ok: false,
        error: slugError
      };
    }

    if (currentPage.slug === "home" && requestedSlug !== "home") {
      return {
        ok: false,
        error: "The Home page URL is fixed to /."
      };
    }

    if (currentPage.slug !== "home" && requestedSlug === "home") {
      return {
        ok: false,
        error: "Another page is already using the Home URL."
      };
    }

    if (requestedSlug !== currentPage.slug) {
      const existing = await getEditableOrgPageBySlug({
        orgId: org.orgId,
        pageSlug: requestedSlug,
        context: {
          orgSlug: org.orgSlug,
          orgName: org.orgName,
          pageSlug: requestedSlug
        }
      });

      if (existing && existing.page.id !== currentPage.id) {
        return {
          ok: false,
          error: "Another page is already using that URL."
        };
      }
    }

    const nextTitle = normalizePageTitleInput(payload.title, requestedSlug);
    await updateOrgPageSettingsById({
      orgId: org.orgId,
      pageId: currentPage.id,
      title: nextTitle,
      slug: requestedSlug,
      isPublished: payload.isPublished
    });

    const pages = await listOrgPagesForManage(org.orgId);

    return {
      ok: true,
      pages
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to save page settings right now."
    };
  }
}

const createManagedPageSchema = z.object({
  orgSlug: z.string().trim().min(1),
  title: z.string().trim().max(120),
  pageSlug: z.string().trim().min(1).max(120),
  isPublished: z.boolean()
});

export async function createManagedPageAction(input: {
  orgSlug: string;
  title: string;
  pageSlug: string;
  isPublished: boolean;
}): Promise<ManagePagesActionResult> {
  const parsed = createManagedPageSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Please check the page name and URL."
    };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const normalizedSlug = sanitizePageSlug(payload.pageSlug);
    const slugError = validatePageSlugForManage(normalizedSlug);

    if (slugError) {
      return {
        ok: false,
        error: slugError
      };
    }

    const existing = await getEditableOrgPageBySlug({
      orgId: org.orgId,
      pageSlug: normalizedSlug,
      context: {
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        pageSlug: normalizedSlug
      }
    });

    if (existing) {
      return {
        ok: false,
        error: "Another page is already using that URL."
      };
    }

    const nextTitle = normalizePageTitleInput(payload.title, normalizedSlug);
    const created = await ensureOrgPageExists({
      orgId: org.orgId,
      pageSlug: normalizedSlug,
      title: nextTitle,
      context: {
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        pageSlug: normalizedSlug
      }
    });

    if (!payload.isPublished) {
      await updateOrgPageSettingsById({
        orgId: org.orgId,
        pageId: created.page.id,
        title: nextTitle,
        slug: normalizedSlug,
        isPublished: false
      });
    }

    const pages = await listOrgPagesForManage(org.orgId);

    return {
      ok: true,
      pages
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to create this page right now."
    };
  }
}

const duplicatePageSchema = z.object({
  orgSlug: z.string().trim().min(1),
  pageId: z.string().trim().uuid()
});

export async function duplicateManagedPageAction(input: { orgSlug: string; pageId: string }): Promise<ManagePagesActionResult> {
  const parsed = duplicatePageSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Unable to duplicate this page."
    };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const sourcePage = await getOrgPageById(org.orgId, payload.pageId);

    if (!sourcePage) {
      return {
        ok: false,
        error: "This page no longer exists."
      };
    }

    const duplicateSlug = await findNextDuplicatePageSlug({
      orgId: org.orgId,
      orgSlug: org.orgSlug,
      orgName: org.orgName,
      sourceSlug: sourcePage.slug
    });

    if (!duplicateSlug) {
      return {
        ok: false,
        error: "Unable to find a URL for the duplicate page."
      };
    }

    const duplicateTitle = `${sourcePage.title} Copy`.slice(0, 120);
    await duplicateOrgPageWithBlocks({
      orgId: org.orgId,
      sourcePageId: sourcePage.id,
      slug: duplicateSlug,
      title: duplicateTitle
    });

    const pages = await listOrgPagesForManage(org.orgId);

    return {
      ok: true,
      pages
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to duplicate this page right now."
    };
  }
}

const deletePageSchema = z.object({
  orgSlug: z.string().trim().min(1),
  pageId: z.string().trim().uuid()
});

export async function deleteManagedPageAction(input: { orgSlug: string; pageId: string }): Promise<ManagePagesActionResult> {
  const parsed = deletePageSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Unable to delete this page."
    };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const page = await getOrgPageById(org.orgId, payload.pageId);

    if (!page) {
      return {
        ok: false,
        error: "This page no longer exists."
      };
    }

    if (page.slug === "home") {
      return {
        ok: false,
        error: "Home can't be deleted."
      };
    }

    const deleted = await deleteOrgPageById(org.orgId, page.id);

    if (!deleted) {
      return {
        ok: false,
        error: "This page no longer exists."
      };
    }

    const pagesAfterDelete = await listOrgPagesForManage(org.orgId);
    const orderedIds = pagesAfterDelete.map((item) => item.id);
    const pages = await reorderOrgPages(org.orgId, orderedIds);

    return {
      ok: true,
      pages
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to delete this page right now."
    };
  }
}

const reorderPagesSchema = z.object({
  orgSlug: z.string().trim().min(1),
  pageIds: z.array(z.string().trim().uuid()).min(1)
});

export async function reorderManagedPagesAction(input: { orgSlug: string; pageIds: string[] }): Promise<ManagePagesActionResult> {
  const parsed = reorderPagesSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Unable to reorder pages."
    };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const currentPages = await listOrgPagesForManage(org.orgId);

    if (currentPages.length !== payload.pageIds.length) {
      return {
        ok: false,
        error: "Page order is out of date. Refresh and try again."
      };
    }

    const currentIds = new Set(currentPages.map((page) => page.id));
    const nextIds = new Set(payload.pageIds);

    if (currentIds.size !== nextIds.size || [...currentIds].some((id) => !nextIds.has(id))) {
      return {
        ok: false,
        error: "Page order is out of date. Refresh and try again."
      };
    }

    const pages = await reorderOrgPages(org.orgId, payload.pageIds);

    return {
      ok: true,
      pages
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to reorder pages right now."
    };
  }
}

const saveOrgPagesActionSchema = z.object({
  orgSlug: z.string().trim().min(1),
  action: z.discriminatedUnion("type", [
    z.object({
      type: z.literal("reorder"),
      pageIds: z.array(z.string().trim().uuid()).min(1)
    }),
    z.object({
      type: z.literal("rename"),
      pageId: z.string().trim().uuid(),
      title: z.string().trim().min(1).max(120)
    }),
    z.object({
      type: z.literal("set-published"),
      pageId: z.string().trim().uuid(),
      isPublished: z.boolean()
    }),
    z.object({
      type: z.literal("duplicate"),
      pageId: z.string().trim().uuid()
    }),
    z.object({
      type: z.literal("delete"),
      pageId: z.string().trim().uuid()
    }),
    z.object({
      type: z.literal("create"),
      title: z.string().trim().max(120),
      slug: z.string().trim().max(120).optional(),
      isPublished: z.boolean().optional(),
      openEditor: z.boolean().optional()
    })
  ])
});

export type SaveOrgPagesActionResult =
  | {
      ok: true;
      pages: OrgManagePage[];
      createdPageSlug?: string;
      openEditor?: boolean;
    }
  | {
      ok: false;
      error: string;
    };

async function findAvailablePageSlug({
  orgId,
  orgSlug,
  orgName,
  preferred
}: {
  orgId: string;
  orgSlug: string;
  orgName: string;
  preferred: string;
}) {
  const sanitized = sanitizePageSlug(preferred);
  const base = sanitized === "home" ? "page" : sanitized;

  for (let index = 0; index < 200; index += 1) {
    const candidate = index === 0 ? base : sanitizePageSlug(`${base}-${index + 1}`);

    if (candidate !== "home" && isReservedPageSlug(candidate)) {
      continue;
    }

    const existing = await getEditableOrgPageBySlug({
      orgId,
      pageSlug: candidate,
      context: {
        orgSlug,
        orgName,
        pageSlug: candidate
      }
    });

    if (!existing) {
      return candidate;
    }
  }

  return null;
}

export async function saveOrgPagesAction(input: z.infer<typeof saveOrgPagesActionSchema>): Promise<SaveOrgPagesActionResult> {
  const parsed = saveOrgPagesActionSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid page update."
    };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");

    if (payload.action.type === "reorder") {
      const currentPages = await listOrgPagesForManage(org.orgId);

      if (currentPages.length !== payload.action.pageIds.length) {
        return {
          ok: false,
          error: "Page order is out of date. Refresh and try again."
        };
      }

      const currentIds = new Set(currentPages.map((page) => page.id));
      const nextIds = new Set(payload.action.pageIds);

      if (currentIds.size !== nextIds.size || [...currentIds].some((id) => !nextIds.has(id))) {
        return {
          ok: false,
          error: "Page order is out of date. Refresh and try again."
        };
      }

      const pages = await reorderOrgPages(org.orgId, payload.action.pageIds);
      return { ok: true, pages };
    }

    if (payload.action.type === "rename") {
      const page = await getOrgPageById(org.orgId, payload.action.pageId);

      if (!page) {
        return {
          ok: false,
          error: "This page no longer exists."
        };
      }

      await updateOrgPageSettingsById({
        orgId: org.orgId,
        pageId: page.id,
        title: normalizePageTitleInput(payload.action.title, page.slug),
        slug: page.slug,
        isPublished: page.isPublished
      });

      return {
        ok: true,
        pages: await listOrgPagesForManage(org.orgId)
      };
    }

    if (payload.action.type === "set-published") {
      const page = await getOrgPageById(org.orgId, payload.action.pageId);

      if (!page) {
        return {
          ok: false,
          error: "This page no longer exists."
        };
      }

      await updateOrgPageSettingsById({
        orgId: org.orgId,
        pageId: page.id,
        title: page.title,
        slug: page.slug,
        isPublished: payload.action.isPublished
      });

      return {
        ok: true,
        pages: await listOrgPagesForManage(org.orgId)
      };
    }

    if (payload.action.type === "duplicate") {
      const sourcePage = await getOrgPageById(org.orgId, payload.action.pageId);

      if (!sourcePage) {
        return {
          ok: false,
          error: "This page no longer exists."
        };
      }

      const duplicateSlug = await findNextDuplicatePageSlug({
        orgId: org.orgId,
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        sourceSlug: sourcePage.slug
      });

      if (!duplicateSlug) {
        return {
          ok: false,
          error: "Unable to find a URL for the duplicate page."
        };
      }

      await duplicateOrgPageWithBlocks({
        orgId: org.orgId,
        sourcePageId: sourcePage.id,
        slug: duplicateSlug,
        title: `${sourcePage.title} Copy`.slice(0, 120)
      });

      return {
        ok: true,
        pages: await listOrgPagesForManage(org.orgId)
      };
    }

    if (payload.action.type === "delete") {
      const page = await getOrgPageById(org.orgId, payload.action.pageId);

      if (!page) {
        return {
          ok: false,
          error: "This page no longer exists."
        };
      }

      if (page.slug === "home") {
        return {
          ok: false,
          error: "Home can't be deleted."
        };
      }

      await deleteOrgPageById(org.orgId, page.id);
      const pagesAfterDelete = await listOrgPagesForManage(org.orgId);
      const pages = await reorderOrgPages(
        org.orgId,
        pagesAfterDelete.map((item) => item.id)
      );

      return {
        ok: true,
        pages
      };
    }

    const requestedSlug = payload.action.slug?.trim() ? sanitizePageSlug(payload.action.slug) : "";

    if (requestedSlug && requestedSlug !== "home" && isReservedPageSlug(requestedSlug)) {
      return {
        ok: false,
        error: "That URL is reserved by the system. Choose a different page URL."
      };
    }

    const slugBase = requestedSlug || sanitizePageSlug(payload.action.title || "page");
    const availableSlug = await findAvailablePageSlug({
      orgId: org.orgId,
      orgSlug: org.orgSlug,
      orgName: org.orgName,
      preferred: slugBase
    });

    if (!availableSlug) {
      return {
        ok: false,
        error: "Unable to find an available URL for this page."
      };
    }

    if (isReservedPageSlug(availableSlug)) {
      return {
        ok: false,
        error: "That URL is reserved by the system. Choose a different page URL."
      };
    }

    const created = await ensureOrgPageExists({
      orgId: org.orgId,
      pageSlug: availableSlug,
      title: payload.action.title,
      context: {
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        pageSlug: availableSlug
      }
    });

    if (payload.action.isPublished === false) {
      await updateOrgPageSettingsById({
        orgId: org.orgId,
        pageId: created.page.id,
        title: created.page.title,
        slug: created.page.slug,
        isPublished: false
      });
    }

    return {
      ok: true,
      pages: await listOrgPagesForManage(org.orgId),
      createdPageSlug: created.page.slug,
      openEditor: Boolean(payload.action.openEditor)
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to save page updates right now."
    };
  }
}

const createOrgPageSchema = z.object({
  orgSlug: z.string().trim().min(1),
  pageSlug: z.string().trim().min(1).max(120),
  title: z.string().trim().max(120).optional(),
  isPublished: z.boolean().optional()
});

type CreateOrgPageResult =
  | {
      ok: true;
      pageSlug: string;
      created: boolean;
    }
  | {
      ok: false;
      error: string;
    };

export async function createOrgPageAction(input: {
  orgSlug: string;
  pageSlug: string;
  title?: string;
  isPublished?: boolean;
}): Promise<CreateOrgPageResult> {
  const parsed = createOrgPageSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Provide a valid page slug and title."
    };
  }

  try {
    const payload = parsed.data;
    const normalizedPageSlug = sanitizePageSlug(payload.pageSlug);
    const normalizedIsPublished = normalizedPageSlug === "home" ? true : payload.isPublished;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");

    if (normalizedPageSlug !== "home" && isReservedPageSlug(normalizedPageSlug)) {
      return {
        ok: false,
        error: "That URL is reserved by the system. Choose a different page URL."
      };
    }

    const existing = await getEditableOrgPageBySlug({
      orgId: org.orgId,
      pageSlug: normalizedPageSlug,
      context: {
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        pageSlug: normalizedPageSlug
      }
    });

    if (existing) {
      if (payload.title !== undefined || payload.isPublished !== undefined) {
        const nextTitle = payload.title ? normalizePageTitleInput(payload.title, normalizedPageSlug) : existing.page.title;
        const nextIsPublished = normalizedIsPublished ?? existing.page.isPublished;

        await updateOrgPageSettingsById({
          orgId: org.orgId,
          pageId: existing.page.id,
          title: nextTitle,
          slug: existing.page.slug,
          isPublished: nextIsPublished
        });
      }

      return {
        ok: true,
        pageSlug: existing.page.slug,
        created: false
      };
    }

    const created = await ensureOrgPageExists({
      orgId: org.orgId,
      pageSlug: normalizedPageSlug,
      title: payload.title,
      context: {
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        pageSlug: normalizedPageSlug
      }
    });

    if (normalizedIsPublished === false) {
      await updateOrgPageSettingsById({
        orgId: org.orgId,
        pageId: created.page.id,
        title: created.page.title,
        slug: created.page.slug,
        isPublished: false
      });
    }

    return {
      ok: true,
      pageSlug: created.page.slug,
      created: true
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to create this page right now."
    };
  }
}

const setOrgHomePageSchema = z.object({
  orgSlug: z.string().trim().min(1),
  targetPageSlug: z.string().trim().min(1).max(120)
});

type SetOrgHomePageResult =
  | {
      ok: true;
      homeSlug: "home";
      previousHomeSlug: string;
    }
  | {
      ok: false;
      error: string;
    };

export async function setOrgHomePageAction(input: { orgSlug: string; targetPageSlug: string }): Promise<SetOrgHomePageResult> {
  const parsed = setOrgHomePageSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Choose a valid page."
    };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const normalizedTargetSlug = sanitizePageSlug(payload.targetPageSlug);

    if (normalizedTargetSlug === "home") {
      return {
        ok: true,
        homeSlug: "home",
        previousHomeSlug: "home"
      };
    }

    const currentHome = await getEditableOrgPageBySlug({
      orgId: org.orgId,
      pageSlug: "home",
      context: {
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        pageSlug: "home"
      }
    });

    const targetPage = await getEditableOrgPageBySlug({
      orgId: org.orgId,
      pageSlug: normalizedTargetSlug,
      context: {
        orgSlug: org.orgSlug,
        orgName: org.orgName,
        pageSlug: normalizedTargetSlug
      }
    });

    if (!currentHome || !targetPage) {
      return {
        ok: false,
        error: "Unable to find that page."
      };
    }

    const previousHomeSlug = targetPage.page.slug;
    const tempSlug = sanitizePageSlug(`home-swap-${Date.now()}-${Math.floor(Math.random() * 100000)}`);

    await updateOrgPageSettingsById({
      orgId: org.orgId,
      pageId: currentHome.page.id,
      title: currentHome.page.title,
      slug: tempSlug,
      isPublished: true
    });

    await updateOrgPageSettingsById({
      orgId: org.orgId,
      pageId: targetPage.page.id,
      title: targetPage.page.title,
      slug: "home",
      isPublished: true
    });

    await updateOrgPageSettingsById({
      orgId: org.orgId,
      pageId: currentHome.page.id,
      title: currentHome.page.title,
      slug: previousHomeSlug,
      isPublished: currentHome.page.isPublished
    });

    return {
      ok: true,
      homeSlug: "home",
      previousHomeSlug
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to set this page as home right now."
    };
  }
}

const deleteOrgPagesBySlugsSchema = z.object({
  orgSlug: z.string().trim().min(1),
  pageSlugs: z.array(z.string().trim().min(1)).max(200)
});

type DeleteOrgPagesBySlugsResult =
  | {
      ok: true;
      deletedSlugs: string[];
    }
  | {
      ok: false;
      error: string;
    };

export async function deleteOrgPagesBySlugsAction(input: { orgSlug: string; pageSlugs: string[] }): Promise<DeleteOrgPagesBySlugsResult> {
  const parsed = deleteOrgPagesBySlugsSchema.safeParse(input);

  if (!parsed.success) {
    return {
      ok: false,
      error: "Unable to delete pages."
    };
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const uniqueSlugs = [...new Set(payload.pageSlugs.map((slug) => sanitizePageSlug(slug)))].filter((slug) => slug !== "home");
    const deletedSlugs: string[] = [];

    for (const slug of uniqueSlugs) {
      const existing = await getEditableOrgPageBySlug({
        orgId: org.orgId,
        pageSlug: slug,
        context: {
          orgSlug: org.orgSlug,
          orgName: org.orgName,
          pageSlug: slug
        }
      });

      if (!existing) {
        continue;
      }

      const deleted = await deleteOrgPageById(org.orgId, existing.page.id);

      if (deleted) {
        deletedSlugs.push(slug);
      }
    }

    return {
      ok: true,
      deletedSlugs
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Unable to delete pages right now."
    };
  }
}
