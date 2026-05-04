"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Building2, FileIcon, FolderIcon, FolderOpenIcon, MoveRight, Plus, Search, Upload, User, X } from "lucide-react";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Chip } from "@orgframe/ui/primitives/chip";
import { Input } from "@orgframe/ui/primitives/input";
import { NavItem } from "@orgframe/ui/primitives/nav-item";
import { EntityChip } from "@orgframe/ui/primitives/entity-chip";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { Select } from "@orgframe/ui/primitives/select";
import { Tooltip } from "@orgframe/ui/primitives/tooltip";
import { useToast } from "@orgframe/ui/primitives/toast";
import { OrgAreaSidebarSection, OrgAreaSidebarShell } from "@/src/features/core/navigation/components/OrgAreaSidebarShell";
import { ORG_HIERARCHY_ENTITY_CONFIG } from "@/src/features/core/navigation/config/iconRegistry";
import { loadFileManagerSnapshotAction, mutateFileManagerAction } from "@/src/features/files/manager/actions";
import { fileMatchesAccept, formatFileSize, isImageFile, readImageDimensions } from "@/src/features/files/uploads/client-utils";
import type {
  FileManagerContextValue,
  FileManagerDefaultFolder,
  FileManagerFile,
  FileManagerFolder,
  FileManagerLoadInput,
  FileManagerPerson,
  FileManagerScope,
  FileManagerSort,
  OpenFileManagerOptions
} from "@/src/features/files/manager/types";

type ActiveRequest = {
  id: string;
  options: OpenFileManagerOptions;
  resolve: (files: FileManagerFile[] | null) => void;
};

type UploadTask = {
  id: string;
  name: string;
  progress: number;
  state: "uploading" | "done" | "error";
  error: string | null;
};

type MoveDraft = {
  type: "file" | "folder";
  id: string;
  name: string;
  targetFolderId: string;
};

type BrowserItem =
  | {
      kind: "folder";
      folder: FileManagerFolder;
    }
  | {
      kind: "file";
      file: FileManagerFile;
    };

type FileContextCardState =
  | {
      kind: "file";
      fileId: string;
      x: number;
      y: number;
    }
  | {
      kind: "folder";
      folderId: string;
      x: number;
      y: number;
    };

const FileManagerContext = createContext<FileManagerContextValue | null>(null);

const sortOptions: Array<{ label: string; value: FileManagerSort }> = [
  { label: "Newest", value: "newest" },
  { label: "Oldest", value: "oldest" },
  { label: "Name (A-Z)", value: "name-asc" },
  { label: "Name (Z-A)", value: "name-desc" },
  { label: "Size (smallest)", value: "size-asc" },
  { label: "Size (largest)", value: "size-desc" }
];

const scopeOptions: Array<{ value: FileManagerScope; label: string }> = [
  { value: "personal", label: "Personal" },
  { value: "organization", label: "Organization" }
];

function createLocalId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function scopeIcon(scope: FileManagerScope, organizationScopeIconUrl: string | null, personalScopeAvatarUrl: string | null) {
  if (scope === "organization") {
    if (organizationScopeIconUrl) {
      return <img alt="Organization icon" className="h-4 w-4 rounded-sm object-contain" src={organizationScopeIconUrl} />;
    }
    return <Building2 className="h-4 w-4" />;
  }
  if (personalScopeAvatarUrl) {
    return <img alt="Personal profile" className="h-4 w-4 rounded-full object-cover" src={personalScopeAvatarUrl} />;
  }
  return <User className="h-4 w-4" />;
}

function purposeSystemDefaultKey(purpose: string | null | undefined): FileManagerDefaultFolder | undefined {
  switch (purpose) {
    case "org-logo":
    case "org-icon":
      return { kind: "system", key: "branding" };
    case "program-cover":
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

function resolveAllowedScopes(options: OpenFileManagerOptions): FileManagerScope[] {
  if (options.allowedScopes && options.allowedScopes.length > 0) {
    return options.allowedScopes;
  }

  if (options.orgSlug) {
    return ["organization", "personal"];
  }

  return ["personal"];
}

function resolveDefaultScope(options: OpenFileManagerOptions) {
  const allowed = resolveAllowedScopes(options);
  if (allowed.includes("organization") && options.orgSlug) {
    return "organization" as const;
  }

  return allowed[0] ?? "personal";
}

function asFolderMap(folders: FileManagerFolder[]) {
  return new Map(folders.map((folder) => [folder.id, folder]));
}

function sortFoldersByName(input: FileManagerFolder[]) {
  return [...input].sort((a, b) => a.name.localeCompare(b.name));
}

function resolveDefaultFolderId(input: {
  options: OpenFileManagerOptions;
  scope: FileManagerScope;
  folders: FileManagerFolder[];
  systemFolderIds: Record<string, string>;
}) {
  const { options, scope, folders, systemFolderIds } = input;

  const explicitDefault = options.defaultFolder;
  if (explicitDefault?.kind === "id") {
    return explicitDefault.id;
  }

  if (explicitDefault?.kind === "system") {
    const systemId = systemFolderIds[explicitDefault.key];
    if (systemId) {
      return systemId;
    }
  }

  if (explicitDefault?.kind === "entity") {
    const entityFolder = folders.find((folder) => folder.entityType === explicitDefault.entityType && folder.entityId === explicitDefault.entityId);
    if (entityFolder) {
      return entityFolder.id;
    }
  }

  const context = options.entityContext;
  if (context?.id) {
    const contextFolder = folders.find((folder) => folder.entityType === context.type && folder.entityId === context.id);
    if (contextFolder) {
      return contextFolder.id;
    }
  }

  const purposeDefault = purposeSystemDefaultKey(options.uploadDefaults?.legacyPurpose);
  if (purposeDefault?.kind === "system") {
    const purposeFolderId = systemFolderIds[purposeDefault.key];
    if (purposeFolderId) {
      return purposeFolderId;
    }
  }

  if (scope === "personal") {
    return systemFolderIds["my-uploads"] ?? systemFolderIds["personal-uploads"] ?? folders.find((folder) => folder.parentId === null)?.id ?? null;
  }

  return systemFolderIds["organization-files"] ?? folders.find((folder) => folder.parentId === null)?.id ?? null;
}

function resolveUploadAccept(options: OpenFileManagerOptions) {
  if (options.fileTypes && options.fileTypes.trim().length > 0) {
    return options.fileTypes.trim();
  }

  return undefined;
}

function makeUploadRequest(input: {
  file: File;
  payload: Record<string, unknown>;
  onProgress: (progress: number) => void;
}): Promise<{ ok: true; file: FileManagerFile } | { ok: false; error: string }> {
  return new Promise((resolve) => {
    const formData = new FormData();
    formData.set("file", input.file);
    formData.set("payload", JSON.stringify(input.payload));

    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/file-manager/upload");

    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) {
        return;
      }

      const progress = Math.max(0, Math.min(100, Math.round((event.loaded / event.total) * 100)));
      input.onProgress(progress);
    };

    xhr.onerror = () => {
      resolve({
        ok: false,
        error: "Upload failed."
      });
    };

    xhr.onreadystatechange = () => {
      if (xhr.readyState !== XMLHttpRequest.DONE) {
        return;
      }

      try {
        const payload = JSON.parse(xhr.responseText || "{}") as {
          ok?: boolean;
          error?: string;
          file?: FileManagerFile;
        };

        if (xhr.status >= 200 && xhr.status < 300 && payload.ok && payload.file) {
          resolve({
            ok: true,
            file: payload.file
          });
          return;
        }

        resolve({
          ok: false,
          error: payload.error || "Upload failed."
        });
      } catch {
        resolve({
          ok: false,
          error: "Upload failed."
        });
      }
    };

    xhr.send(formData);
  });
}

function extensionLabel(fileName: string) {
  const parts = fileName.split(".");
  if (parts.length <= 1) {
    return "FILE";
  }

  return parts[parts.length - 1]!.slice(0, 6).toUpperCase();
}

function asMetadataUserId(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function asMetadataTimestamp(metadata: Record<string, unknown>, key: string) {
  const value = metadata[key];
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function formatFileTimestamp(value: string | null | undefined) {
  if (!value) {
    return "Unknown";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return "Unknown";
  }

  return parsed.toLocaleString();
}

function isVectorPreview(file: FileManagerFile) {
  const normalizedMime = file.mime.toLowerCase();
  if (normalizedMime === "image/svg+xml" || normalizedMime === "application/svg+xml" || normalizedMime.includes("svg")) {
    return true;
  }

  const ext = file.name.split(".").pop()?.toLowerCase();
  return ext === "svg";
}

function isSpecialFolder(folder: FileManagerFolder) {
  return folder.isSystem;
}

function folderEntityIcon(folder: FileManagerFolder, className: string) {
  if (folder.entityType === "program" || folder.entityType === "division" || folder.entityType === "team") {
    const Icon = ORG_HIERARCHY_ENTITY_CONFIG[folder.entityType].icon;
    return <Icon className={className} />;
  }
  return null;
}

function folderIcon(folder: FileManagerFolder, className: string, options?: { open?: boolean }) {
  const entityIcon = folderEntityIcon(folder, className);
  if (entityIcon) {
    return entityIcon;
  }

  const FallbackIcon = options?.open ? FolderOpenIcon : FolderIcon;
  return <FallbackIcon className={className} />;
}

function FolderTitle({ folder, showDynamicTag = true }: { folder: FileManagerFolder; showDynamicTag?: boolean }) {
  return (
    <span className="flex min-w-0 flex-wrap items-center gap-1.5">
      <span className="min-w-0 break-all whitespace-normal">{folder.name}</span>
      {showDynamicTag && isSpecialFolder(folder) ? (
        <Tooltip content="Dynamic folder. This is system-managed and cannot be renamed or deleted.">
          <Chip color="yellow" size="compact">
            Dynamic
          </Chip>
        </Tooltip>
      ) : null}
    </span>
  );
}

export function FileManagerProvider({ children }: { children: React.ReactNode }) {
  const [activeRequest, setActiveRequest] = useState<ActiveRequest | null>(null);
  const [activeScope, setActiveScope] = useState<FileManagerScope>("personal");
  const [folders, setFolders] = useState<FileManagerFolder[]>([]);
  const [files, setFiles] = useState<FileManagerFile[]>([]);
  const [systemFolderIds, setSystemFolderIds] = useState<Record<string, string>>({});
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [history, setHistory] = useState<Array<string | null>>([null]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const [expandedFolderIds, setExpandedFolderIds] = useState<string[]>([]);
  const [selectedFileIds, setSelectedFileIds] = useState<string[]>([]);
  const [sort, setSort] = useState<FileManagerSort>("newest");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [uploads, setUploads] = useState<UploadTask[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const [moveDraft, setMoveDraft] = useState<MoveDraft | null>(null);
  const [fileCache, setFileCache] = useState<Record<string, FileManagerFile>>({});
  const [peopleByUserId, setPeopleByUserId] = useState<Record<string, FileManagerPerson>>({});
  const [organizationScopeIconUrl, setOrganizationScopeIconUrl] = useState<string | null>(null);
  const [personalScopeAvatarUrl, setPersonalScopeAvatarUrl] = useState<string | null>(null);
  const [fileContextCard, setFileContextCard] = useState<FileContextCardState | null>(null);
  const contextCardRef = useRef<HTMLDivElement | null>(null);
  const requestCounterRef = useRef(0);
  const hasLoadedDataRef = useRef(false);
  const initializedFolderRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const { toast } = useToast();

  const allowedScopes = useMemo(() => {
    return activeRequest ? resolveAllowedScopes(activeRequest.options) : ["personal"];
  }, [activeRequest]);

  const canManage = useMemo(() => {
    if (!activeRequest) {
      return false;
    }

    return activeRequest.options.canManage ?? activeRequest.options.mode === "manage";
  }, [activeRequest]);

  const allowUpload = useMemo(() => {
    if (!activeRequest) {
      return false;
    }

    return activeRequest.options.allowUpload ?? true;
  }, [activeRequest]);

  const uploadAccept = useMemo(() => {
    return activeRequest ? resolveUploadAccept(activeRequest.options) : undefined;
  }, [activeRequest]);

  const folderById = useMemo(() => asFolderMap(folders), [folders]);

  const childrenByParent = useMemo(() => {
    const map = new Map<string | null, FileManagerFolder[]>();

    for (const folder of folders) {
      const key = folder.parentId;
      const list = map.get(key) ?? [];
      list.push(folder);
      map.set(key, list);
    }

    for (const [key, value] of map.entries()) {
      map.set(key, sortFoldersByName(value));
    }

    return map;
  }, [folders]);

  const breadcrumbs = useMemo(() => {
    const nodes: FileManagerFolder[] = [];
    if (!currentFolderId) {
      return nodes;
    }

    let cursor: string | null = currentFolderId;
    while (cursor) {
      const folder = folderById.get(cursor);
      if (!folder) {
        break;
      }

      nodes.unshift(folder);
      cursor = folder.parentId;
    }

    return nodes;
  }, [currentFolderId, folderById]);

  const visibleFolders = useMemo(() => {
    return childrenByParent.get(currentFolderId) ?? [];
  }, [childrenByParent, currentFolderId]);

  const isSearching = debouncedSearch.trim().length > 0;

  const visibleFiles = useMemo(() => {
    if (isSearching) {
      return files;
    }

    return files.filter((file) => file.folderId === currentFolderId);
  }, [currentFolderId, files, isSearching]);

  const browserItems = useMemo<BrowserItem[]>(() => {
    return [
      ...visibleFolders.map((folder) => ({ kind: "folder" as const, folder })),
      ...visibleFiles.map((file) => ({ kind: "file" as const, file }))
    ];
  }, [visibleFiles, visibleFolders]);

  const selectedFiles = useMemo(() => {
    return selectedFileIds.map((id) => fileCache[id]).filter((value): value is FileManagerFile => Boolean(value));
  }, [fileCache, selectedFileIds]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim());
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput]);

  const loadSnapshot = useCallback(async () => {
    if (!activeRequest) {
      return;
    }

    const currentToken = requestCounterRef.current + 1;
    requestCounterRef.current = currentToken;

    const hasRenderedData = hasLoadedDataRef.current;
    if (hasRenderedData) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setErrorMessage(null);

    const input: FileManagerLoadInput = {
      scope: activeScope,
      orgSlug: activeRequest.options.orgSlug,
      folderId: isSearching ? null : currentFolderId,
      search: debouncedSearch.trim() ? debouncedSearch.trim() : undefined,
      sort
    };

    const result = await loadFileManagerSnapshotAction(input);
    if (requestCounterRef.current !== currentToken) {
      return;
    }

    setLoading(false);
    setRefreshing(false);

    if (!result.ok) {
      setErrorMessage(result.error);
      setFolders([]);
      setFiles([]);
      setSystemFolderIds({});
      setPeopleByUserId({});
      setOrganizationScopeIconUrl(null);
      setPersonalScopeAvatarUrl(null);
      return;
    }

    setFolders(result.data.folders);
    setFiles(result.data.files);
    setSystemFolderIds(result.data.systemFolderIds);
    setPeopleByUserId(result.data.peopleByUserId);
    setOrganizationScopeIconUrl(result.data.organizationScopeIconUrl);
    setPersonalScopeAvatarUrl(result.data.personalScopeAvatarUrl);
    hasLoadedDataRef.current = true;
    setFileCache((current) => {
      const next = { ...current };
      for (const file of result.data.files) {
        next[file.id] = file;
      }
      return next;
    });

    if (!initializedFolderRef.current) {
      initializedFolderRef.current = true;
      const targetFolderId = resolveDefaultFolderId({
        options: activeRequest.options,
        scope: activeScope,
        folders: result.data.folders,
        systemFolderIds: result.data.systemFolderIds
      });

      setCurrentFolderId(targetFolderId);
      setHistory([targetFolderId]);
      setHistoryIndex(0);
    }
  }, [activeRequest, activeScope, currentFolderId, debouncedSearch, isSearching, sort]);

  useEffect(() => {
    if (!activeRequest) {
      return;
    }

    void loadSnapshot();
  }, [activeRequest, activeScope, currentFolderId, debouncedSearch, sort, refreshTick, loadSnapshot]);

  const navigateFolder = useCallback((folderId: string | null, pushHistory = true) => {
    setCurrentFolderId(folderId);
    setSelectedFileIds([]);
    setFileContextCard(null);

    if (!pushHistory) {
      return;
    }

    setHistory((current) => {
      const trimmed = current.slice(0, historyIndex + 1);
      const last = trimmed[trimmed.length - 1] ?? null;
      if (last === folderId) {
        return trimmed;
      }
      return [...trimmed, folderId];
    });
    setHistoryIndex((current) => current + 1);
  }, [historyIndex]);

  const goBack = useCallback(() => {
    if (historyIndex <= 0) {
      return;
    }

    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    const target = history[nextIndex] ?? null;
    setCurrentFolderId(target);
    setSelectedFileIds([]);
    setFileContextCard(null);
  }, [history, historyIndex]);

  const goForward = useCallback(() => {
    if (historyIndex >= history.length - 1) {
      return;
    }

    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    const target = history[nextIndex] ?? null;
    setCurrentFolderId(target);
    setSelectedFileIds([]);
    setFileContextCard(null);
  }, [history, historyIndex]);

  const resetStateForRequest = useCallback((request: ActiveRequest) => {
    initializedFolderRef.current = false;
    hasLoadedDataRef.current = false;
    setActiveScope(resolveDefaultScope(request.options));
    setFolders([]);
    setFiles([]);
    setSystemFolderIds({});
    setCurrentFolderId(null);
    setHistory([null]);
    setHistoryIndex(0);
    setExpandedFolderIds([]);
    setSelectedFileIds([]);
    setSearchInput("");
    setDebouncedSearch("");
    setSort("newest");
    setLoading(false);
    setRefreshing(false);
    setErrorMessage(null);
    setUploads([]);
    setMoveDraft(null);
    setDragActive(false);
    setFileCache({});
    setPeopleByUserId({});
    setOrganizationScopeIconUrl(null);
    setPersonalScopeAvatarUrl(null);
    setFileContextCard(null);
  }, []);

  const closeRequest = useCallback((value: FileManagerFile[] | null) => {
    activeRequest?.resolve(value);
    setActiveRequest(null);
  }, [activeRequest]);

  const openFileManager = useCallback((options: OpenFileManagerOptions) => {
    return new Promise<FileManagerFile[] | null>((resolve) => {
      activeRequest?.resolve(null);
      const next: ActiveRequest = {
        id: createLocalId(),
        options,
        resolve
      };
      resetStateForRequest(next);
      setActiveRequest(next);
    });
  }, [activeRequest, resetStateForRequest]);

  const withRefresh = useCallback(() => {
    setRefreshTick((value) => value + 1);
  }, []);

  const toggleFileSelection = useCallback((file: FileManagerFile) => {
    setFileCache((current) => ({
      ...current,
      [file.id]: file
    }));

    setSelectedFileIds((current) => {
      if (!activeRequest) {
        return current;
      }

      const selectionType = activeRequest.options.selectionType ?? "single";
      const has = current.includes(file.id);

      if (selectionType === "multiple") {
        if (has) {
          return current.filter((entry) => entry !== file.id);
        }

        return [...current, file.id];
      }

      if (has) {
        return current;
      }

      return [file.id];
    });
  }, [activeRequest]);

  const createFolder = useCallback(async () => {
    if (!activeRequest) {
      return;
    }

    const nextName = window.prompt("Folder name");
    if (!nextName || !nextName.trim()) {
      return;
    }

    const result = await mutateFileManagerAction({
      action: "create-folder",
      scope: activeScope,
      orgSlug: activeRequest.options.orgSlug,
      parentId: currentFolderId,
      name: nextName.trim()
    });

    if (!result.ok) {
      toast({
        title: "Unable to create folder",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    withRefresh();
  }, [activeRequest, activeScope, currentFolderId, toast, withRefresh]);

  const renameFolder = useCallback(async (folder: FileManagerFolder) => {
    const nextName = window.prompt("Rename folder", folder.name);
    if (!nextName || !nextName.trim() || nextName.trim() === folder.name) {
      return;
    }

    const result = await mutateFileManagerAction({
      action: "rename-folder",
      scope: folder.scope,
      orgSlug: activeRequest?.options.orgSlug,
      folderId: folder.id,
      name: nextName.trim()
    });

    if (!result.ok) {
      toast({
        title: "Unable to rename folder",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    withRefresh();
  }, [activeRequest, toast, withRefresh]);

  const deleteFolder = useCallback(async (folder: FileManagerFolder) => {
    if (!window.confirm(`Delete folder \"${folder.name}\" and all nested files?`)) {
      return;
    }

    const result = await mutateFileManagerAction({
      action: "delete-folder",
      scope: folder.scope,
      orgSlug: activeRequest?.options.orgSlug,
      folderId: folder.id
    });

    if (!result.ok) {
      toast({
        title: "Unable to delete folder",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    if (currentFolderId === folder.id) {
      navigateFolder(folder.parentId, true);
    }

    withRefresh();
  }, [activeRequest, currentFolderId, navigateFolder, toast, withRefresh]);

  const renameFile = useCallback(async (file: FileManagerFile) => {
    const nextName = window.prompt("Rename file", file.name);
    if (!nextName || !nextName.trim() || nextName.trim() === file.name) {
      return;
    }

    const result = await mutateFileManagerAction({
      action: "rename-file",
      scope: file.scope,
      orgSlug: activeRequest?.options.orgSlug,
      fileId: file.id,
      name: nextName.trim()
    });

    if (!result.ok) {
      toast({
        title: "Unable to rename file",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    withRefresh();
  }, [activeRequest, toast, withRefresh]);

  const deleteFile = useCallback(async (file: FileManagerFile) => {
    if (!window.confirm(`Delete file \"${file.name}\"?`)) {
      return;
    }

    const result = await mutateFileManagerAction({
      action: "delete-file",
      scope: file.scope,
      orgSlug: activeRequest?.options.orgSlug,
      fileId: file.id
    });

    if (!result.ok) {
      toast({
        title: "Unable to delete file",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    setSelectedFileIds((current) => current.filter((entry) => entry !== file.id));
    withRefresh();
  }, [activeRequest, toast, withRefresh]);

  const performMove = useCallback(async () => {
    if (!moveDraft) {
      return;
    }

    if (!moveDraft.targetFolderId) {
      toast({
        title: "Select destination",
        description: "Choose a folder to move this item into.",
        variant: "destructive"
      });
      return;
    }

    const result =
      moveDraft.type === "file"
        ? await mutateFileManagerAction({
            action: "move-file",
            scope: activeScope,
            orgSlug: activeRequest?.options.orgSlug,
            fileId: moveDraft.id,
            folderId: moveDraft.targetFolderId
          })
        : await mutateFileManagerAction({
            action: "move-folder",
            scope: activeScope,
            orgSlug: activeRequest?.options.orgSlug,
            folderId: moveDraft.id,
            parentId: moveDraft.targetFolderId === "__root__" ? null : moveDraft.targetFolderId
          });

    if (!result.ok) {
      toast({
        title: "Unable to move item",
        description: result.error,
        variant: "destructive"
      });
      return;
    }

    setMoveDraft(null);
    withRefresh();
  }, [activeRequest, activeScope, moveDraft, toast, withRefresh]);

  const uploadFiles = useCallback(async (incoming: File[]) => {
    if (!activeRequest || !allowUpload) {
      return;
    }

    if (!currentFolderId) {
      toast({
        title: "Choose a folder",
        description: "Open a destination folder before uploading.",
        variant: "destructive"
      });
      return;
    }

    const acceptedFiles = incoming.filter((file) => fileMatchesAccept(file, uploadAccept));
    if (acceptedFiles.length === 0) {
      toast({
        title: "No compatible files",
        description: uploadAccept ? `Allowed file types: ${uploadAccept}` : "No files were accepted.",
        variant: "destructive"
      });
      return;
    }

    for (const file of acceptedFiles) {
      const taskId = createLocalId();
      setUploads((current) => [
        ...current,
        {
          id: taskId,
          name: file.name,
          progress: 0,
          state: "uploading",
          error: null
        }
      ]);

      const imageDimensions = isImageFile(file) ? await readImageDimensions(file) : null;
      const result = await makeUploadRequest({
        file,
        payload: {
          scope: activeScope,
          orgSlug: activeRequest.options.orgSlug,
          folderId: currentFolderId,
          ...activeRequest.options.uploadDefaults,
          width: imageDimensions?.width,
          height: imageDimensions?.height
        },
        onProgress: (progress) => {
          setUploads((current) =>
            current.map((task) => {
              if (task.id !== taskId) {
                return task;
              }

              return {
                ...task,
                progress
              };
            })
          );
        }
      });

      if (!result.ok) {
        setUploads((current) =>
          current.map((task) => {
            if (task.id !== taskId) {
              return task;
            }

            return {
              ...task,
              state: "error",
              error: result.error
            };
          })
        );

        toast({
          title: "Upload failed",
          description: `${file.name}: ${result.error}`,
          variant: "destructive"
        });
        continue;
      }

      setUploads((current) =>
        current.map((task) => {
          if (task.id !== taskId) {
            return task;
          }

          return {
            ...task,
            state: "done",
            progress: 100,
            error: null
          };
        })
      );

      setFileCache((current) => ({
        ...current,
        [result.file.id]: result.file
      }));

      if (activeRequest.options.mode === "select") {
        if ((activeRequest.options.selectionType ?? "single") === "single") {
          setSelectedFileIds([result.file.id]);
        } else {
          setSelectedFileIds((current) => [...current, result.file.id]);
        }
      }
    }

    withRefresh();
  }, [activeRequest, activeScope, allowUpload, currentFolderId, toast, uploadAccept, withRefresh]);

  const handleUploadInputChange = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.currentTarget.value = "";
    if (files.length === 0) {
      return;
    }

    await uploadFiles(files);
  }, [uploadFiles]);

  const handleConfirmSelection = useCallback(() => {
    const chosen = selectedFiles;
    if (chosen.length === 0) {
      return;
    }

    closeRequest(chosen);
  }, [closeRequest, selectedFiles]);

  const handleBrowserContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) {
      return;
    }

    const node = target.closest<HTMLElement>("[data-file-id], [data-folder-id]");
    if (!node) {
      return;
    }

    const fileId = node.dataset.fileId;
    const folderId = node.dataset.folderId;

    event.preventDefault();
    event.stopPropagation();
    if (fileId) {
      setFileContextCard({
        kind: "file",
        fileId,
        x: event.clientX,
        y: event.clientY
      });
    } else if (folderId) {
      setFileContextCard({
        kind: "folder",
        folderId,
        x: event.clientX,
        y: event.clientY
      });
    }
  }, []);

  const contextValue = useMemo<FileManagerContextValue>(() => {
    return {
      openFileManager
    };
  }, [openFileManager]);

  const sidebarTreeStartId = useMemo(() => {
    if (activeScope === "organization") {
      return systemFolderIds["organization-files"] ?? null;
    }
    return null;
  }, [activeScope, systemFolderIds]);

  const title = activeRequest?.options.title ?? (activeRequest?.options.mode === "select" ? "Select Files" : "File Manager");
  const subtitle = activeRequest?.options.subtitle ?? "Browse organization and personal files, upload, and manage folders in one place.";
  const contextCardFile = useMemo(() => {
    if (!fileContextCard || fileContextCard.kind !== "file") {
      return null;
    }
    return files.find((entry) => entry.id === fileContextCard.fileId) ?? null;
  }, [fileContextCard, files]);
  const contextCardFolder = useMemo(() => {
    if (!fileContextCard || fileContextCard.kind !== "folder") {
      return null;
    }
    return folderById.get(fileContextCard.folderId) ?? null;
  }, [fileContextCard, folderById]);
  const contextCardPosition = useMemo(() => {
    if (!fileContextCard || typeof window === "undefined") {
      return null;
    }

    const cardWidth = 360;
    const cardHeight = 420;
    const margin = 12;

    return {
      left: Math.max(margin, Math.min(fileContextCard.x + 8, window.innerWidth - cardWidth - margin)),
      top: Math.max(margin, Math.min(fileContextCard.y + 8, window.innerHeight - cardHeight - margin))
    };
  }, [fileContextCard]);

  useEffect(() => {
    if (!fileContextCard) {
      return;
    }

    const close = () => setFileContextCard(null);
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      const cardNode = contextCardRef.current;
      if (cardNode && cardNode.contains(target)) {
        return;
      }

      close();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        close();
      }
    };

    window.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [fileContextCard]);

  useEffect(() => {
    if (!currentFolderId) {
      return;
    }

    const ancestors: string[] = [];
    let cursor: string | null = currentFolderId;
    while (cursor) {
      const folder = folderById.get(cursor);
      if (!folder?.parentId) {
        break;
      }
      ancestors.push(folder.parentId);
      cursor = folder.parentId;
    }

    if (ancestors.length === 0) {
      return;
    }

    setExpandedFolderIds((current) => [...new Set([...current, ...ancestors])]);
  }, [currentFolderId, folderById]);

  function renderTree(parentId: string | null): React.ReactNode {
    const nodes = childrenByParent.get(parentId) ?? [];
    if (nodes.length === 0) {
      return null;
    }

    return nodes.map((folder) => {
      const isActive = currentFolderId === folder.id;
      const hasChildren = (childrenByParent.get(folder.id) ?? []).length > 0;
      const isExpanded = expandedFolderIds.includes(folder.id);
      return (
        <NavItem
          active={isActive}
          chevronPosition="start"
          className="rounded-full"
          contentClassName="text-left"
          dropdown={hasChildren ? renderTree(folder.id) : null}
          dropdownOpen={isExpanded}
          icon={folderIcon(folder, "h-4 w-4", { open: isActive })}
          key={folder.id}
          onClick={() => navigateFolder(folder.id, true)}
          onDropdownOpenChange={(next) => {
            setExpandedFolderIds((current) => {
              if (next) {
                return current.includes(folder.id) ? current : [...current, folder.id];
              }
              return current.filter((id) => id !== folder.id);
            });
          }}
          type="button"
          variant="sidebar"
        >
          <FolderTitle folder={folder} showDynamicTag={false} />
        </NavItem>
      );
    });
  }

  return (
    <FileManagerContext.Provider value={contextValue}>
      {children}

      <Popup
        closeOnBackdrop={false}
        contentClassName="overflow-hidden !px-0 !py-0"
        footer={
          activeRequest?.options.mode === "select" ? (
            <>
              <Button onClick={() => closeRequest(null)} size="sm" variant="ghost">
                Cancel
              </Button>
              <Button disabled={selectedFiles.length === 0} onClick={handleConfirmSelection} size="sm">
                Select {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ""}
              </Button>
            </>
          ) : (
            <Button onClick={() => closeRequest(null)} size="sm" variant="ghost">
              Close
            </Button>
          )
        }
        onClose={() => closeRequest(null)}
        open={Boolean(activeRequest)}
        popupClassName="max-h-[92vh] max-w-[92vw] xl:max-w-[96rem]"
        size="xl"
        subtitle={subtitle}
        title={title}
      >
        {activeRequest ? (
          <div className="grid min-h-[68vh] min-w-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
            <OrgAreaSidebarShell className="flex h-full min-h-0 w-full flex-col rounded-none border-b-0 border-l-0 border-r border-t-0 shadow-none">
              <OrgAreaSidebarSection className="flex min-h-0 flex-1 flex-col" title="Files">
                <div className="space-y-1">
                  {scopeOptions
                    .filter((option) => allowedScopes.includes(option.value))
                    .map((option) => (
                      <NavItem
                        active={option.value === activeScope}
                        icon={scopeIcon(option.value, organizationScopeIconUrl, personalScopeAvatarUrl)}
                        key={option.value}
                        onClick={() => {
                          setActiveScope(option.value);
                          initializedFolderRef.current = false;
                          setCurrentFolderId(null);
                          setHistory([null]);
                          setHistoryIndex(0);
                          setSelectedFileIds([]);
                          setFileContextCard(null);
                        }}
                        type="button"
                        variant="sidebar"
                      >
                        {option.label}
                      </NavItem>
                    ))}
                </div>

                {activeScope === "organization" ? (
                  <div className="mt-2 min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">{renderTree(sidebarTreeStartId)}</div>
                ) : null}
              </OrgAreaSidebarSection>
            </OrgAreaSidebarShell>

            <section
              className="flex min-w-0 flex-1 flex-col"
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                  setDragActive(false);
                }
              }}
              onDragOver={(event) => {
                if (!allowUpload) {
                  return;
                }
                event.preventDefault();
                setDragActive(true);
              }}
              onDrop={(event) => {
                if (!allowUpload) {
                  return;
                }
                event.preventDefault();
                setDragActive(false);
                const droppedFiles = Array.from(event.dataTransfer.files ?? []);
                void uploadFiles(droppedFiles);
              }}
            >
              <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3">
                <Button disabled={historyIndex <= 0} onClick={goBack} size="sm" variant="ghost">
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>
                <Button disabled={historyIndex >= history.length - 1} onClick={goForward} size="sm" variant="ghost">
                  Forward
                </Button>

                <div className="mx-1 h-5 w-px bg-border" />

                {breadcrumbs.length > 0 ? (
                  <div className="flex min-w-0 items-center gap-1 text-xs text-text-muted">
                    {breadcrumbs.map((folder, index) => (
                      <button
                        className="truncate rounded px-1 py-0.5 hover:bg-surface-muted hover:text-text"
                        key={folder.id}
                        onClick={() => navigateFolder(folder.id, true)}
                        type="button"
                      >
                        {index > 0 ? " / " : ""}
                        {folder.name}
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-text-muted">Root</p>
                )}

                <div className="ml-auto flex min-w-[220px] max-w-[360px] flex-1 items-center gap-2 rounded border bg-surface px-2">
                  <Search className="h-4 w-4 text-text-muted" />
                  <Input
                    className="h-8 border-0 bg-transparent px-0"
                    onChange={(event) => setSearchInput(event.target.value)}
                    placeholder="Search files"
                    value={searchInput}
                  />
                </div>

                <Select
                  onChange={(event) => setSort(event.target.value as FileManagerSort)}
                  options={sortOptions}
                  value={sort}
                />

                {canManage ? (
                  <Button onClick={createFolder} size="sm" variant="secondary">
                    <Plus className="h-4 w-4" />
                    New Folder
                  </Button>
                ) : null}

                {allowUpload ? (
                  <>
                    <input
                      accept={uploadAccept}
                      className="hidden"
                      onChange={handleUploadInputChange}
                      ref={fileInputRef}
                      type="file"
                    />
                    <Button onClick={() => fileInputRef.current?.click()} size="sm">
                      <Upload className="h-4 w-4" />
                      Upload
                    </Button>
                  </>
                ) : null}
              </div>

              <div className={`min-h-0 flex-1 overflow-auto px-4 py-3 ${dragActive ? "bg-accent/5" : ""}`}>
                {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

                {uploads.length > 0 ? (
                  <div className="mb-3 space-y-2 rounded-control border bg-surface-muted/40 p-2">
                    {uploads.slice(-4).map((task) => (
                      <div className="space-y-1" key={task.id}>
                        <div className="flex items-center gap-2 text-xs">
                          <p className="truncate font-medium text-text">{task.name}</p>
                          <p className="ml-auto text-text-muted">
                            {task.state === "uploading" ? `${task.progress}%` : task.state === "done" ? "Done" : "Failed"}
                          </p>
                        </div>
                        <div className="h-1.5 rounded bg-border">
                          <div
                            className={`h-full rounded ${task.state === "error" ? "bg-destructive" : "bg-accent"}`}
                            style={{ width: `${task.progress}%` }}
                          />
                        </div>
                        {task.error ? <p className="text-xs text-destructive">{task.error}</p> : null}
                      </div>
                    ))}
                  </div>
                ) : null}

                {moveDraft ? (
                  <div className="mb-3 rounded-control border bg-surface p-2">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text">Move {moveDraft.type}</p>
                      <Button className="ml-auto" onClick={() => setMoveDraft(null)} size="sm" variant="ghost">
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <p className="mt-1 truncate text-xs text-text-muted">{moveDraft.name}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Select
                        onChange={(event) => setMoveDraft((current) => (current ? { ...current, targetFolderId: event.target.value } : current))}
                        options={[
                          { value: "", label: "Select folder" },
                          ...(moveDraft.type === "folder" ? [{ value: "__root__", label: "Root" }] : []),
                          ...folders
                            .filter((folder) => folder.id !== moveDraft.id)
                            .map((folder) => ({
                              value: folder.id,
                              label: folder.name
                            }))
                        ]}
                        value={moveDraft.targetFolderId}
                      />
                      <Button onClick={() => void performMove()} size="sm">
                        Move
                      </Button>
                    </div>
                  </div>
                ) : null}

                {loading && browserItems.length === 0 ? (
                  <div className="grid animate-pulse gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div className="rounded-card border bg-surface p-3" key={`skeleton-${index}`}>
                        <div className="mb-2 h-28 rounded border bg-surface-muted/50" />
                        <div className="h-4 w-4/5 rounded bg-surface-muted/50" />
                        <div className="mt-2 h-3 w-2/3 rounded bg-surface-muted/50" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="relative min-h-[340px]" onContextMenuCapture={handleBrowserContextMenu}>
                    <Repeater
                      className="space-y-3"
                      disableSearch
                      emptyMessage={isSearching ? "No files match your search." : "No files in this folder yet."}
                      getItemKey={(item) => (item.kind === "folder" ? `folder-${item.folder.id}` : `file-${item.file.id}`)}
                      getSearchValue={(item) => item.kind === "folder" ? item.folder.name : `${item.file.name} ${item.file.mime}`}
                      gridClassName="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
                      initialView="grid"
                      items={browserItems}
                      listClassName="space-y-2"
                      renderItem={({ item, view }) => {
                      if (item.kind === "folder") {
                        const folder = item.folder;
                        if (view === "grid") {
                          return (
                            <div className="rounded-card border bg-surface p-3" data-folder-id={folder.id}>
                              <button className="w-full text-left" onClick={() => navigateFolder(folder.id, true)} type="button">
                                <div className="mb-2 flex h-28 items-center justify-center rounded border bg-surface-muted/40">
                                  {folderIcon(folder, "h-8 w-8 text-text-muted")}
                                </div>
                                <p className="text-sm font-semibold text-text">
                                  <FolderTitle folder={folder} />
                                </p>
                                <p className="text-xs text-text-muted">Folder</p>
                              </button>
                            </div>
                          );
                        }

                        return (
                          <div className="flex items-center gap-2 rounded-control border px-2 py-1.5" data-folder-id={folder.id}>
                            <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => navigateFolder(folder.id, true)} type="button">
                              {folderIcon(folder, "h-4 w-4 shrink-0 text-text-muted")}
                              <span className="text-sm text-text">
                                <FolderTitle folder={folder} />
                              </span>
                            </button>
                          </div>
                        );
                      }

                      const file = item.file;
                      const selected = selectedFileIds.includes(file.id);
                      const vectorPreview = isVectorPreview(file);
                      if (view === "grid") {
                        return (
                          <div
                            className={`rounded-card border bg-surface p-3 transition-colors ${selected ? "border-accent bg-accent/10" : "hover:bg-surface-muted"}`}
                            data-file-id={file.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => toggleFileSelection(file)}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                toggleFileSelection(file);
                              }
                            }}
                          >
                            <div className="mb-2 overflow-hidden rounded border bg-surface-muted/40">
                              {file.mime.startsWith("image/") && file.url ? (
                                <img alt={file.name} className={`h-28 w-full ${vectorPreview ? "object-contain p-2" : "object-cover"}`} loading="lazy" src={file.url} />
                              ) : (
                                <div className="flex h-28 w-full items-center justify-center text-xs font-semibold tracking-wide text-text-muted">
                                  {extensionLabel(file.name)}
                                </div>
                              )}
                            </div>
                            <p className="break-all text-sm font-semibold text-text">{file.name}</p>
                            <p className="break-all text-xs text-text-muted">
                              {file.mime || "Unknown"} • {formatFileSize(file.size)}
                            </p>
                          </div>
                        );
                      }

                      return (
                        <div
                          className={`flex w-full items-center gap-2 rounded-control border px-2 py-1.5 text-left transition-colors ${
                            selected ? "border-accent bg-accent/10" : "hover:bg-surface-muted"
                          }`}
                          data-file-id={file.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => toggleFileSelection(file)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              toggleFileSelection(file);
                            }
                          }}
                        >
                          <FileIcon className="h-4 w-4 shrink-0 text-text-muted" />
                          <div className="min-w-0 flex-1">
                            <p className="break-all text-sm font-medium text-text">{file.name}</p>
                            <p className="break-all text-xs text-text-muted">
                              {file.mime || "Unknown"} • {formatFileSize(file.size)}
                            </p>
                          </div>
                        </div>
                      );
                    }}
                    />
                    {refreshing ? (
                      <div className="pointer-events-none absolute inset-0 flex items-start justify-end rounded-card bg-surface/35 p-2 backdrop-blur-[1px]">
                        <Chip className="normal-case tracking-normal" color="neutral" size="compact">
                          Refreshing...
                        </Chip>
                      </div>
                    ) : null}
                  </div>
                )}
              </div>

            </section>
          </div>
        ) : null}
      </Popup>
      {contextCardFile && contextCardPosition
        ? createPortal(
            <div
              className="fixed z-[3000] w-[360px] max-w-[calc(100vw-24px)] rounded-card border bg-surface p-3 shadow-floating"
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
              ref={contextCardRef}
              style={{
                left: contextCardPosition.left,
                top: contextCardPosition.top
              }}
            >
              <div className="border-b pb-2">
                <p className="truncate text-sm font-semibold text-text">{contextCardFile.name}</p>
                <p className="truncate text-xs text-text-muted">{contextCardFile.mime || "Unknown type"}</p>
              </div>

              {canManage ? (
                <div className="mt-2 flex flex-wrap gap-1 border-b pb-2">
                  <Button
                    onClick={() => {
                      setMoveDraft({ type: "file", id: contextCardFile.id, name: contextCardFile.name, targetFolderId: contextCardFile.folderId });
                      setFileContextCard(null);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    <MoveRight className="mr-1 h-3.5 w-3.5" />
                    Move
                  </Button>
                  <Button
                    onClick={() => {
                      void renameFile(contextCardFile);
                      setFileContextCard(null);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Rename
                  </Button>
                  <Button
                    onClick={() => {
                      void deleteFile(contextCardFile);
                      setFileContextCard(null);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    Delete
                  </Button>
                </div>
              ) : null}

              <div className="mt-3 grid grid-cols-[120px_minmax(0,1fr)] gap-y-1 text-xs">
                <p className="text-text-muted">Size</p>
                <p className="truncate text-text">{formatFileSize(contextCardFile.size)}</p>
                <p className="text-text-muted">Dimensions</p>
                <p className="truncate text-text">
                  {contextCardFile.width && contextCardFile.height ? `${contextCardFile.width} x ${contextCardFile.height}` : "Unknown"}
                </p>
                <p className="text-text-muted">Visibility</p>
                <p className="truncate text-text">{contextCardFile.visibility}</p>
                <p className="text-text-muted">Scope</p>
                <p className="truncate text-text">{contextCardFile.scope}</p>
                <p className="text-text-muted">Bucket</p>
                <p className="truncate text-text">{contextCardFile.bucket}</p>
                <p className="text-text-muted">Path</p>
                <p className="truncate text-text" title={contextCardFile.path}>
                  {contextCardFile.path}
                </p>
                <p className="text-text-muted">Created</p>
                <p className="truncate text-text">{formatFileTimestamp(contextCardFile.createdAt)}</p>
                <p className="text-text-muted">Edited</p>
                <p className="truncate text-text">
                  {formatFileTimestamp(asMetadataTimestamp(contextCardFile.metadataJson, "lastEditedAt") ?? contextCardFile.updatedAt)}
                </p>
              </div>

              <div className="mt-3 border-t pt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Created By</p>
                {(() => {
                  const createdByUserId = asMetadataUserId(contextCardFile.metadataJson, "createdByUserId") ?? contextCardFile.uploaderUserId;
                  const createdBy = createdByUserId ? peopleByUserId[createdByUserId] : null;
                  return createdBy ? <EntityChip avatarUrl={createdBy.avatarUrl} name={createdBy.name} /> : <p className="text-xs text-text-muted">Unknown</p>;
                })()}
              </div>

              <div className="mt-3 border-t pt-3">
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Edited By</p>
                {(() => {
                  const createdByUserId = asMetadataUserId(contextCardFile.metadataJson, "createdByUserId") ?? contextCardFile.uploaderUserId;
                  const editedByUserId = asMetadataUserId(contextCardFile.metadataJson, "lastEditedByUserId") ?? createdByUserId;
                  const editedBy = editedByUserId ? peopleByUserId[editedByUserId] : null;
                  return editedBy ? <EntityChip avatarUrl={editedBy.avatarUrl} name={editedBy.name} /> : <p className="text-xs text-text-muted">Unknown</p>;
                })()}
              </div>
            </div>,
            document.body
          )
        : null}
      {contextCardFolder && contextCardPosition
        ? createPortal(
            <div
              className="fixed z-[3000] w-[260px] max-w-[calc(100vw-24px)] rounded-card border bg-surface p-2 shadow-floating"
              onClick={(event) => event.stopPropagation()}
              onContextMenu={(event) => event.preventDefault()}
              ref={contextCardRef}
              style={{
                left: contextCardPosition.left,
                top: contextCardPosition.top
              }}
            >
              <div className="border-b px-1 pb-2">
                <p className="truncate text-sm font-semibold text-text">
                  <FolderTitle folder={contextCardFolder} />
                </p>
                <p className="text-xs text-text-muted">Folder</p>
              </div>
              {canManage ? (
                <div className="mt-2 flex flex-col">
                  <Button
                    className="justify-start"
                    onClick={() => {
                      setMoveDraft({
                        type: "folder",
                        id: contextCardFolder.id,
                        name: contextCardFolder.name,
                        targetFolderId: contextCardFolder.parentId ?? "__root__"
                      });
                      setFileContextCard(null);
                    }}
                    size="sm"
                    variant="ghost"
                  >
                    <MoveRight className="mr-1 h-3.5 w-3.5" />
                    Move
                  </Button>
                  {!contextCardFolder.isSystem ? (
                    <Button
                      className="justify-start"
                      onClick={() => {
                        void renameFolder(contextCardFolder);
                        setFileContextCard(null);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Rename
                    </Button>
                  ) : null}
                  {!contextCardFolder.isSystem ? (
                    <Button
                      className="justify-start"
                      onClick={() => {
                        void deleteFolder(contextCardFolder);
                        setFileContextCard(null);
                      }}
                      size="sm"
                      variant="ghost"
                    >
                      Delete
                    </Button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-2 px-1 text-xs text-text-muted">No actions available.</p>
              )}
            </div>,
            document.body
          )
        : null}
    </FileManagerContext.Provider>
  );
}

export function useFileManager() {
  const context = useContext(FileManagerContext);

  if (!context) {
    throw new Error("useFileManager must be used within FileManagerProvider.");
  }

  return context;
}
