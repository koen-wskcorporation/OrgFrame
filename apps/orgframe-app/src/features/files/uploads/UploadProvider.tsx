"use client";

import { createContext, useCallback, useMemo } from "react";
import { useFileManager } from "@/src/features/files/manager";
import { uploadPurposeConfigByPurpose } from "@/src/features/files/uploads/config";
import type { OpenUploadOptions, UploadedAsset } from "@/src/features/files/uploads/types";

type UploaderContextValue = {
  openUpload: (options: OpenUploadOptions) => Promise<UploadedAsset | null>;
};

export const UploaderContext = createContext<UploaderContextValue | null>(null);

function defaultUploadTitle(options: OpenUploadOptions) {
  switch (options.purpose) {
    case "org-logo":
      return "Select Organization Logo";
    case "org-icon":
      return "Select Organization Icon";
    case "profile-photo":
      return "Select Profile Photo";
    case "site-hero":
      return "Select Hero Image";
    case "site-block-image":
      return "Select Block Image";
    default:
      return "Select File";
  }
}

function resolveDefaultFolder(options: OpenUploadOptions): OpenUploadOptions["defaultFolder"] {
  if (options.defaultFolder) {
    return options.defaultFolder;
  }

  switch (options.purpose) {
    case "org-logo":
    case "org-icon":
      return { kind: "system", key: "branding" };
    case "program-cover":
      if (options.entityContext?.type === "program" && options.entityContext.id) {
        return {
          kind: "entity",
          entityType: "program",
          entityId: options.entityContext.id
        };
      }
      return { kind: "system", key: "programs" };
    case "site-hero":
    case "site-block-image":
      return { kind: "system", key: "media" };
    case "attachment":
      return { kind: "system", key: "documents" };
    case "birth-certificate":
    case "profile-photo":
      return { kind: "system", key: "my-uploads" };
    default:
      return undefined;
  }
}

function resolveAllowedScopes(options: OpenUploadOptions) {
  if (options.kind === "account") {
    return ["personal"] as const;
  }

  if (options.kind === "org" || options.kind === "public-org") {
    return ["organization"] as const;
  }

  return options.orgSlug ? (["organization", "personal"] as const) : (["personal"] as const);
}

function resolveUploadVisibility(options: OpenUploadOptions) {
  switch (options.purpose) {
    case "org-logo":
    case "org-icon":
    case "program-cover":
    case "site-hero":
    case "site-block-image":
      return "public" as const;
    default:
      return options.kind === "account" ? ("private" as const) : undefined;
  }
}

function resolveUploadAccessTag(options: OpenUploadOptions) {
  switch (options.purpose) {
    case "org-logo":
    case "org-icon":
      return "branding" as const;
    case "program-cover":
      return "programs" as const;
    case "site-hero":
    case "site-block-image":
      return "pages" as const;
    case "profile-photo":
    case "birth-certificate":
      return "personal" as const;
    default:
      return options.kind === "account" ? ("personal" as const) : ("manage" as const);
  }
}

export function UploadProvider({ children }: { children: React.ReactNode }) {
  const { openFileManager } = useFileManager();

  const openUpload = useCallback(async (options: OpenUploadOptions) => {
    const purposeConfig = uploadPurposeConfigByPurpose[options.purpose];
    const selected = await openFileManager({
      mode: "select",
      selectionType: "single",
      orgSlug: options.orgSlug,
      title: options.title ?? defaultUploadTitle(options),
      subtitle: options.description,
      fileTypes: options.constraints?.accept,
      allowUpload: true,
      canManage: true,
      allowedScopes: [...resolveAllowedScopes(options)],
      defaultFolder: resolveDefaultFolder(options),
      entityContext: options.entityContext,
      uploadDefaults: {
        bucket: purposeConfig.bucket,
        accessTag: resolveUploadAccessTag(options),
        visibility: resolveUploadVisibility(options),
        entityType: options.entityContext?.type,
        entityId: options.entityContext?.id ?? null,
        legacyPurpose: options.purpose
      }
    });

    const file = selected?.[0] ?? null;
    if (!file) {
      return null;
    }

    return {
      id: file.id,
      bucket: file.bucket,
      path: file.path,
      publicUrl: file.url ?? "",
      mime: file.mime,
      size: file.size,
      dominantColor: file.dominantColor,
      width: file.width,
      height: file.height,
      crop: file.crop
    };
  }, [openFileManager]);

  const contextValue = useMemo<UploaderContextValue>(() => {
    return {
      openUpload
    };
  }, [openUpload]);

  return <UploaderContext.Provider value={contextValue}>{children}</UploaderContext.Provider>;
}
