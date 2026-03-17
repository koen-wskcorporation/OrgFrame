"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  FileText,
  Globe,
  GripVertical,
  LayoutDashboard,
  Inbox,
  MapPinned,
  Palette,
  Pencil,
  Plus,
  Settings,
  SlidersHorizontal,
  Trash2,
  Users,
  Wrench,
  type LucideIcon
} from "lucide-react";
import { SortableCanvas, type SortableRenderMeta } from "@orgframe/ui/editor/SortableCanvas";
import { EditorSettingsDialog } from "@orgframe/ui/shared/EditorSettingsDialog";
import { Button } from "@orgframe/ui/ui/button";
import { Checkbox } from "@orgframe/ui/ui/checkbox";
import { IconButton } from "@orgframe/ui/ui/icon-button";
import { Input } from "@orgframe/ui/ui/input";
import { NavItem } from "@orgframe/ui/ui/nav-item";
import { PublishStatusIcon } from "@orgframe/ui/ui/publish-status-icon";
import { useToast } from "@orgframe/ui/ui/toast";
import { AdaptiveLogo } from "@orgframe/ui/ui/adaptive-logo";
import { getOrgAdminNavItems, type OrgAdminNavIcon } from "@/lib/org/toolsNav";
import { cn } from "@/lib/utils";
import { saveOrgHeaderMenuAction, savePageSettingsAction } from "@/modules/site-builder/actions";
import {
  ORG_SITE_EDITOR_STATE_EVENT,
  ORG_SITE_OPEN_EDITOR_EVENT,
  ORG_SITE_OPEN_EDITOR_REQUEST_KEY,
  ORG_SITE_SET_EDITOR_EVENT
} from "@/modules/site-builder/events";
import type { OrgManagePage, OrgNavItem } from "@/modules/site-builder/types";
import { ProgramHeaderBar } from "@orgframe/ui/shared/ProgramHeaderBar";

type OrgHeaderProps = {
  orgSlug: string;
  orgName: string;
  orgLogoUrl?: string | null;
  governingBodyLogoUrl?: string | null;
  governingBodyName?: string | null;
  canManageOrg: boolean;
  canEditPages: boolean;
  pages: OrgManagePage[];
  navItems: OrgNavItem[];
};

type NavTreeNode = {
  item: OrgNavItem;
  children: NavTreeNode[];
};

type HeaderMenuNode = {
  item: OrgNavItem;
  href: string | null;
  rel: string | undefined;
  target: string | undefined;
  isActive: boolean;
  children: HeaderMenuNode[];
};

type EditMenuRow = {
  item: OrgNavItem;
  depth: number;
  hasChildren: boolean;
  linkedPage: OrgManagePage | null;
  href: string | null;
};

const ROOT_PARENT_KEY = "__root__";
const toolsNavIconMap: Record<OrgAdminNavIcon, LucideIcon> = {
  wrench: Wrench,
  settings: Settings,
  building: Building2,
  globe: Globe,
  palette: Palette,
  users: Users,
  "credit-card": CreditCard,
  layout: LayoutDashboard,
  calendar: CalendarDays,
  "file-text": FileText,
  map: MapPinned,
  inbox: Inbox
};

function getOrgInitial(orgName: string) {
  return orgName.trim().charAt(0).toUpperCase() || "O";
}

function normalizePath(pathname: string) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return pathname.slice(0, -1);
  }

  return pathname;
}

function pageHref(orgSlug: string, pageSlug: string) {
  return pageSlug === "home" ? `/${orgSlug}` : `/${orgSlug}/${pageSlug}`;
}

function isActivePath(pathname: string, href: string) {
  const current = normalizePath(pathname);
  const normalizedHref = normalizePath(href);

  if (normalizedHref === `/${pathname.split("/")[1]}`) {
    return current === normalizedHref;
  }

  return current === normalizedHref;
}

function isActivePrefixPath(pathname: string, href: string) {
  const current = normalizePath(pathname);
  const normalizedHref = normalizePath(href);
  return current === normalizedHref || current.startsWith(`${normalizedHref}/`);
}

function isEditablePublicOrgPath(pathname: string, orgBasePath: string) {
  if (pathname === orgBasePath) {
    return true;
  }

  if (!pathname.startsWith(`${orgBasePath}/`)) {
    return false;
  }

  return !pathname.startsWith(`${orgBasePath}/manage`) && !pathname.startsWith(`${orgBasePath}/tools`) && !pathname.startsWith(`${orgBasePath}/icon`);
}

function sortedPages(pages: OrgManagePage[]) {
  return [...pages].sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt.localeCompare(b.createdAt));
}

function sortedNavItems(items: OrgNavItem[]) {
  return [...items].sort((a, b) => {
    if (a.parentId !== b.parentId) {
      const aParent = a.parentId ?? "";
      const bParent = b.parentId ?? "";
      return aParent.localeCompare(bParent);
    }

    if (a.sortIndex !== b.sortIndex) {
      return a.sortIndex - b.sortIndex;
    }

    return a.createdAt.localeCompare(b.createdAt);
  });
}

function keyForParent(parentId: string | null) {
  return parentId ?? ROOT_PARENT_KEY;
}

function buildNavTree(items: OrgNavItem[]) {
  const sorted = sortedNavItems(items);
  const byParent = new Map<string, OrgNavItem[]>();

  for (const item of sorted) {
    const key = keyForParent(item.parentId);
    const list = byParent.get(key) ?? [];
    list.push(item);
    byParent.set(key, list);
  }

  const visit = (parentId: string | null, path: Set<string>): NavTreeNode[] => {
    const key = keyForParent(parentId);
    const siblings = byParent.get(key) ?? [];

    return siblings.map((item) => {
      if (path.has(item.id)) {
        return {
          item,
          children: []
        };
      }

      const nextPath = new Set(path);
      nextPath.add(item.id);
      return {
        item,
        children: visit(item.id, nextPath)
      };
    });
  };

  return visit(null, new Set());
}

function flattenNavRows({
  nodes,
  pagesBySlug,
  orgSlug,
  allowUnpublishedLinks,
  depth = 0
}: {
  nodes: NavTreeNode[];
  pagesBySlug: Map<string, OrgManagePage>;
  orgSlug: string;
  allowUnpublishedLinks: boolean;
  depth?: number;
}): EditMenuRow[] {
  const rows: EditMenuRow[] = [];

  for (const node of nodes) {
    const linkedPage = node.item.pageSlug ? pagesBySlug.get(node.item.pageSlug) ?? null : null;
    const hasPageHref = Boolean(linkedPage) && (allowUnpublishedLinks || linkedPage?.isPublished);
    const href = node.item.linkType === "internal" ? (hasPageHref && linkedPage ? pageHref(orgSlug, linkedPage.slug) : null) : node.item.linkType === "external" ? node.item.externalUrl ?? null : null;

    rows.push({
      item: node.item,
      depth,
      hasChildren: node.children.length > 0,
      linkedPage,
      href
    });

    rows.push(
      ...flattenNavRows({
        nodes: node.children,
        pagesBySlug,
        orgSlug,
        allowUnpublishedLinks,
        depth: depth + 1
      })
    );
  }

  return rows;
}

function flattenNavForSave(nodes: NavTreeNode[]) {
  const next: Array<{ id: string; parentId: string | null }> = [];

  const visit = (entries: NavTreeNode[]) => {
    for (const entry of entries) {
      next.push({
        id: entry.item.id,
        parentId: entry.item.parentId
      });
      visit(entry.children);
    }
  };

  visit(nodes);

  return next;
}

function resolveHeaderHref(item: OrgNavItem, orgSlug: string, pagesBySlug: Map<string, OrgManagePage>) {
  if (item.linkType === "none") {
    return null;
  }

  if (item.linkType === "external") {
    const href = item.externalUrl?.trim() ?? "";
    return href || null;
  }

  if (!item.pageSlug) {
    return null;
  }

  const linkedPage = pagesBySlug.get(item.pageSlug);

  if (!linkedPage || !linkedPage.isPublished) {
    return null;
  }

  return pageHref(orgSlug, linkedPage.slug);
}

function buildHeaderMenuNodes({
  nodes,
  orgSlug,
  pagesBySlug,
  currentPathname,
  hasHydrated
}: {
  nodes: NavTreeNode[];
  orgSlug: string;
  pagesBySlug: Map<string, OrgManagePage>;
  currentPathname: string;
  hasHydrated: boolean;
}): HeaderMenuNode[] {
  const rendered: HeaderMenuNode[] = [];

  for (const node of nodes) {
    const children = buildHeaderMenuNodes({
      nodes: node.children,
      orgSlug,
      pagesBySlug,
      currentPathname,
      hasHydrated
    });

    if (!node.item.isVisible) {
      continue;
    }

    const href = resolveHeaderHref(node.item, orgSlug, pagesBySlug);

    if (!href && children.length === 0) {
      continue;
    }

    const isActive = hasHydrated ? (href ? isActivePath(currentPathname, href) : false) || children.some((child) => child.isActive) : false;
    rendered.push({
      item: node.item,
      href,
      rel: node.item.linkType === "external" && node.item.openInNewTab ? "noopener noreferrer" : undefined,
      target: node.item.linkType === "external" && node.item.openInNewTab ? "_blank" : undefined,
      isActive,
      children
    });
  }

  return rendered;
}

function updateItemVisibility(items: OrgNavItem[], itemId: string, isVisible: boolean) {
  return items.map((item) => (item.id === itemId ? { ...item, isVisible } : item));
}

function moveMenuItemWithDrop({
  currentItems,
  activeId,
  overId,
  activeIndex,
  overIndex,
  deltaY
}: {
  currentItems: OrgNavItem[];
  activeId: string;
  overId: string;
  activeIndex: number;
  overIndex: number;
  deltaY: number;
}) {
  const nextById = new Map(currentItems.map((item) => [item.id, { ...item }]));
  const activeItem = nextById.get(activeId);
  const overItem = nextById.get(overId);

  if (!activeItem || !overItem) {
    return null;
  }

  let nextParentId: string | null;

  if (deltaY > 18) {
    nextParentId = overItem.parentId ?? overItem.id;
  } else if (deltaY < -18) {
    nextParentId = null;
  } else {
    nextParentId = overItem.parentId;
  }

  if (nextParentId === activeItem.id) {
    nextParentId = activeItem.parentId;
  }

  const candidateParent = nextParentId ? nextById.get(nextParentId) ?? null : null;

  if (candidateParent?.parentId) {
    nextParentId = candidateParent.parentId;
  }

  const finalParent = nextParentId ? nextById.get(nextParentId) ?? null : null;

  if (finalParent?.parentId === activeItem.id) {
    nextParentId = null;
  }

  const siblingsByParent = new Map<string, string[]>();
  const ordered = sortedNavItems(currentItems);

  for (const item of ordered) {
    if (item.id === activeId) {
      continue;
    }

    const key = keyForParent(item.parentId);
    const siblings = siblingsByParent.get(key) ?? [];
    siblings.push(item.id);
    siblingsByParent.set(key, siblings);
  }

  const targetKey = keyForParent(nextParentId);
  const targetSiblings = siblingsByParent.get(targetKey) ?? [];
  let insertIndex = targetSiblings.length;

  if (overId !== activeId) {
    let anchorId: string | null = null;

    if (overItem.parentId === nextParentId) {
      anchorId = overItem.id;
    } else if (nextParentId === null && overItem.parentId) {
      anchorId = overItem.parentId;
    }

    if (anchorId) {
      const anchorIndex = targetSiblings.indexOf(anchorId);
      if (anchorIndex >= 0) {
        const shouldInsertAfter = overItem.parentId === nextParentId && activeIndex < overIndex;
        insertIndex = anchorIndex + (shouldInsertAfter ? 1 : 0);
      }
    }
  }

  const nextTargetSiblings = [...targetSiblings];
  nextTargetSiblings.splice(Math.max(0, Math.min(insertIndex, nextTargetSiblings.length)), 0, activeId);
  siblingsByParent.set(targetKey, nextTargetSiblings);

  for (const [parentKey, ids] of siblingsByParent.entries()) {
    const parentId = parentKey === ROOT_PARENT_KEY ? null : parentKey;

    ids.forEach((id, index) => {
      const item = nextById.get(id);

      if (!item) {
        return;
      }

      item.parentId = parentId;
      item.sortIndex = index;
    });
  }

  return sortedNavItems([...nextById.values()]);
}

function EditableMenuItemRow({
  row,
  isSaving,
  onToggleVisibility,
  onOpenSettings,
  onOpenEditor,
  onDelete,
  meta
}: {
  row: EditMenuRow;
  isSaving: boolean;
  onToggleVisibility: (item: OrgNavItem) => void;
  onOpenSettings: (row: EditMenuRow) => void;
  onOpenEditor: (href: string) => void;
  onDelete: (item: OrgNavItem) => void;
  meta: SortableRenderMeta;
}) {
  const isPageItem = row.item.linkType === "internal" && Boolean(row.linkedPage);
  const pageUnavailable = row.item.linkType === "internal" && !row.linkedPage;
  const pageUnpublished = Boolean(row.linkedPage && !row.linkedPage.isPublished);

  return (
    <div
      className={cn(
        "inline-flex h-10 w-fit max-w-[min(52vw,440px)] items-center gap-2 rounded-control border bg-surface px-2",
        meta.isDragging ? "shadow-card" : "shadow-none"
      )}
    >
      <IconButton
        icon={<GripVertical />}
        label={`Drag ${row.item.label}`}
        disabled={isSaving}
        type="button"
        {...meta.handleProps.attributes}
        {...meta.handleProps.listeners}
      />

      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 truncate text-sm font-semibold leading-none text-text">
          <PublishStatusIcon
            align="right"
            className="shrink-0"
            disabled={isSaving}
            isLoading={isSaving}
            isPublished={row.item.isVisible}
            onToggle={() => onToggleVisibility(row.item)}
            publishLabel="Show in menu"
            publishedStatusText="Visible"
            size="compact"
            statusLabel={row.item.isVisible ? `Visible status for ${row.item.label}` : `Hidden status for ${row.item.label}`}
            unpublishedStatusText="Hidden"
            unpublishLabel="Hide from menu"
          />
          {row.depth > 0 ? <span className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Sub</span> : null}
          <span className="max-w-[20ch] truncate">{row.item.label}</span>
          {row.hasChildren ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Dropdown</span> : null}
          {pageUnavailable ? <span className="rounded-full border border-destructive/35 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive">Missing page</span> : null}
          {pageUnpublished ? <span className="rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-text-muted">Page unpublished</span> : null}
        </div>
      </div>

      <IconButton icon={<SlidersHorizontal />} label="Menu item settings" disabled={isSaving} onClick={() => onOpenSettings(row)} title="Menu item settings" />

      {isPageItem && row.href ? <IconButton icon={<Pencil />} label="Edit page" disabled={isSaving} onClick={() => onOpenEditor(row.href ?? "")} title="Edit page" /> : null}

      <IconButton icon={<Trash2 />} label="Remove from menu" disabled={isSaving} onClick={() => onDelete(row.item)} title="Remove from menu" />
    </div>
  );
}

export function OrgHeader({
  orgSlug,
  orgName,
  orgLogoUrl,
  governingBodyLogoUrl,
  governingBodyName,
  canManageOrg,
  canEditPages,
  pages,
  navItems
}: OrgHeaderProps) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const pathname = usePathname();
  const router = useRouter();
  const { toast } = useToast();
  const [hasHydrated, setHasHydrated] = useState(false);

  const orgBasePath = `/${orgSlug}`;
  const currentPathname = hasHydrated ? pathname : "";
  const canEditCurrentPage = canEditPages && hasHydrated && isEditablePublicOrgPath(currentPathname, orgBasePath);

  const [isToolsMenuOpen, setIsToolsMenuOpen] = useState(false);
  const [expandedToolsParents, setExpandedToolsParents] = useState<Record<string, boolean>>({});
  const [isScrolled, setIsScrolled] = useState(false);

  const [isMenuEditMode, setIsMenuEditMode] = useState(false);
  const [menuPages, setMenuPages] = useState<OrgManagePage[]>(() => sortedPages(pages));
  const [menuItems, setMenuItems] = useState<OrgNavItem[]>(() => sortedNavItems(navItems));

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createType, setCreateType] = useState<"page" | "placeholder">("page");
  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createPublished, setCreatePublished] = useState(true);
  const [createVisible, setCreateVisible] = useState(true);
  const [createParentId, setCreateParentId] = useState("");

  const [settingsMenuItemId, setSettingsMenuItemId] = useState<string | null>(null);
  const [settingsMenuLabel, setSettingsMenuLabel] = useState("");
  const [settingsMenuVisible, setSettingsMenuVisible] = useState(true);
  const [settingsPageId, setSettingsPageId] = useState<string | null>(null);
  const [settingsTitle, setSettingsTitle] = useState("");
  const [settingsSlug, setSettingsSlug] = useState("");
  const [settingsPublished, setSettingsPublished] = useState(true);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [isPageContentEditing, setIsPageContentEditing] = useState(false);

  const [openHeaderDropdownId, setOpenHeaderDropdownId] = useState<string | null>(null);
  const [isSavingMenu, startSavingMenu] = useTransition();

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const toolsNavItems = useMemo(() => getOrgAdminNavItems(orgSlug), [orgSlug]);
  const toolsNavTopLevelItems = useMemo(() => toolsNavItems.filter((item) => !item.parentKey), [toolsNavItems]);
  const toolsNavChildrenByParent = useMemo(() => {
    const map = new Map<string, typeof toolsNavItems>();

    for (const item of toolsNavItems) {
      if (!item.parentKey) {
        continue;
      }

      const current = map.get(item.parentKey) ?? [];
      current.push(item);
      map.set(item.parentKey, current);
    }

    return map;
  }, [toolsNavItems]);

  useEffect(() => {
    setMenuPages(sortedPages(pages));
  }, [pages]);

  useEffect(() => {
    setMenuItems(sortedNavItems(navItems));
  }, [navItems]);

  const orderedPages = useMemo(() => sortedPages(menuPages), [menuPages]);
  const orderedMenuItems = useMemo(() => sortedNavItems(menuItems), [menuItems]);
  const pagesBySlug = useMemo(() => new Map(orderedPages.map((page) => [page.slug, page])), [orderedPages]);
  const navTree = useMemo(() => buildNavTree(orderedMenuItems), [orderedMenuItems]);
  const headerMenuNodes = useMemo(
    () =>
      buildHeaderMenuNodes({
        nodes: navTree,
        orgSlug,
        pagesBySlug,
        currentPathname,
        hasHydrated
      }),
    [currentPathname, hasHydrated, navTree, orgSlug, pagesBySlug]
  );
  const editableRows = useMemo(
    () =>
      flattenNavRows({
        nodes: navTree,
        pagesBySlug,
        orgSlug,
        allowUnpublishedLinks: true
      }),
    [navTree, orgSlug, pagesBySlug]
  );
  const topLevelParentOptions = useMemo(() => orderedMenuItems.filter((item) => item.parentId === null), [orderedMenuItems]);
  const selectedSettingsMenuItem = useMemo(() => {
    if (!settingsMenuItemId) {
      return null;
    }

    return orderedMenuItems.find((item) => item.id === settingsMenuItemId) ?? null;
  }, [orderedMenuItems, settingsMenuItemId]);
  const selectedSettingsPage = useMemo(() => {
    if (!settingsPageId) {
      return null;
    }

    return orderedPages.find((page) => page.id === settingsPageId) ?? null;
  }, [orderedPages, settingsPageId]);

  const applyServerMenuState = useCallback((nextPages: OrgManagePage[], nextNavItems: OrgNavItem[]) => {
    setMenuPages(sortedPages(nextPages));
    setMenuItems(sortedNavItems(nextNavItems));
  }, []);

  const openEditorOnPath = useCallback(
    (targetPath: string) => {
      const normalizedTarget = normalizePath(targetPath);
      const normalizedCurrent = normalizePath(currentPathname || pathname);

      if (normalizedTarget === normalizedCurrent) {
        window.dispatchEvent(
          new CustomEvent(ORG_SITE_OPEN_EDITOR_EVENT, {
            detail: { pathname: normalizedTarget }
          })
        );
        return;
      }

      sessionStorage.setItem(ORG_SITE_OPEN_EDITOR_REQUEST_KEY, normalizedTarget);
      router.push(normalizedTarget);
    },
    [currentPathname, pathname, router]
  );

  const onToggleVisibility = useCallback(
    (item: OrgNavItem) => {
      const nextVisible = !item.isVisible;
      const previous = orderedMenuItems;
      setMenuItems(updateItemVisibility(previous, item.id, nextVisible));

      startSavingMenu(async () => {
        const result = await saveOrgHeaderMenuAction({
          orgSlug,
          action: {
            type: "set-visible",
            itemId: item.id,
            isVisible: nextVisible
          }
        });

        if (!result.ok) {
          setMenuItems(previous);
          toast({
            title: "Unable to update visibility",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        applyServerMenuState(result.pages, result.navItems);
      });
    },
    [applyServerMenuState, orderedMenuItems, orgSlug, toast]
  );

  const onDeleteMenuItem = useCallback(
    (item: OrgNavItem) => {
      const isConfirmed = window.confirm(`Remove \"${item.label}\" from the header menu?`);

      if (!isConfirmed) {
        return;
      }

      const previous = orderedMenuItems;
      setMenuItems(previous.filter((candidate) => candidate.id !== item.id));

      startSavingMenu(async () => {
        const result = await saveOrgHeaderMenuAction({
          orgSlug,
          action: {
            type: "delete-item",
            itemId: item.id
          }
        });

        if (!result.ok) {
          setMenuItems(previous);
          toast({
            title: "Unable to remove menu item",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        applyServerMenuState(result.pages, result.navItems);
      });
    },
    [applyServerMenuState, orderedMenuItems, orgSlug, toast]
  );

  const onOpenSettings = useCallback((row: EditMenuRow) => {
    setSettingsMenuItemId(row.item.id);
    setSettingsMenuLabel(row.item.label);
    setSettingsMenuVisible(row.item.isVisible);

    if (row.item.linkType === "internal" && row.linkedPage) {
      setSettingsPageId(row.linkedPage.id);
      setSettingsTitle(row.linkedPage.title);
      setSettingsSlug(row.linkedPage.slug);
      setSettingsPublished(row.linkedPage.isPublished);
    } else {
      setSettingsPageId(null);
      setSettingsTitle("");
      setSettingsSlug("");
      setSettingsPublished(true);
    }

    setSettingsDialogOpen(true);
  }, []);

  useEffect(() => {
    const onScroll = () => setIsScrolled(window.scrollY > 8);

    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });

    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    setIsToolsMenuOpen(false);
    setOpenHeaderDropdownId(null);
  }, [pathname]);

  const hasInlineEditingActive = isMenuEditMode || isPageContentEditing;

  useEffect(() => {
    setExpandedToolsParents((current) => {
      const next = { ...current };

      for (const item of toolsNavTopLevelItems) {
        const children = toolsNavChildrenByParent.get(item.key) ?? [];
        if (children.length === 0) {
          continue;
        }

        const isActive = isActivePrefixPath(currentPathname, item.href) || children.some((child) => isActivePrefixPath(currentPathname, child.href));
        if (isActive) {
          next[item.key] = true;
        } else if (!(item.key in next)) {
          next[item.key] = false;
        }
      }

      return next;
    });
  }, [currentPathname, toolsNavChildrenByParent, toolsNavTopLevelItems]);

  useEffect(() => {
    const onEditorState = (event: Event) => {
      const detail = (event as CustomEvent<{ pathname?: string; isEditing?: boolean }>).detail;

      if (!detail?.pathname || normalizePath(detail.pathname) !== normalizePath(currentPathname || pathname)) {
        return;
      }

      setIsPageContentEditing(Boolean(detail.isEditing));
    };

    window.addEventListener(ORG_SITE_EDITOR_STATE_EVENT, onEditorState);

    return () => {
      window.removeEventListener(ORG_SITE_EDITOR_STATE_EVENT, onEditorState);
    };
  }, [currentPathname, pathname]);

  const hasHeaderActions = canEditPages || canManageOrg;

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }

    let rafId = 0;
    const syncHeight = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      const nextHeight = Math.max(0, Math.round(rect?.height ?? 0));
      const nextBottom = Math.max(0, Math.round(rect?.bottom ?? 0));
      document.documentElement.style.setProperty("--org-header-height", `${nextHeight}px`);
      document.documentElement.style.setProperty("--org-header-bottom", `${nextBottom}px`);
    };
    const scheduleSyncHeight = () => {
      if (rafId) {
        return;
      }
      rafId = window.requestAnimationFrame(() => {
        rafId = 0;
        syncHeight();
      });
    };

    syncHeight();
    scheduleSyncHeight();
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && rootRef.current) {
      observer = new ResizeObserver(() => scheduleSyncHeight());
      observer.observe(rootRef.current);
    }
    window.addEventListener("resize", scheduleSyncHeight);
    window.addEventListener("scroll", scheduleSyncHeight, { passive: true });

    return () => {
      if (rafId) {
        window.cancelAnimationFrame(rafId);
      }
      observer?.disconnect();
      window.removeEventListener("resize", scheduleSyncHeight);
      window.removeEventListener("scroll", scheduleSyncHeight);
      document.documentElement.style.setProperty("--org-header-height", "0px");
      document.documentElement.style.setProperty("--org-header-bottom", "0px");
    };
  }, []);

  return (
    <div className="app-container sticky top-[var(--layout-gap)] z-40 pb-[var(--layout-gap)] pt-0" ref={rootRef}>
      <div className={cn("rounded-card border bg-surface shadow-floating transition-shadow", isScrolled ? "shadow-lg" : "") }>
        <div className="flex min-h-[64px] items-center gap-3 pb-2.5 pl-4 pr-2.5 pt-2.5 md:pb-4 md:pl-6 md:pr-4 md:pt-4">
          <div className="shrink-0 self-stretch">
            <Link className="flex h-full min-w-0 items-center gap-3 leading-none" href={orgBasePath} prefetch>
              <span className="flex h-7 max-w-[220px] shrink-0 items-center leading-none md:h-8">
                {orgLogoUrl ? (
                  <AdaptiveLogo
                    alt={`${orgName} logo`}
                    className="block h-full w-auto max-w-full align-middle object-contain object-left"
                    src={orgLogoUrl}
                  />
                ) : (
                  <span className="inline-flex h-full items-center text-sm font-semibold text-text-muted">{getOrgInitial(orgName)}</span>
                )}
              </span>

              {!orgLogoUrl ? <span className="hidden max-w-[180px] truncate text-sm font-semibold text-text sm:inline">{orgName}</span> : null}
            </Link>
          </div>

          <nav className="hidden min-w-0 flex-1 md:block">
            {!isMenuEditMode ? (
              <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
                {headerMenuNodes.map((node) => {
                  const isOpen = openHeaderDropdownId === node.item.id;

                  if (node.children.length === 0) {
                    return (
                      <NavItem
                        active={node.isActive}
                        href={node.href ?? undefined}
                        key={node.item.id}
                        rel={node.rel}
                        target={node.target}
                        variant="header"
                      >
                        {node.item.label}
                      </NavItem>
                    );
                  }

                  return (
                    <div
                      className="relative"
                      key={node.item.id}
                      onBlurCapture={(event) => {
                        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                          setOpenHeaderDropdownId((current) => (current === node.item.id ? null : current));
                        }
                      }}
                      onMouseEnter={() => {
                        setOpenHeaderDropdownId(node.item.id);
                      }}
                      onMouseLeave={() => {
                        setOpenHeaderDropdownId((current) => (current === node.item.id ? null : current));
                      }}
                    >
                      <NavItem
                        active={node.isActive}
                        ariaExpanded={isOpen}
                        ariaHaspopup="menu"
                        href={node.href ?? undefined}
                        key={node.item.id}
                        rel={node.rel}
                        rightSlot={<ChevronDown className={cn("h-3.5 w-3.5 transition-transform", isOpen ? "rotate-180" : "rotate-0")} />}
                        target={node.target}
                        variant="header"
                        onClick={
                          node.href
                            ? undefined
                            : () => {
                                setOpenHeaderDropdownId((current) => (current === node.item.id ? null : node.item.id));
                              }
                        }
                      >
                        {node.item.label}
                      </NavItem>

                      {isOpen ? (
                        <div className="absolute right-0 top-[calc(100%+0.35rem)] z-50 w-[16rem] rounded-card border bg-surface p-2 shadow-floating" role="menu">
                          {node.children.map((child) => (
                            <NavItem
                              active={child.isActive}
                              href={child.href ?? undefined}
                              key={child.item.id}
                              rel={child.rel}
                              role="menuitem"
                              target={child.target}
                              variant="dropdown"
                              onClick={() => {
                                setOpenHeaderDropdownId(null);
                              }}
                            >
                              {child.item.label}
                            </NavItem>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
                <SortableCanvas
                  className="flex min-w-0 items-center justify-end gap-2"
                  getId={(row) => row.item.id}
                  itemClassName="shrink-0"
                  items={editableRows}
                  onDrop={(event) => {
                    const nextItems = moveMenuItemWithDrop({
                      currentItems: orderedMenuItems,
                      activeId: event.activeId,
                      overId: event.overId,
                      activeIndex: event.activeIndex,
                      overIndex: event.overIndex,
                      deltaY: event.delta.y
                    });

                    if (!nextItems) {
                      return true;
                    }

                    const previous = orderedMenuItems;
                    setMenuItems(nextItems);

                    startSavingMenu(async () => {
                      const nextTree = buildNavTree(nextItems);
                      const result = await saveOrgHeaderMenuAction({
                        orgSlug,
                        action: {
                          type: "reorder-tree",
                          items: flattenNavForSave(nextTree)
                        }
                      });

                      if (!result.ok) {
                        setMenuItems(previous);
                        toast({
                          title: "Unable to reorder menu",
                          description: result.error,
                          variant: "destructive"
                        });
                        return;
                      }

                      applyServerMenuState(result.pages, result.navItems);
                    });

                    return true;
                  }}
                  onReorder={() => {
                    // Sorting is handled in onDrop to support drag-to-nest.
                  }}
                  sortingStrategy="horizontal"
                  renderItem={(row, meta) => (
                    <EditableMenuItemRow
                      isSaving={isSavingMenu}
                      meta={meta}
                      onDelete={onDeleteMenuItem}
                      onOpenEditor={(href) => {
                        setIsMenuEditMode(false);
                        openEditorOnPath(href);
                      }}
                      onOpenSettings={onOpenSettings}
                      onToggleVisibility={onToggleVisibility}
                      row={row}
                    />
                  )}
                />

                <IconButton
                  icon={<Plus className="h-4 w-4" />}
                  label="Add menu item"
                  onClick={() => {
                    setCreateType("page");
                    setCreateTitle("");
                    setCreateSlug("");
                    setCreatePublished(true);
                    setCreateVisible(true);
                    setCreateParentId("");
                    setCreateDialogOpen(true);
                  }}
                />
              </div>
            )}
          </nav>

          {hasHeaderActions ? <span aria-hidden className="hidden h-6 w-px shrink-0 bg-border md:block" /> : null}

          <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
            {canEditPages && hasInlineEditingActive ? (
              <Button
                onClick={() => {
                  setIsMenuEditMode(false);
                  setCreateDialogOpen(false);
                  setSettingsDialogOpen(false);
                  setIsToolsMenuOpen(false);
                  window.dispatchEvent(
                    new CustomEvent(ORG_SITE_SET_EDITOR_EVENT, {
                      detail: {
                        pathname: currentPathname || pathname,
                        isEditing: false
                      }
                    })
                  );
                }}
                size="md"
                type="button"
                variant="primary"
              >
                Done
              </Button>
            ) : null}

            {canEditCurrentPage && !hasInlineEditingActive ? (
              <Button onClick={() => openEditorOnPath(currentPathname || orgBasePath)} size="md" type="button" variant="ghost">
                <Pencil className="h-4 w-4" />
                Edit Page
              </Button>
            ) : null}

            {canEditPages && !hasInlineEditingActive ? (
              <Button
                onClick={() => {
                  setIsMenuEditMode(true);
                  setCreateDialogOpen(false);
                  setSettingsDialogOpen(false);
                  setIsToolsMenuOpen(false);
                }}
                size="md"
                type="button"
                variant="ghost"
              >
                <LayoutDashboard className="h-4 w-4" />
                Edit Menu
              </Button>
            ) : null}

            {canManageOrg && !hasInlineEditingActive ? (
              <div
                className="relative"
                onBlurCapture={(event) => {
                  if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                    setIsToolsMenuOpen(false);
                  }
                }}
              >
                <Button
                  aria-expanded={isToolsMenuOpen}
                  aria-label="Open admin menu"
                  onClick={() => setIsToolsMenuOpen((current) => !current)}
                  size="md"
                  type="button"
                >
                  <Wrench className="h-4 w-4" />
                  Tools
                  <ChevronDown className={cn("h-4 w-4 transition-transform", isToolsMenuOpen ? "rotate-180" : "rotate-0")} />
                </Button>
                {isToolsMenuOpen ? (
                  <div className="absolute right-0 top-[calc(100%+0.5rem)] z-50 w-[20rem] max-w-[calc(100vw-1rem)] rounded-card border bg-surface p-2 shadow-floating">
                    {toolsNavTopLevelItems.map((item) => {
                      const children = toolsNavChildrenByParent.get(item.key) ?? [];
                      const isActive = isActivePrefixPath(currentPathname, item.href) || children.some((child) => isActivePrefixPath(currentPathname, child.href));
                      const isExpanded = Boolean(expandedToolsParents[item.key]);

                      return (
                        <div className="space-y-1" key={item.key}>
                          {children.length > 0 ? (
                            <NavItem
                              accentWhenActive
                              active={isActive}
                              icon={(() => {
                                const Icon = toolsNavIconMap[item.icon];
                                return <Icon className="h-[17px] w-[17px]" />;
                              })()}
                              rightSlot={<ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded ? "rotate-180" : "rotate-0")} />}
                              size="md"
                              type="button"
                              variant="sidebar"
                              onClick={() => {
                                setExpandedToolsParents((current) => ({
                                  ...current,
                                  [item.key]: !Boolean(current[item.key])
                                }));
                              }}
                            >
                              {item.label}
                            </NavItem>
                          ) : (
                            <NavItem
                              accentWhenActive
                              active={isActive}
                              href={item.href}
                              icon={(() => {
                                const Icon = toolsNavIconMap[item.icon];
                                return <Icon className="h-[17px] w-[17px]" />;
                              })()}
                              size="md"
                              variant="sidebar"
                              onClick={() => setIsToolsMenuOpen(false)}
                            >
                              {item.label}
                            </NavItem>
                          )}
                          {children.length > 0 && isExpanded ? (
                            <div className="space-y-1 pb-1 pl-[14px]">
                              {children.map((child) => (
                                <NavItem
                                  active={isActivePrefixPath(currentPathname, child.href)}
                                  href={child.href}
                                  icon={(() => {
                                    const Icon = toolsNavIconMap[child.icon];
                                    return <Icon className="h-4 w-4" />;
                                  })()}
                                  key={child.key}
                                  size="sm"
                                  variant="sidebar"
                                  onClick={() => setIsToolsMenuOpen(false)}
                                >
                                  {child.label}
                                </NavItem>
                              ))}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        <ProgramHeaderBar orgSlug={orgSlug} />
      </div>

      <EditorSettingsDialog
        footer={
          <>
            <Button
              onClick={() => {
                setCreateDialogOpen(false);
              }}
              size="sm"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={isSavingMenu || !createTitle.trim()}
              loading={isSavingMenu}
              onClick={() => {
                startSavingMenu(async () => {
                  const parentId = createParentId || null;
                  const result =
                    createType === "page"
                      ? await saveOrgHeaderMenuAction({
                          orgSlug,
                          action: {
                            type: "create-page",
                            title: createTitle,
                            slug: createSlug.trim() ? createSlug : undefined,
                            parentId,
                            isPublished: createPublished,
                            isVisible: createVisible
                          }
                        })
                      : await saveOrgHeaderMenuAction({
                          orgSlug,
                          action: {
                            type: "create-placeholder",
                            label: createTitle,
                            parentId,
                            isVisible: createVisible
                          }
                        });

                  if (!result.ok) {
                    toast({
                      title: createType === "page" ? "Unable to create page" : "Unable to create dropdown",
                      description: result.error,
                      variant: "destructive"
                    });
                    return;
                  }

                  applyServerMenuState(result.pages, result.navItems);
                  setCreateTitle("");
                  setCreateSlug("");
                  setCreatePublished(true);
                  setCreateVisible(true);
                  setCreateParentId("");
                  setCreateDialogOpen(false);
                });
              }}
              size="sm"
            >
              Create
            </Button>
          </>
        }
        onClose={() => {
          setCreateDialogOpen(false);
        }}
        open={createDialogOpen}
        size="md"
        title={createType === "page" ? "Create page" : "Create dropdown"}
      >
        <div className="space-y-3">
          <div className="inline-flex w-full rounded-control border bg-surface p-1">
            <button
              className={cn("flex-1 rounded-control px-3 py-2 text-sm font-semibold", createType === "page" ? "bg-surface-muted text-text" : "text-text-muted")}
              onClick={() => setCreateType("page")}
              type="button"
            >
              Page
            </button>
            <button
              className={cn("flex-1 rounded-control px-3 py-2 text-sm font-semibold", createType === "placeholder" ? "bg-surface-muted text-text" : "text-text-muted")}
              onClick={() => setCreateType("placeholder")}
              type="button"
            >
              Dropdown
            </button>
          </div>

          <Input
            onChange={(event) => setCreateTitle(event.target.value)}
            placeholder={createType === "page" ? "Page title" : "Dropdown label"}
            value={createTitle}
          />

          {createType === "page" ? <Input onChange={(event) => setCreateSlug(event.target.value)} placeholder="URL slug (optional)" value={createSlug} /> : null}

          <label className="space-y-1 text-sm font-semibold text-text">
            Parent menu item
            <select
              className="mt-1 h-10 w-full rounded-control border border-border bg-surface px-3 text-sm text-text"
              onChange={(event) => setCreateParentId(event.target.value)}
              value={createParentId}
            >
              <option value="">Top level</option>
              {topLevelParentOptions.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>

          {createType === "page" ? (
            <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
              <Checkbox
                checked={createPublished}
                onChange={(event) => {
                  setCreatePublished(event.target.checked);
                }}
              />
              Publish page
            </label>
          ) : null}

          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
            <Checkbox
              checked={createVisible}
              onChange={(event) => {
                setCreateVisible(event.target.checked);
              }}
            />
            Visible in menu
          </label>
        </div>
      </EditorSettingsDialog>

      <EditorSettingsDialog
        footer={
          <>
            <Button
              onClick={() => {
                setSettingsDialogOpen(false);
              }}
              size="sm"
              variant="secondary"
            >
              Cancel
            </Button>
            <Button
              disabled={isSavingMenu || !settingsMenuItemId}
              loading={isSavingMenu}
              onClick={() => {
                if (!settingsMenuItemId) {
                  return;
                }

                startSavingMenu(async () => {
                  if (settingsPageId) {
                    const previousSlug = selectedSettingsPage?.slug ?? settingsSlug;
                    const pageResult = await savePageSettingsAction({
                      orgSlug,
                      pageId: settingsPageId,
                      title: settingsTitle,
                      pageSlug: settingsSlug,
                      isPublished: settingsPublished
                    });

                    if (!pageResult.ok) {
                      toast({
                        title: "Unable to save page settings",
                        description: pageResult.error,
                        variant: "destructive"
                      });
                      return;
                    }

                    if (pageResult.navItems) {
                      applyServerMenuState(pageResult.pages, pageResult.navItems);
                    } else {
                      setMenuPages(sortedPages(pageResult.pages));
                      setMenuItems((current) =>
                        sortedNavItems(
                          current.map((item) => {
                            if (item.linkType !== "internal" || item.pageSlug !== previousSlug) {
                              return item;
                            }

                            return {
                              ...item,
                              pageSlug: settingsSlug,
                              label: settingsTitle
                            };
                          })
                        )
                      );
                    }

                    const menuResult = await saveOrgHeaderMenuAction({
                      orgSlug,
                      action: {
                        type: "update-item",
                        itemId: settingsMenuItemId,
                        isVisible: settingsMenuVisible
                      }
                    });

                    if (!menuResult.ok) {
                      toast({
                        title: "Page saved, but menu visibility failed",
                        description: menuResult.error,
                        variant: "destructive"
                      });
                      return;
                    }

                    applyServerMenuState(menuResult.pages, menuResult.navItems);
                    setSettingsDialogOpen(false);
                    return;
                  }

                  const result = await saveOrgHeaderMenuAction({
                    orgSlug,
                    action: {
                      type: "update-item",
                      itemId: settingsMenuItemId,
                      label: settingsMenuLabel,
                      isVisible: settingsMenuVisible
                    }
                  });

                  if (!result.ok) {
                    toast({
                      title: "Unable to save menu item",
                      description: result.error,
                      variant: "destructive"
                    });
                    return;
                  }

                  applyServerMenuState(result.pages, result.navItems);
                  setSettingsDialogOpen(false);
                });
              }}
              size="sm"
            >
              Save
            </Button>
          </>
        }
        onClose={() => {
          setSettingsDialogOpen(false);
        }}
        open={settingsDialogOpen}
        size="md"
        title={settingsPageId ? "Page settings" : "Menu item settings"}
      >
        <div className="space-y-3">
          {settingsPageId ? (
            <>
              <Input onChange={(event) => setSettingsTitle(event.target.value)} placeholder="Page title" value={settingsTitle} />
              <Input
                disabled={selectedSettingsPage?.slug === "home"}
                onChange={(event) => setSettingsSlug(event.target.value)}
                placeholder="URL slug"
                value={settingsSlug}
              />
              <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
                <Checkbox
                  checked={settingsPublished}
                  disabled={selectedSettingsPage?.slug === "home"}
                  onChange={(event) => {
                    setSettingsPublished(event.target.checked);
                  }}
                />
                Publish page
              </label>
              <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
                <Checkbox
                  checked={settingsMenuVisible}
                  onChange={(event) => {
                    setSettingsMenuVisible(event.target.checked);
                  }}
                />
                Visible in menu
              </label>
              {selectedSettingsPage?.slug === "home" ? <p className="text-xs text-text-muted">Home always uses /.</p> : null}
            </>
          ) : (
            <>
              <Input onChange={(event) => setSettingsMenuLabel(event.target.value)} placeholder="Menu label" value={settingsMenuLabel} />
              <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
                <Checkbox
                  checked={settingsMenuVisible}
                  onChange={(event) => {
                    setSettingsMenuVisible(event.target.checked);
                  }}
                />
                Visible in menu
              </label>
            </>
          )}
        </div>
      </EditorSettingsDialog>
    </div>
  );
}
