"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import {
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  ChevronDown,
  CreditCard,
  FileText,
  Globe,
  GripVertical,
  LayoutDashboard,
  MapPinned,
  Palette,
  Pencil,
  Plus,
  Settings,
  SlidersHorizontal,
  Users,
  type LucideIcon
} from "lucide-react";
import { SortableCanvas, type SortableRenderMeta } from "@/components/editor/SortableCanvas";
import { EditorSettingsDialog } from "@/components/shared/EditorSettingsDialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { IconButton } from "@/components/ui/icon-button";
import { Input } from "@/components/ui/input";
import { NavItem } from "@/components/ui/nav-item";
import { PublishStatusIcon } from "@/components/ui/publish-status-icon";
import { useToast } from "@/components/ui/toast";
import type { OrgFeatures } from "@/lib/org/features";
import { getOrgWorkspaceNavItems, type OrgWorkspaceNavIcon } from "@/lib/org/workspaceNav";
import { cn } from "@/lib/utils";
import { AiAssistantLauncher } from "@/modules/ai/components/AiAssistantLauncher";
import { saveOrgPagesAction, savePageSettingsAction } from "@/modules/site-builder/actions";
import {
  ORG_SITE_EDITOR_STATE_EVENT,
  ORG_SITE_OPEN_EDITOR_EVENT,
  ORG_SITE_OPEN_EDITOR_REQUEST_KEY,
  ORG_SITE_SET_EDITOR_EVENT
} from "@/modules/site-builder/events";
import type { OrgManagePage } from "@/modules/site-builder/types";
import { ProgramHeaderBar } from "@/components/shared/ProgramHeaderBar";

type OrgHeaderProps = {
  orgSlug: string;
  orgName: string;
  orgLogoUrl?: string | null;
  governingBodyLogoUrl?: string | null;
  governingBodyName?: string | null;
  canManageOrg: boolean;
  canEditPages: boolean;
  showAiAssistant: boolean;
  canActWithAi: boolean;
  pages: OrgManagePage[];
  features: OrgFeatures;
};

const toolsNavIconMap: Record<OrgWorkspaceNavIcon, LucideIcon> = {
  briefcase: BriefcaseBusiness,
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
  sliders: SlidersHorizontal
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

  return !pathname.startsWith(`${orgBasePath}/workspace`) && !pathname.startsWith(`${orgBasePath}/icon`);
}

function sortedPages(pages: OrgManagePage[]) {
  return [...pages].sort((a, b) => a.sortIndex - b.sortIndex || a.createdAt.localeCompare(b.createdAt));
}

function withReindexedSortOrder(pages: OrgManagePage[]) {
  return pages.map((page, index) => ({
    ...page,
    sortIndex: index
  }));
}

function EditableMenuItem({
  page,
  orgSlug,
  isSaving,
  onToggleVisibility,
  onOpenSettings,
  onOpenEditor,
  meta
}: {
  page: OrgManagePage;
  orgSlug: string;
  isSaving: boolean;
  onToggleVisibility: (page: OrgManagePage) => void;
  onOpenSettings: (page: OrgManagePage) => void;
  onOpenEditor: (href: string) => void;
  meta: SortableRenderMeta;
}) {
  const href = pageHref(orgSlug, page.slug);

  return (
    <div
      className={cn(
        "inline-flex h-10 w-fit max-w-[min(42vw,360px)] items-center gap-2 rounded-control border bg-surface px-2 transition-[width] duration-200",
        meta.isDragging ? "shadow-card" : "shadow-none"
      )}
    >
      <IconButton
        icon={<GripVertical />}
        label={`Drag ${page.title}`}
        disabled={isSaving}
        type="button"
        {...meta.handleProps.attributes}
        {...meta.handleProps.listeners}
      />

      <div className="min-w-0">
        <div className="flex items-center gap-1.5 truncate text-sm font-semibold leading-none text-text">
          <PublishStatusIcon
            align="right"
            className="shrink-0"
            disabled={isSaving || page.slug === "home"}
            isLoading={isSaving}
            isPublished={page.isPublished}
            onToggle={() => onToggleVisibility(page)}
            publishLabel="Show in menu"
            size="compact"
            statusLabel={page.isPublished ? `Published status for ${page.title}` : `Hidden status for ${page.title}`}
            unpublishLabel="Hide from menu"
          />
          <span className="max-w-[20ch] truncate">{page.title}</span>
        </div>
      </div>

      <IconButton
        icon={<SlidersHorizontal />}
        label="Page settings"
        disabled={isSaving}
        onClick={() => onOpenSettings(page)}
        title="Page settings"
      />

      <IconButton
        icon={<Pencil />}
        label="Edit page"
        disabled={isSaving}
        onClick={() => onOpenEditor(href)}
        title="Edit page"
      />
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
  showAiAssistant,
  canActWithAi,
  pages,
  features
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

  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createSlug, setCreateSlug] = useState("");
  const [createPublished, setCreatePublished] = useState(true);

  const [settingsPageId, setSettingsPageId] = useState<string | null>(null);
  const [settingsTitle, setSettingsTitle] = useState("");
  const [settingsSlug, setSettingsSlug] = useState("");
  const [settingsPublished, setSettingsPublished] = useState(true);
  const [settingsDialogOpen, setSettingsDialogOpen] = useState(false);
  const [isPageContentEditing, setIsPageContentEditing] = useState(false);

  const [isSavingMenu, startSavingMenu] = useTransition();

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  const toolsNavItems = useMemo(() => getOrgWorkspaceNavItems(orgSlug, features), [features, orgSlug]);
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

  const orderedPages = useMemo(() => sortedPages(menuPages), [menuPages]);
  const navPages = useMemo(() => orderedPages.filter((page) => page.isPublished), [orderedPages]);
  const selectedSettingsPage = useMemo(() => {
    if (!settingsPageId) {
      return null;
    }

    return orderedPages.find((page) => page.id === settingsPageId) ?? null;
  }, [orderedPages, settingsPageId]);

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
    (page: OrgManagePage) => {
      const nextPublished = !page.isPublished;

      setMenuPages((current) =>
        current.map((currentPage) => {
          if (currentPage.id !== page.id) {
            return currentPage;
          }

          return {
            ...currentPage,
            isPublished: nextPublished
          };
        })
      );

      startSavingMenu(async () => {
        const result = await saveOrgPagesAction({
          orgSlug,
          action: {
            type: "set-published",
            pageId: page.id,
            isPublished: nextPublished
          }
        });

        if (!result.ok) {
          setMenuPages((current) =>
            current.map((currentPage) => {
              if (currentPage.id !== page.id) {
                return currentPage;
              }

              return {
                ...currentPage,
                isPublished: page.isPublished
              };
            })
          );

          toast({
            title: "Unable to update visibility",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        setMenuPages(sortedPages(result.pages));
      });
    },
    [orgSlug, toast]
  );

  const onReorderPages = useCallback(
    (nextPages: OrgManagePage[]) => {
      const previous = menuPages;
      const reindexed = withReindexedSortOrder(nextPages);

      setMenuPages(reindexed);

      startSavingMenu(async () => {
        const result = await saveOrgPagesAction({
          orgSlug,
          action: {
            type: "reorder",
            pageIds: reindexed.map((page) => page.id)
          }
        });

        if (!result.ok) {
          setMenuPages(previous);
          toast({
            title: "Unable to reorder menu",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        setMenuPages(sortedPages(result.pages));
      });
    },
    [menuPages, orgSlug, toast]
  );

  const onOpenSettings = useCallback((page: OrgManagePage) => {
    setSettingsPageId(page.id);
    setSettingsTitle(page.title);
    setSettingsSlug(page.slug);
    setSettingsPublished(page.isPublished);
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
                  // eslint-disable-next-line @next/next/no-img-element
                  <img alt={`${orgName} logo`} className="block h-full w-auto max-w-full align-middle object-contain object-left" src={orgLogoUrl} />
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
                {navPages.map((page) => {
                  const href = pageHref(orgSlug, page.slug);
                  return (
                    <NavItem active={hasHydrated ? isActivePath(currentPathname, href) : false} href={href} key={page.id} variant="header">
                      {page.title}
                    </NavItem>
                  );
                })}
              </div>
            ) : (
              <div className="flex min-w-0 items-center justify-end gap-2 overflow-x-auto">
                <SortableCanvas
                  className="flex min-w-0 items-center justify-end gap-2"
                  getId={(page) => page.id}
                  items={orderedPages}
                  onReorder={onReorderPages}
                  renderItem={(page, meta) => (
                    <EditableMenuItem
                      isSaving={isSavingMenu}
                      meta={meta}
                      onOpenEditor={(href) => {
                        setIsMenuEditMode(false);
                        openEditorOnPath(href);
                      }}
                      onOpenSettings={onOpenSettings}
                      onToggleVisibility={onToggleVisibility}
                      orgSlug={orgSlug}
                      page={page}
                    />
                  )}
                  sortingStrategy="horizontal"
                />
                <IconButton
                  icon={<Plus className="h-4 w-4" />}
                  label="Add page"
                  onClick={() => {
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
                  aria-label="Open workspace menu"
                  onClick={() => setIsToolsMenuOpen((current) => !current)}
                  size="md"
                  type="button"
                >
                  <BriefcaseBusiness className="h-4 w-4" />
                  Workspace
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
                  const result = await saveOrgPagesAction({
                    orgSlug,
                    action: {
                      type: "create",
                      title: createTitle,
                      slug: createSlug.trim() ? createSlug : undefined,
                      isPublished: createPublished
                    }
                  });

                  if (!result.ok) {
                    toast({
                      title: "Unable to create page",
                      description: result.error,
                      variant: "destructive"
                    });
                    return;
                  }

                  setMenuPages(sortedPages(result.pages));
                  setCreateTitle("");
                  setCreateSlug("");
                  setCreatePublished(true);
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
        title="Create page"
      >
        <div className="space-y-3">
          <Input onChange={(event) => setCreateTitle(event.target.value)} placeholder="Page title" value={createTitle} />
          <Input onChange={(event) => setCreateSlug(event.target.value)} placeholder="URL slug (optional)" value={createSlug} />
          <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm">
            <Checkbox
              checked={createPublished}
              onChange={(event) => {
                setCreatePublished(event.target.checked);
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
              disabled={isSavingMenu}
              loading={isSavingMenu}
              onClick={() => {
                if (!settingsPageId) {
                  return;
                }

                startSavingMenu(async () => {
                  const result = await savePageSettingsAction({
                    orgSlug,
                    pageId: settingsPageId,
                    title: settingsTitle,
                    pageSlug: settingsSlug,
                    isPublished: settingsPublished
                  });

                  if (!result.ok) {
                    toast({
                      title: "Unable to save page settings",
                      description: result.error,
                      variant: "destructive"
                    });
                    return;
                  }

                  setMenuPages(sortedPages(result.pages));
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
        title="Page settings"
      >
        <div className="space-y-3">
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
            Visible in menu
          </label>
          {selectedSettingsPage?.slug === "home" ? <p className="text-xs text-text-muted">Home always uses /.</p> : null}
        </div>
      </EditorSettingsDialog>
    </div>
  );
}
