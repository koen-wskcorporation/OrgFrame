"use server";

import { z } from "zod";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { requireAuth } from "@/src/features/core/auth/server/requireAuth";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { getSignedProfileAvatarUrl } from "@/src/features/core/account/storage/getSignedProfileAvatarUrl";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { canReadAnyOrgFiles, canReadAccessTag, canWriteAnyOrgFiles, canWriteAccessTag } from "@/src/features/files/manager/access";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import {
  createFolderRecord,
  deleteFileRecord,
  deleteFolderRecord,
  getFileById,
  getFolderById,
  initializeScope,
  listFiles,
  listFolders,
  moveFileRecord,
  moveFolderRecord,
  renameFileRecord,
  renameFolderRecord,
  resolveSystemFolderIds
} from "@/src/features/files/manager/server";
import type {
  FileManagerAccessTag,
  FileManagerEntityType,
  FileManagerPerson,
  FileManagerLoadInput,
  FileManagerMutationInput,
  FileManagerScope,
  FileManagerSnapshot
} from "@/src/features/files/manager/types";

const scopeSchema = z.enum(["organization", "personal"] satisfies FileManagerScope[]);
const accessTagSchema = z.enum(["manage", "branding", "programs", "pages", "personal"] satisfies FileManagerAccessTag[]);
const entityTypeSchema = z.enum(["program", "division", "team", "general"] satisfies FileManagerEntityType[]);
const sortSchema = z.enum(["name-asc", "name-desc", "newest", "oldest", "size-asc", "size-desc"]);

const loadSchema = z.object({
  scope: scopeSchema,
  orgSlug: z.string().trim().min(1).optional(),
  folderId: z.string().uuid().nullable().optional(),
  search: z.string().trim().max(120).optional(),
  sort: sortSchema.optional()
});

const mutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("create-folder"),
    scope: scopeSchema,
    orgSlug: z.string().trim().min(1).optional(),
    parentId: z.string().uuid().nullable(),
    name: z.string().trim().min(1).max(120),
    accessTag: accessTagSchema.optional(),
    entityType: entityTypeSchema.nullable().optional(),
    entityId: z.string().uuid().nullable().optional()
  }),
  z.object({
    action: z.literal("rename-folder"),
    scope: scopeSchema,
    orgSlug: z.string().trim().min(1).optional(),
    folderId: z.string().uuid(),
    name: z.string().trim().min(1).max(120)
  }),
  z.object({
    action: z.literal("move-folder"),
    scope: scopeSchema,
    orgSlug: z.string().trim().min(1).optional(),
    folderId: z.string().uuid(),
    parentId: z.string().uuid().nullable()
  }),
  z.object({
    action: z.literal("delete-folder"),
    scope: scopeSchema,
    orgSlug: z.string().trim().min(1).optional(),
    folderId: z.string().uuid()
  }),
  z.object({
    action: z.literal("rename-file"),
    scope: scopeSchema,
    orgSlug: z.string().trim().min(1).optional(),
    fileId: z.string().uuid(),
    name: z.string().trim().min(1).max(240)
  }),
  z.object({
    action: z.literal("move-file"),
    scope: scopeSchema,
    orgSlug: z.string().trim().min(1).optional(),
    fileId: z.string().uuid(),
    folderId: z.string().uuid()
  }),
  z.object({
    action: z.literal("delete-file"),
    scope: scopeSchema,
    orgSlug: z.string().trim().min(1).optional(),
    fileId: z.string().uuid()
  })
]);

const textReadSchema = z.object({
  scope: scopeSchema,
  orgSlug: z.string().trim().min(1).optional(),
  fileId: z.string().uuid()
});

type FileManagerActionResult<TData> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

type ScopeContext = {
  scope: FileManagerScope;
  userId: string;
  orgId: string | null;
  orgSlug: string | null;
  membershipPermissions: Awaited<ReturnType<typeof getOrgAuthContext>>["membershipPermissions"];
};

function deny(message = "You do not have access to this file area.") {
  return {
    ok: false,
    error: message
  } as const;
}

async function resolveScopeContext(input: { scope: FileManagerScope; orgSlug?: string }) {
  if (input.scope === "personal") {
    const user = await requireAuth();
    return {
      scope: "personal" as const,
      userId: user.id,
      orgId: null,
      orgSlug: null,
      membershipPermissions: []
    };
  }

  if (!input.orgSlug) {
    throw new Error("Organization scope requires an org slug.");
  }

  const org = await getOrgAuthContext(input.orgSlug);
  return {
    scope: "organization" as const,
    userId: org.userId,
    orgId: org.orgId,
    orgSlug: org.orgSlug,
    membershipPermissions: org.membershipPermissions
  };
}

function scopeMatchesOwner(input: { scope: FileManagerScope; orgId: string | null; userId: string }, record: { scope: FileManagerScope; orgId: string | null; ownerUserId: string | null }) {
  if (record.scope !== input.scope) {
    return false;
  }

  if (input.scope === "organization") {
    return record.orgId === input.orgId;
  }

  return record.ownerUserId === input.userId;
}

function canReadFolderForScope(scope: ScopeContext, accessTag: FileManagerAccessTag) {
  if (scope.scope === "personal") {
    return true;
  }

  return canReadAccessTag(scope.membershipPermissions, accessTag);
}

function canWriteFolderForScope(scope: ScopeContext, accessTag: FileManagerAccessTag) {
  if (scope.scope === "personal") {
    return true;
  }

  return canWriteAccessTag(scope.membershipPermissions, accessTag);
}

async function resolvePeopleByUserId(userIds: string[]) {
  if (userIds.length === 0) {
    return {};
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("people").from("users")
    .select("user_id, first_name, last_name, avatar_path")
    .in("user_id", userIds);

  if (error) {
    throw new Error(error.message);
  }

  const peopleByUserId: Record<string, FileManagerPerson> = {};
  await Promise.all(
    (data ?? []).map(async (row) => {
      const userId = String(row.user_id ?? "");
      if (!userId) {
        return;
      }

      const firstName = typeof row.first_name === "string" ? row.first_name.trim() : "";
      const lastName = typeof row.last_name === "string" ? row.last_name.trim() : "";
      const name = `${firstName} ${lastName}`.trim() || `User ${userId.slice(0, 8)}`;
      const avatarPath = typeof row.avatar_path === "string" ? row.avatar_path : null;
      const avatarUrl = avatarPath ? await getSignedProfileAvatarUrl(avatarPath, 60 * 10).catch(() => null) : null;

      peopleByUserId[userId] = {
        userId,
        name,
        avatarUrl
      };
    })
  );

  for (const userId of userIds) {
    if (!peopleByUserId[userId]) {
      peopleByUserId[userId] = {
        userId,
        name: `User ${userId.slice(0, 8)}`,
        avatarUrl: null
      };
    }
  }

  return peopleByUserId;
}

async function resolvePersonalScopeAvatarUrl(userId: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("people").from("users")
    .select("avatar_path")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return null;
  }

  const avatarPath = typeof data?.avatar_path === "string" ? data.avatar_path : null;
  if (!avatarPath) {
    return null;
  }

  return getSignedProfileAvatarUrl(avatarPath, 60 * 10).catch(() => null);
}

export async function loadFileManagerSnapshotAction(input: FileManagerLoadInput): Promise<FileManagerActionResult<FileManagerSnapshot>> {
  try {
    const parsed = loadSchema.parse(input);
    const scope = await resolveScopeContext({
      scope: parsed.scope,
      orgSlug: parsed.orgSlug
    });

    if (scope.scope === "organization") {
      const canReadAny = canReadAnyOrgFiles(scope.membershipPermissions) || canWriteAnyOrgFiles(scope.membershipPermissions);
      if (!canReadAny) {
        return deny();
      }
    }

    await initializeScope({
      scope: scope.scope,
      orgId: scope.orgId,
      userId: scope.userId
    });

    const folders = await listFolders({
      scope: scope.scope,
      orgId: scope.orgId,
      userId: scope.userId
    });

    const readableFolders = folders.filter((folder) => canReadFolderForScope(scope, folder.accessTag));

    const folderId = parsed.folderId ?? null;
    if (folderId && !readableFolders.some((folder) => folder.id === folderId)) {
      return deny("You do not have access to this folder.");
    }

    const files = await listFiles({
      scope: scope.scope,
      orgId: scope.orgId,
      userId: scope.userId,
      folderId,
      search: parsed.search,
      sort: parsed.sort
    });

    const readableFiles = files.filter((file) => canReadFolderForScope(scope, file.accessTag));
    const peopleByUserId = await resolvePeopleByUserId(
      Array.from(
        new Set(
          readableFiles
            .flatMap((file) => {
              const metadata = file.metadataJson ?? {};
              const createdByUserId = typeof metadata.createdByUserId === "string" ? metadata.createdByUserId : null;
              const lastEditedByUserId = typeof metadata.lastEditedByUserId === "string" ? metadata.lastEditedByUserId : null;
              return [file.uploaderUserId, createdByUserId, lastEditedByUserId].filter((value): value is string => Boolean(value));
            })
            .filter((value) => value.length > 0)
        )
      )
    );

    let organizationScopeIconUrl: string | null = null;
    if (parsed.orgSlug) {
      const orgForIcon = await getOrgAuthContext(parsed.orgSlug).catch(() => null);
      organizationScopeIconUrl = getOrgAssetPublicUrl(orgForIcon?.branding.iconPath ?? null);
    }
    const personalScopeAvatarUrl = await resolvePersonalScopeAvatarUrl(scope.userId);

    return {
      ok: true,
      data: {
        folders: readableFolders,
        files: readableFiles,
        systemFolderIds: resolveSystemFolderIds(readableFolders),
        peopleByUserId,
        organizationScopeIconUrl,
        personalScopeAvatarUrl
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Failed to load files."
    };
  }
}

export async function mutateFileManagerAction(input: FileManagerMutationInput): Promise<FileManagerActionResult<{ folderId?: string; fileId?: string }>> {
  try {
    const parsed = mutationSchema.parse(input);
    const scope = await resolveScopeContext({
      scope: parsed.scope,
      orgSlug: parsed.orgSlug
    });

    if (scope.scope === "organization" && !canWriteAnyOrgFiles(scope.membershipPermissions)) {
      return deny("You do not have permission to manage organization files.");
    }

    if (parsed.action === "create-folder") {
      let parentAccessTag: FileManagerAccessTag = scope.scope === "organization" ? "manage" : "personal";
      let parentEntityType: FileManagerEntityType | null = null;
      let parentEntityId: string | null = null;

      if (parsed.parentId) {
        const parentFolder = await getFolderById(parsed.parentId);
        if (!parentFolder || !scopeMatchesOwner(scope, parentFolder)) {
          return deny("Parent folder was not found.");
        }

        if (!canWriteFolderForScope(scope, parentFolder.accessTag)) {
          return deny("You do not have permission to create a folder here.");
        }

        parentAccessTag = parentFolder.accessTag;
        parentEntityType = parentFolder.entityType;
        parentEntityId = parentFolder.entityId;
      }

      const desiredAccessTag = scope.scope === "personal" ? "personal" : parsed.accessTag ?? parentAccessTag;
      if (!canWriteFolderForScope(scope, desiredAccessTag)) {
        return deny("You do not have permission to assign this folder type.");
      }

      const created = await createFolderRecord({
        scope: scope.scope,
        orgId: scope.orgId,
        userId: scope.userId,
        parentId: parsed.parentId,
        name: parsed.name,
        accessTag: desiredAccessTag,
        entityType: scope.scope === "organization" ? parsed.entityType ?? parentEntityType : "general",
        entityId: scope.scope === "organization" ? parsed.entityId ?? parentEntityId : null
      });

      return {
        ok: true,
        data: {
          folderId: created.id
        }
      };
    }

    if (parsed.action === "rename-folder") {
      const folder = await getFolderById(parsed.folderId);
      if (!folder || !scopeMatchesOwner(scope, folder)) {
        return deny("Folder not found.");
      }
      if (!canWriteFolderForScope(scope, folder.accessTag)) {
        return deny("You do not have permission to rename this folder.");
      }

      const renamed = await renameFolderRecord({
        folderId: parsed.folderId,
        name: parsed.name,
        userId: scope.userId
      });

      return {
        ok: true,
        data: {
          folderId: renamed.id
        }
      };
    }

    if (parsed.action === "move-folder") {
      const folder = await getFolderById(parsed.folderId);
      if (!folder || !scopeMatchesOwner(scope, folder)) {
        return deny("Folder not found.");
      }
      if (!canWriteFolderForScope(scope, folder.accessTag)) {
        return deny("You do not have permission to move this folder.");
      }

      if (parsed.parentId) {
        const parentFolder = await getFolderById(parsed.parentId);
        if (!parentFolder || !scopeMatchesOwner(scope, parentFolder)) {
          return deny("Target folder not found.");
        }
        if (!canWriteFolderForScope(scope, parentFolder.accessTag)) {
          return deny("You do not have permission to move into that folder.");
        }
      }

      const moved = await moveFolderRecord({
        folderId: parsed.folderId,
        parentId: parsed.parentId
      });

      return {
        ok: true,
        data: {
          folderId: moved.id
        }
      };
    }

    if (parsed.action === "delete-folder") {
      const folder = await getFolderById(parsed.folderId);
      if (!folder || !scopeMatchesOwner(scope, folder)) {
        return deny("Folder not found.");
      }
      if (!canWriteFolderForScope(scope, folder.accessTag)) {
        return deny("You do not have permission to delete this folder.");
      }

      await deleteFolderRecord({ folderId: parsed.folderId });

      return {
        ok: true,
        data: {
          folderId: parsed.folderId
        }
      };
    }

    if (parsed.action === "rename-file") {
      const file = await getFileById(parsed.fileId);
      if (!file || !scopeMatchesOwner(scope, file)) {
        return deny("File not found.");
      }
      if (!canWriteFolderForScope(scope, file.accessTag)) {
        return deny("You do not have permission to rename this file.");
      }

      const renamed = await renameFileRecord({
        fileId: parsed.fileId,
        name: parsed.name,
        userId: scope.userId
      });

      return {
        ok: true,
        data: {
          fileId: renamed.id
        }
      };
    }

    if (parsed.action === "move-file") {
      const file = await getFileById(parsed.fileId);
      if (!file || !scopeMatchesOwner(scope, file)) {
        return deny("File not found.");
      }
      if (!canWriteFolderForScope(scope, file.accessTag)) {
        return deny("You do not have permission to move this file.");
      }

      const targetFolder = await getFolderById(parsed.folderId);
      if (!targetFolder || !scopeMatchesOwner(scope, targetFolder)) {
        return deny("Target folder not found.");
      }
      if (!canWriteFolderForScope(scope, targetFolder.accessTag)) {
        return deny("You do not have permission to move into that folder.");
      }

      const moved = await moveFileRecord({
        fileId: parsed.fileId,
        folderId: parsed.folderId,
        userId: scope.userId
      });

      return {
        ok: true,
        data: {
          fileId: moved.id
        }
      };
    }

    const file = await getFileById(parsed.fileId);
    if (!file || !scopeMatchesOwner(scope, file)) {
      return deny("File not found.");
    }
    if (!canWriteFolderForScope(scope, file.accessTag)) {
      return deny("You do not have permission to delete this file.");
    }

    await deleteFileRecord({ fileId: parsed.fileId });

    return {
      ok: true,
      data: {
        fileId: parsed.fileId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to apply file update."
    };
  }
}

export async function readFileManagerTextContentAction(input: {
  scope: FileManagerScope;
  orgSlug?: string;
  fileId: string;
}): Promise<FileManagerActionResult<{ content: string; name: string }>> {
  try {
    const parsed = textReadSchema.parse(input);
    const scope = await resolveScopeContext({
      scope: parsed.scope,
      orgSlug: parsed.orgSlug
    });

    const file = await getFileById(parsed.fileId);
    if (!file || !scopeMatchesOwner(scope, file)) {
      return deny("File not found.");
    }

    if (!canReadFolderForScope(scope, file.accessTag)) {
      return deny("You do not have permission to read this file.");
    }

    if (!file.url) {
      return {
        ok: false,
        error: "File URL could not be resolved."
      };
    }

    const response = await fetch(file.url, {
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        ok: false,
        error: "Unable to download selected file."
      };
    }

    const content = await response.text();

    return {
      ok: true,
      data: {
        content,
        name: file.name
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to read file."
    };
  }
}
