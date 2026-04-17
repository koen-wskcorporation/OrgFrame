export type FileManagerScope = "organization" | "personal";

export type FileManagerMode = "select" | "manage";

export type FileManagerSelectionType = "single" | "multiple";

export type FileManagerEntityType = "program" | "division" | "team" | "general";

export type FileManagerAccessTag = "manage" | "branding" | "programs" | "pages" | "personal";

export type FileManagerVisibility = "private" | "public";

export type FileManagerSort = "name-asc" | "name-desc" | "newest" | "oldest" | "size-asc" | "size-desc";

export type FileManagerEntityContext = {
  type: FileManagerEntityType;
  id?: string | null;
};

export type FileManagerDefaultFolder =
  | {
      kind: "id";
      id: string;
    }
  | {
      kind: "system";
      key: "branding" | "media" | "documents" | "imports" | "my-uploads" | "programs" | "divisions" | "teams";
    }
  | {
      kind: "entity";
      entityType: Exclude<FileManagerEntityType, "general">;
      entityId: string;
    };

export type FileManagerFolder = {
  id: string;
  scope: FileManagerScope;
  orgId: string | null;
  ownerUserId: string | null;
  parentId: string | null;
  name: string;
  slug: string;
  accessTag: FileManagerAccessTag;
  isSystem: boolean;
  entityType: FileManagerEntityType | null;
  entityId: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FileManagerFile = {
  id: string;
  name: string;
  scope: FileManagerScope;
  folderId: string;
  orgId: string | null;
  ownerUserId: string | null;
  mime: string;
  size: number;
  bucket: string;
  path: string;
  url: string | null;
  visibility: FileManagerVisibility;
  accessTag: FileManagerAccessTag;
  entityType: FileManagerEntityType | null;
  entityId: string | null;
  width?: number;
  height?: number;
  crop?: {
    focalX: number;
    focalY: number;
    zoom: number;
  };
  dominantColor?: string;
  uploaderUserId: string | null;
  createdAt: string;
  updatedAt: string;
  metadataJson: Record<string, unknown>;
};

export type FileManagerPerson = {
  userId: string;
  name: string;
  avatarUrl: string | null;
};

export type FileManagerUploadDefaults = {
  bucket?: string;
  accessTag?: FileManagerAccessTag;
  visibility?: FileManagerVisibility;
  entityType?: FileManagerEntityType;
  entityId?: string | null;
  legacyPurpose?: string | null;
};

export type OpenFileManagerOptions = {
  mode: FileManagerMode;
  selectionType?: FileManagerSelectionType;
  allowedScopes?: FileManagerScope[];
  orgSlug?: string;
  title?: string;
  subtitle?: string;
  fileTypes?: string;
  allowUpload?: boolean;
  canManage?: boolean;
  defaultFolder?: FileManagerDefaultFolder;
  entityContext?: FileManagerEntityContext;
  uploadDefaults?: FileManagerUploadDefaults;
};

export type FileManagerSnapshot = {
  folders: FileManagerFolder[];
  files: FileManagerFile[];
  systemFolderIds: Record<string, string>;
  peopleByUserId: Record<string, FileManagerPerson>;
  organizationScopeIconUrl: string | null;
  personalScopeAvatarUrl: string | null;
};

export type FileManagerLoadInput = {
  scope: FileManagerScope;
  orgSlug?: string;
  folderId?: string | null;
  search?: string;
  sort?: FileManagerSort;
};

export type FileManagerMutationInput =
  | {
      action: "create-folder";
      scope: FileManagerScope;
      orgSlug?: string;
      parentId: string | null;
      name: string;
      accessTag?: FileManagerAccessTag;
      entityType?: FileManagerEntityType | null;
      entityId?: string | null;
    }
  | {
      action: "rename-folder";
      scope: FileManagerScope;
      orgSlug?: string;
      folderId: string;
      name: string;
    }
  | {
      action: "move-folder";
      scope: FileManagerScope;
      orgSlug?: string;
      folderId: string;
      parentId: string | null;
    }
  | {
      action: "delete-folder";
      scope: FileManagerScope;
      orgSlug?: string;
      folderId: string;
    }
  | {
      action: "rename-file";
      scope: FileManagerScope;
      orgSlug?: string;
      fileId: string;
      name: string;
    }
  | {
      action: "move-file";
      scope: FileManagerScope;
      orgSlug?: string;
      fileId: string;
      folderId: string;
    }
  | {
      action: "delete-file";
      scope: FileManagerScope;
      orgSlug?: string;
      fileId: string;
    };

export type FileManagerUploadPayload = {
  scope: FileManagerScope;
  orgSlug?: string;
  folderId: string;
  bucket?: string;
  accessTag?: FileManagerAccessTag;
  visibility?: FileManagerVisibility;
  entityType?: FileManagerEntityType;
  entityId?: string | null;
  legacyPurpose?: string | null;
  width?: number;
  height?: number;
  crop?: {
    focalX: number;
    focalY: number;
    zoom: number;
  };
  dominantColor?: string;
  metadataJson?: Record<string, unknown>;
};

export type FileManagerUploadResult =
  | {
      ok: true;
      file: FileManagerFile;
    }
  | {
      ok: false;
      error: string;
    };

export type FileManagerContextValue = {
  openFileManager: (options: OpenFileManagerOptions) => Promise<FileManagerFile[] | null>;
};
