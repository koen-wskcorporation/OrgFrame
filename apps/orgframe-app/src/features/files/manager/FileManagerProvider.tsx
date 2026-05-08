"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Building2, FileIcon, FolderIcon, FolderOpenIcon, Home, MoveRight, Plus, Upload, User, X } from "lucide-react";
import { Popup } from "@orgframe/ui/primitives/popup";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Breadcrumb, type BreadcrumbItem } from "@orgframe/ui/primitives/breadcrumb";
import { Button } from "@orgframe/ui/primitives/button";
import { Card } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { NavItem } from "@orgframe/ui/primitives/nav-item";
import { SearchBar } from "@orgframe/ui/primitives/search-bar";
import { EntityChip } from "@orgframe/ui/primitives/entity-chip";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { Select } from "@orgframe/ui/primitives/select";
import { Tooltip } from "@orgframe/ui/primitives/tooltip";
import { useToast } from "@orgframe/ui/primitives/toast";
import { cn } from "@orgframe/ui/primitives/utils";
import { AppSidebarSection, AppSidebarShell } from "@/src/features/core/navigation/components/AppSidebarShell";
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
  FileManagerSnapshot,
  FileManagerSort,
  OpenFileManagerOptions
} from "@/src/features/files/manager/types";

function snapshotCacheKey(input: FileManagerLoadInput) {
  return [input.scope, input.orgSlug ?? "", input.folderId ?? "_root_", input.search ?? "", input.sort ?? ""].join("|");
}

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
          <Chip color="yellow">
            Dynamic
          </Chip>
        </Tooltip>
      ) : null}
    </span>
  );
}

type FileManagerProviderProps = {
  children: React.ReactNode;
  /**
   * Org slug to warm the snapshot cache for as soon as the provider mounts.
   * When provided, both `personal` and `organization` snapshots are fetched
   * in the background so the first popup-open is instant. Mutations still
   * invalidate the cache; this only avoids the cold-start network wait.
   */
  prefetchOrgSlug?: string | null;
};

export function FileManagerProvider({ children, prefetchOrgSlug }: FileManagerProviderProps) {
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
  const [infoPanelFileId, setInfoPanelFileId] = useState<string | null>(null);
  const contextCardRef = useRef<HTMLDivElement | null>(null);
  const requestCounterRef = useRef(0);
  const hasLoadedDataRef = useRef(false);
  const initializedFolderRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const snapshotCacheRef = useRef<Map<string, FileManagerSnapshot>>(new Map());
  const inFlightKeysRef = useRef<Set<string>>(new Set());
  const prefetchStartedRef = useRef(false);
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

  // For personal scope the user-facing "root" is the `my-uploads` system
  // folder — we hide the wrapper from the breadcrumb and treat it as the
  // navigation home target. Folder creation at this level still works because
  // the create call uses `currentFolderId` as the parent.
  const personalRootId = activeScope === "personal" ? systemFolderIds["my-uploads"] ?? null : null;

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

    // Hide the personal `my-uploads` wrapper — it's the user-facing root.
    if (personalRootId) {
      return nodes.filter((folder) => folder.id !== personalRootId);
    }
    return nodes;
  }, [currentFolderId, folderById, personalRootId]);

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

  const applySnapshot = useCallback((snapshot: FileManagerSnapshot) => {
    setFolders(snapshot.folders);
    setFiles(snapshot.files);
    setSystemFolderIds(snapshot.systemFolderIds);
    setPeopleByUserId((current) => ({ ...current, ...snapshot.peopleByUserId }));
    setOrganizationScopeIconUrl(snapshot.organizationScopeIconUrl);
    setPersonalScopeAvatarUrl(snapshot.personalScopeAvatarUrl);
    hasLoadedDataRef.current = true;
    setFileCache((current) => {
      const next = { ...current };
      for (const file of snapshot.files) {
        next[file.id] = file;
      }
      return next;
    });
  }, []);

  const fetchSnapshot = useCallback(async (input: FileManagerLoadInput, options?: { background?: boolean }) => {
    if (!activeRequest) {
      return;
    }

    const key = snapshotCacheKey(input);
    if (options?.background && inFlightKeysRef.current.has(key)) {
      return;
    }
    inFlightKeysRef.current.add(key);

    const currentToken = requestCounterRef.current + 1;
    requestCounterRef.current = currentToken;

    if (!options?.background) {
      setRefreshing(true);
      setErrorMessage(null);
    }

    const result = await loadFileManagerSnapshotAction(input);
    inFlightKeysRef.current.delete(key);

    if (requestCounterRef.current !== currentToken && !options?.background) {
      return;
    }

    if (!options?.background) {
      setRefreshing(false);
    }

    if (!result.ok) {
      if (!options?.background) {
        setErrorMessage(result.error);
        setFolders([]);
        setFiles([]);
        setSystemFolderIds({});
        setPeopleByUserId({});
        setOrganizationScopeIconUrl(null);
        setPersonalScopeAvatarUrl(null);
      }
      return;
    }

    snapshotCacheRef.current.set(key, result.data);

    if (!options?.background) {
      applySnapshot(result.data);
    } else {
      const liveKey = snapshotCacheKey({
        scope: activeScope,
        orgSlug: activeRequest.options.orgSlug,
        folderId: isSearching ? null : currentFolderId,
        search: debouncedSearch.trim() ? debouncedSearch.trim() : undefined,
        sort
      });
      if (liveKey === key) {
        applySnapshot(result.data);
      }
    }

    if (!initializedFolderRef.current && !options?.background) {
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
  }, [activeRequest, activeScope, applySnapshot, currentFolderId, debouncedSearch, isSearching, sort]);

  const loadSnapshot = useCallback(async () => {
    if (!activeRequest) {
      return;
    }

    const input: FileManagerLoadInput = {
      scope: activeScope,
      orgSlug: activeRequest.options.orgSlug,
      folderId: isSearching ? null : currentFolderId,
      search: debouncedSearch.trim() ? debouncedSearch.trim() : undefined,
      sort
    };

    const cached = snapshotCacheRef.current.get(snapshotCacheKey(input));
    if (cached) {
      applySnapshot(cached);
      setLoading(false);
      setErrorMessage(null);
      // Revalidate silently — fresh data lands without a visible spinner.
      void fetchSnapshot(input, { background: true });
      return;
    }

    if (!hasLoadedDataRef.current) {
      setLoading(true);
    }
    await fetchSnapshot(input);
    setLoading(false);
  }, [activeRequest, activeScope, applySnapshot, currentFolderId, debouncedSearch, fetchSnapshot, isSearching, sort]);

  // Session-warm prefetch: as soon as the provider mounts, fetch the snapshots
  // the user is most likely to land on. Mutations still invalidate via
  // withRefresh(); this just removes the cold-start network wait on the first
  // popup-open (and any subsequent open thereafter, since the cache survives
  // between requests now).
  useEffect(() => {
    if (prefetchStartedRef.current) {
      return;
    }
    prefetchStartedRef.current = true;

    const warm = async (input: FileManagerLoadInput) => {
      const key = snapshotCacheKey(input);
      if (snapshotCacheRef.current.has(key) || inFlightKeysRef.current.has(key)) {
        return;
      }
      inFlightKeysRef.current.add(key);
      const result = await loadFileManagerSnapshotAction(input);
      inFlightKeysRef.current.delete(key);
      if (result.ok) {
        snapshotCacheRef.current.set(key, result.data);
      }
      return result.ok ? result.data : null;
    };

    void (async () => {
      const personalRoot = await warm({ scope: "personal", folderId: null, sort: "newest" });
      const personalMyUploadsId = personalRoot?.systemFolderIds["my-uploads"];
      if (personalMyUploadsId) {
        void warm({ scope: "personal", folderId: personalMyUploadsId, sort: "newest" });
      }

      if (prefetchOrgSlug) {
        const orgRoot = await warm({ scope: "organization", orgSlug: prefetchOrgSlug, folderId: null, sort: "newest" });
        const orgFilesId = orgRoot?.systemFolderIds["organization-files"];
        if (orgFilesId) {
          void warm({ scope: "organization", orgSlug: prefetchOrgSlug, folderId: orgFilesId, sort: "newest" });
        }
      }
    })();
  }, [prefetchOrgSlug]);

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
    setInfoPanelFileId(null);

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

  const resetStateForRequest = useCallback((request: ActiveRequest) => {
    initializedFolderRef.current = false;
    // Keep snapshotCacheRef + hasLoadedDataRef across opens so the popup
    // re-opens instantly from the session-warm cache. Mutations clear the
    // cache via withRefresh().
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
    setInfoPanelFileId(null);
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
    snapshotCacheRef.current.clear();
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
      setInfoPanelFileId(fileId);
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
  const panelFile = useMemo(() => {
    if (!infoPanelFileId) return null;
    return files.find((entry) => entry.id === infoPanelFileId) ?? fileCache[infoPanelFileId] ?? null;
  }, [files, fileCache, infoPanelFileId]);
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
        popupClassName="!max-h-[calc(100vh-3rem)] !max-w-[calc(100vw-3rem)]"
        size="xl"
        subtitle={subtitle}
        title={title}
      >
        {activeRequest ? (
          <div
            className={cn(
              "grid min-h-[68vh] min-w-0 overflow-hidden",
              infoPanelFileId
                ? "grid-cols-[260px_minmax(0,1fr)_340px]"
                : "grid-cols-[260px_minmax(0,1fr)]"
            )}
          >
            <AppSidebarShell className="flex h-full min-h-0 w-full flex-col rounded-none border-b-0 border-l-0 border-r border-t-0 shadow-none">
              <AppSidebarSection className="flex min-h-0 flex-1 flex-col" title="Files">
                <div className="mb-3">
                  <SearchBar
                    onValueChange={setSearchInput}
                    placeholder="Search files"
                    value={searchInput}
                  />
                </div>

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
                          setInfoPanelFileId(null);
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
              </AppSidebarSection>
            </AppSidebarShell>

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
                <Breadcrumb
                  className="min-w-0 flex-1"
                  items={breadcrumbs.map<BreadcrumbItem>((folder) => ({
                    id: folder.id,
                    label: folder.name,
                    icon: folderIcon(folder, "h-3.5 w-3.5"),
                    onClick: () => navigateFolder(folder.id, true)
                  }))}
                  leading={
                    <button
                      className="flex items-center gap-1.5 rounded-control px-1.5 py-1 text-text-muted transition-colors hover:bg-surface-muted hover:text-text"
                      onClick={() => navigateFolder(personalRootId ?? null, true)}
                      type="button"
                    >
                      <Home className="h-3.5 w-3.5" />
                      <span className="sr-only">Root</span>
                    </button>
                  }
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

              <div
                aria-busy={refreshing}
                className={cn(
                  "relative min-h-0 flex-1 overflow-auto px-4 py-3",
                  dragActive ? "bg-accent/5" : null
                )}
              >
                <div
                  aria-hidden
                  className={cn(
                    "pointer-events-none absolute inset-x-0 top-0 z-10 h-0.5 overflow-hidden bg-transparent",
                    refreshing ? "opacity-100" : "opacity-0"
                  )}
                >
                  <div className="h-full w-1/3 animate-[fileManagerProgress_1.1s_ease-in-out_infinite] rounded-full bg-accent" />
                </div>
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
                      gridClassName="grid gap-3 grid-cols-[repeat(auto-fill,minmax(11rem,1fr))]"
                      initialView="grid"
                      items={browserItems}
                      listClassName="space-y-2"
                      renderShell={({ toolbar, body }) => (
                        <div className="space-y-3">
                          <div className="flex flex-wrap items-center justify-start gap-2">
                            <Select
                              aria-label="Sort by"
                              onChange={(event) => setSort(event.target.value as FileManagerSort)}
                              options={sortOptions.map((opt) => ({ value: opt.value, label: `Sort: ${opt.label}` }))}
                              value={sort}
                            />
                            {toolbar}
                          </div>
                          {body}
                        </div>
                      )}
                      renderItem={({ item, view }) => {
                      if (item.kind === "folder") {
                        const folder = item.folder;
                        if (view === "grid") {
                          return (
                            <Card
                              className="overflow-hidden p-2 transition-colors hover:bg-surface-muted/60"
                              data-folder-id={folder.id}
                              onMouseEnter={() => {
                                if (!activeRequest) return;
                                void fetchSnapshot(
                                  {
                                    scope: activeScope,
                                    orgSlug: activeRequest.options.orgSlug,
                                    folderId: folder.id,
                                    sort
                                  },
                                  { background: true }
                                );
                              }}
                            >
                              <button className="flex w-full flex-col gap-2 text-left" onClick={() => navigateFolder(folder.id, true)} type="button">
                                <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-control bg-surface-muted/50">
                                  {folderIcon(folder, "h-10 w-10 text-text-muted")}
                                </div>
                                <div className="px-1 pb-1">
                                  <p className="line-clamp-2 break-words text-sm font-semibold text-text">
                                    <FolderTitle folder={folder} />
                                  </p>
                                  <p className="text-xs text-text-muted">Folder</p>
                                </div>
                              </button>
                            </Card>
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
                          <Card
                            className={cn(
                              "overflow-hidden p-2 transition-colors",
                              selected ? "border-accent bg-accent/10" : "hover:bg-surface-muted/60"
                            )}
                            data-file-id={file.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setFileCache((current) => ({ ...current, [file.id]: file }));
                              setInfoPanelFileId(file.id);
                            }}
                            onKeyDown={(event) => {
                              if (event.key === "Enter" || event.key === " ") {
                                event.preventDefault();
                                setFileCache((current) => ({ ...current, [file.id]: file }));
                                setInfoPanelFileId(file.id);
                              }
                            }}
                          >
                            <div className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-control bg-surface-muted/50">
                              {file.mime.startsWith("image/") && file.url ? (
                                <img
                                  alt={file.name}
                                  className="h-full w-full object-contain p-2"
                                  loading="lazy"
                                  src={file.url}
                                />
                              ) : (
                                <span className="text-xs font-semibold tracking-wide text-text-muted">
                                  {extensionLabel(file.name)}
                                </span>
                              )}
                            </div>
                            <div className="px-1 pb-1 pt-2">
                              <p className="line-clamp-2 break-words text-sm font-semibold text-text">{file.name}</p>
                              <p className="truncate text-xs text-text-muted">
                                {formatFileSize(file.size)}
                              </p>
                            </div>
                          </Card>
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
                          onClick={() => {
                            setFileCache((current) => ({ ...current, [file.id]: file }));
                            setInfoPanelFileId(file.id);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              setFileCache((current) => ({ ...current, [file.id]: file }));
                              setInfoPanelFileId(file.id);
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
                  </div>
                )}
              </div>

            </section>

            {panelFile ? (
              <aside className="flex h-full min-h-0 w-full flex-col overflow-hidden border-l bg-surface">
                <div className="flex items-start gap-2 border-b px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-text" title={panelFile.name}>
                      {panelFile.name}
                    </p>
                    <p className="truncate text-xs text-text-muted">{panelFile.mime || "Unknown type"}</p>
                  </div>
                  <Button
                    aria-label="Close info panel"
                    iconOnly
                    onClick={() => setInfoPanelFileId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
                  <div className="mb-3 flex aspect-square w-full items-center justify-center overflow-hidden rounded-control border bg-surface-muted/40">
                    {panelFile.mime.startsWith("image/") && panelFile.url ? (
                      <img
                        alt={panelFile.name}
                        className="h-full w-full object-contain p-2"
                        loading="lazy"
                        src={panelFile.url}
                      />
                    ) : (
                      <span className="text-sm font-semibold tracking-wide text-text-muted">
                        {extensionLabel(panelFile.name)}
                      </span>
                    )}
                  </div>

                  {activeRequest?.options.mode === "select" ? (
                    <div className="mb-3">
                      <Button
                        className="w-full"
                        onClick={() => toggleFileSelection(panelFile)}
                        size="sm"
                        variant={selectedFileIds.includes(panelFile.id) ? "secondary" : "primary"}
                      >
                        {selectedFileIds.includes(panelFile.id) ? "Deselect" : "Select"}
                      </Button>
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="mb-3 flex flex-wrap gap-1 border-b pb-3">
                      <Button
                        onClick={() => {
                          setMoveDraft({ type: "file", id: panelFile.id, name: panelFile.name, targetFolderId: panelFile.folderId });
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        <MoveRight className="mr-1 h-3.5 w-3.5" />
                        Move
                      </Button>
                      <Button onClick={() => void renameFile(panelFile)} size="sm" variant="ghost">
                        Rename
                      </Button>
                      <Button
                        onClick={() => {
                          void deleteFile(panelFile);
                          setInfoPanelFileId(null);
                        }}
                        size="sm"
                        variant="ghost"
                      >
                        Delete
                      </Button>
                    </div>
                  ) : null}

                  <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1.5 text-xs">
                    <p className="text-text-muted">Size</p>
                    <p className="truncate text-text">{formatFileSize(panelFile.size)}</p>
                    <p className="text-text-muted">Dimensions</p>
                    <p className="truncate text-text">
                      {panelFile.width && panelFile.height ? `${panelFile.width} x ${panelFile.height}` : "Unknown"}
                    </p>
                    <p className="text-text-muted">Visibility</p>
                    <p className="truncate text-text">{panelFile.visibility}</p>
                    <p className="text-text-muted">Scope</p>
                    <p className="truncate text-text">{panelFile.scope}</p>
                    <p className="text-text-muted">Bucket</p>
                    <p className="truncate text-text">{panelFile.bucket}</p>
                    <p className="text-text-muted">Path</p>
                    <p className="truncate text-text" title={panelFile.path}>
                      {panelFile.path}
                    </p>
                    <p className="text-text-muted">Created</p>
                    <p className="truncate text-text">{formatFileTimestamp(panelFile.createdAt)}</p>
                    <p className="text-text-muted">Edited</p>
                    <p className="truncate text-text">
                      {formatFileTimestamp(asMetadataTimestamp(panelFile.metadataJson, "lastEditedAt") ?? panelFile.updatedAt)}
                    </p>
                  </div>

                  <div className="mt-4 border-t pt-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Created By</p>
                    {(() => {
                      const createdByUserId = asMetadataUserId(panelFile.metadataJson, "createdByUserId") ?? panelFile.uploaderUserId;
                      const createdBy = createdByUserId ? peopleByUserId[createdByUserId] : null;
                      return createdBy ? <EntityChip avatarUrl={createdBy.avatarUrl} name={createdBy.name} /> : <p className="text-xs text-text-muted">Unknown</p>;
                    })()}
                  </div>

                  <div className="mt-3 border-t pt-3">
                    <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-text-muted">Edited By</p>
                    {(() => {
                      const createdByUserId = asMetadataUserId(panelFile.metadataJson, "createdByUserId") ?? panelFile.uploaderUserId;
                      const editedByUserId = asMetadataUserId(panelFile.metadataJson, "lastEditedByUserId") ?? createdByUserId;
                      const editedBy = editedByUserId ? peopleByUserId[editedByUserId] : null;
                      return editedBy ? <EntityChip avatarUrl={editedBy.avatarUrl} name={editedBy.name} /> : <p className="text-xs text-text-muted">Unknown</p>;
                    })()}
                  </div>
                </div>
              </aside>
            ) : null}
          </div>
        ) : null}
      </Popup>
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
