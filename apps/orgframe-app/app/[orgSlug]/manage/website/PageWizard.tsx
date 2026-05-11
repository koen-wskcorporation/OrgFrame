"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { Chip } from "@orgframe/ui/primitives/chip";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { SelectionBox } from "@orgframe/ui/primitives/selection-box";
import {
  CreateWizard,
  type CreateWizardSubmitResult,
  type WizardStep
} from "@/src/shared/components/CreateWizard";
import { sanitizePageSlug } from "@/src/features/site/blocks/helpers";
import { DYNAMIC_PAGE_PRESETS } from "@/src/features/site/dynamicPagePresets";
import type { OrgManagePage, OrgSiteStructureItem } from "@/src/features/site/types";
import {
  createWebsiteDropdownAction,
  createWebsiteDynamicPageAction,
  createWebsiteExternalLinkAction,
  createWebsitePageAction,
  updateWebsiteItemAction,
  type WebsiteManagerActionResult
} from "@/src/features/site/websiteManagerActions";
import { TypePicker, type ItemType } from "./TypePicker";

export type { ItemType };

// One unified state shape covers all four item types. Fields that don't apply
// to the current `itemType` are simply ignored at submit time. SEO fields have
// been removed for now — they can be re-added later as a separate step.
//
// `showInMenu` no longer lives in state: the data model couples it to
// `isPublished`, and the user only ever toggles published status. Anywhere
// the action layer needs `show_in_menu`, it derives it from `isPublished`.
type CreateState = {
  itemType: ItemType;
  title: string;
  slug: string; // page only
  url: string; // link only
  openInNewTab: boolean; // link only
  isPublished: boolean;
  /** Selected predefined dynamic page (only used when itemType === "dynamic"). */
  dynamicPresetKey: string | null;
};

type EditState = {
  title: string;
  slug: string;
  isPublished: boolean;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// ─── Prop types ───────────────────────────────────────────────────────────────

type CreateProps = {
  mode: "create";
  defaultParentId: string | null;
  /** Pre-selects a type on the first step. Pass null to default to "page". */
  defaultType: ItemType | null;
};

type EditProps = {
  mode: "edit";
  editingItem: OrgSiteStructureItem;
  editingPage: OrgManagePage | null;
  /** Wired to a "Delete page" button rendered in the wizard's Visibility step. */
  onDelete?: () => void | Promise<void>;
};

type SharedProps = {
  open: boolean;
  onClose: () => void;
  onResult: (res: WebsiteManagerActionResult) => void;
  orgSlug: string;
  /**
   * Public host of the org (custom domain or `<slug>.<platform>`). Used as the
   * URL preview prefix in the slug input.
   */
  displayHost: string;
  parentItems: OrgSiteStructureItem[];
};

export type Props = SharedProps & (CreateProps | EditProps);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getLinkedPageSlug(item: OrgSiteStructureItem): string | null {
  const slug = item.linkTargetJson?.pageSlug;
  return typeof slug === "string" ? slug : null;
}

/**
 * Walk up the parent chain and collect slug segments (root-first order). Used
 * for the URL preview prefix. Skips dynamic items (which generate their own
 * paths at render time) and ignores any segment without a slug.
 */
function buildParentPath(items: OrgSiteStructureItem[], parentId: string | null): string[] {
  if (!parentId) return [];
  const byId = new Map(items.map((i) => [i.id, i]));
  const path: string[] = [];
  let current = byId.get(parentId);
  while (current) {
    if (current.type !== "dynamic" && current.slug) {
      path.unshift(current.slug);
    }
    if (!current.parentId) break;
    current = byId.get(current.parentId);
  }
  return path;
}

function buildPrefix(_displayHost: string, parentPath: string[]) {
  const segments = parentPath.filter(Boolean);
  return `/${segments.length > 0 ? `${segments.join("/")}/` : ""}`;
}

// ─── Status-chip toggle ──────────────────────────────────────────────────────

const PUBLISH_OPTIONS = [
  { value: "published", label: "Published", color: "emerald" as const },
  { value: "unpublished", label: "Unpublished", color: "slate" as const }
];

function PublishStatusChip({
  disabled,
  isPublished,
  onChange
}: {
  disabled?: boolean;
  isPublished: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <Chip
      status
      picker={{
        disabled,
        onChange: (value) => onChange(value === "published"),
        options: PUBLISH_OPTIONS,
        value: isPublished ? "published" : "unpublished"
      }}
    />
  );
}

// ─── Create wizard ────────────────────────────────────────────────────────────

type CreateInnerProps = SharedProps & CreateProps;

function CreateItemWizard({
  defaultParentId,
  defaultType,
  displayHost,
  onClose,
  onResult,
  open,
  orgSlug,
  parentItems
}: CreateInnerProps) {
  // Parent is fixed by where the user opened the wizard — there's no in-wizard
  // selector. Resolve once per open.
  const parentPath = React.useMemo(
    () => buildParentPath(parentItems, defaultParentId),
    [parentItems, defaultParentId]
  );
  const slugPrefix = React.useMemo(() => buildPrefix(displayHost, parentPath), [displayHost, parentPath]);

  const initialState: CreateState = React.useMemo(
    () => ({
      itemType: defaultType ?? "page",
      title: "",
      slug: "",
      url: "",
      openInNewTab: true,
      isPublished: true,
      dynamicPresetKey: null
    }),
    // Reset whenever the dialog opens (so re-opening gives a clean form).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, defaultType, defaultParentId]
  );

  // A preset's slug is reserved AND single-instance: once a Programs page
  // exists, the Programs preset shouldn't be offered again. Hide any preset
  // whose target slug is already used by an existing structure item or by
  // its linked page.
  const usedDynamicPresetKeys = React.useMemo(() => {
    const used = new Set<string>();
    for (const preset of DYNAMIC_PAGE_PRESETS) {
      const slugInUse = parentItems.some((item) => {
        if (item.slug === preset.slug) return true;
        const linked = item.linkTargetJson?.pageSlug;
        return typeof linked === "string" && linked === preset.slug;
      });
      if (slugInUse) used.add(preset.key);
    }
    return used;
  }, [parentItems]);

  const availableDynamicPresets = React.useMemo(
    () => DYNAMIC_PAGE_PRESETS.filter((p) => !usedDynamicPresetKeys.has(p.key)),
    [usedDynamicPresetKeys]
  );

  const steps: WizardStep<CreateState>[] = [
    {
      id: "type",
      label: "Type",
      description: "Choose what you want to add to your website.",
      render: ({ state, setField }) => (
        <TypePicker onChange={(type) => setField("itemType", type)} value={state.itemType} />
      )
    },
    {
      // Dynamic-only step: pick which predefined dynamic page to add. Skipped
      // entirely for static pages, dropdowns, and external links.
      id: "preset",
      label: "Pick page",
      description: "Pick a predefined dynamic page to add.",
      skipWhen: (state) => state.itemType !== "dynamic",
      validate: (state) => {
        if (state.itemType !== "dynamic") return null;
        if (!state.dynamicPresetKey) {
          return { dynamicPresetKey: "Pick which dynamic page to add." };
        }
        return null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-3">
          {availableDynamicPresets.length === 0 ? (
            <div className="rounded-control border bg-surface px-4 py-6 text-center text-sm text-text-muted">
              You&apos;ve already added every dynamic page. Pick a different type, or
              edit the existing one from the list.
            </div>
          ) : (
            <div className="grid gap-2" role="radiogroup">
              {availableDynamicPresets.map((preset) => (
                <SelectionBox
                  description={preset.description}
                  key={preset.key}
                  label={preset.title}
                  onSelectedChange={(next) => {
                    if (next) setField("dynamicPresetKey", preset.key);
                  }}
                  selected={state.dynamicPresetKey === preset.key}
                />
              ))}
            </div>
          )}
          {fieldErrors.dynamicPresetKey ? (
            <div className="text-xs text-destructive">{fieldErrors.dynamicPresetKey}</div>
          ) : null}
        </div>
      )
    },
    {
      id: "details",
      label: "Details",
      description: "Title and destination.",
      // Dynamic pages get their title/slug from the preset itself, so the
      // details step is irrelevant for them.
      skipWhen: (state) => state.itemType === "dynamic",
      validate: (state) => {
        if (state.itemType === "dynamic") return null;
        const errors: Record<string, string> = {};
        if (state.title.trim().length < 1) {
          errors.title = "A title is required.";
        }
        if (state.itemType === "page") {
          if (state.title.trim().length < 2) {
            errors.title = "Page title must be at least 2 characters.";
          }
          const slug = sanitizePageSlug(state.slug.trim() || state.title);
          if (!slug) {
            errors.slug = "A slug is required.";
          } else if (slug.length < 1 || slug.length > 60 || !SLUG_PATTERN.test(slug)) {
            errors.slug = "Use 1-60 lowercase letters, numbers, and hyphens.";
          }
        }
        if (state.itemType === "link" && !state.url.trim()) {
          errors.url = "A URL is required.";
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField error={fieldErrors.title} label="Title">
            <Input
              autoFocus
              onChange={(event) => setField("title", event.target.value)}
              placeholder={
                state.itemType === "page"
                  ? "e.g. About us"
                  : state.itemType === "dropdown"
                    ? "e.g. Resources"
                    : "e.g. Documentation"
              }
              value={state.title}
            />
          </FormField>
          {state.itemType === "page" ? (
            <FormField
              error={fieldErrors.slug}
              hint="Auto-generated from the title if blank."
              label="URL"
            >
              <Input
                onChange={(event) => setField("slug", event.target.value)}
                onSlugAutoChange={(value) => setField("slug", value)}
                persistentPrefix={slugPrefix}
                slugAutoEnabled
                slugAutoSource={state.title}
                slugValidation={{ kind: "page", orgSlug }}
                value={state.slug}
              />
            </FormField>
          ) : null}
          {state.itemType === "link" ? (
            <>
              <FormField error={fieldErrors.url} label="URL">
                <Input
                  onChange={(event) => setField("url", event.target.value)}
                  placeholder="https://example.com"
                  value={state.url}
                />
              </FormField>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={state.openInNewTab}
                  onCheckedChange={(checked) => setField("openInNewTab", checked)}
                />
                <span className="font-medium text-text">Open in new tab</span>
              </label>
            </>
          ) : null}
        </div>
      )
    },
    // Visibility step removed by convention — status now lives inline with the
    // wizard title (see `packages/ui/CLAUDE.md`). The header chip drives
    // state.isPublished and is rendered via `headerTitleAccessory` below.
  ];

  const handleSubmit = async (state: CreateState): Promise<CreateWizardSubmitResult> => {
    const parentId = defaultParentId;

    if (state.itemType === "dynamic") {
      if (!state.dynamicPresetKey) {
        return { ok: false, message: "Pick which dynamic page to add.", stepId: "preset" };
      }
      const res = await createWebsiteDynamicPageAction({
        orgSlug,
        parentId,
        presetKey: state.dynamicPresetKey,
        isPublished: state.isPublished
      });
      onResult(res);
      return res.ok ? { ok: true } : { ok: false, message: res.error, stepId: "preset" };
    }

    if (state.itemType === "dropdown") {
      const res = await createWebsiteDropdownAction({
        orgSlug,
        parentId,
        title: state.title.trim()
      });
      onResult(res);
      return res.ok ? { ok: true } : { ok: false, message: res.error, stepId: "details" };
    }

    if (state.itemType === "link") {
      const res = await createWebsiteExternalLinkAction({
        orgSlug,
        parentId,
        title: state.title.trim(),
        url: state.url.trim(),
        openInNewTab: state.openInNewTab
      });
      onResult(res);
      return res.ok ? { ok: true } : { ok: false, message: res.error, stepId: "details" };
    }

    // page
    const slug = sanitizePageSlug(state.slug.trim() || state.title);
    const result = await createWebsitePageAction({
      orgSlug,
      parentId,
      title: state.title.trim(),
      slug,
      isPublished: state.isPublished
    });
    if (!result.ok) {
      return { ok: false, message: result.error, stepId: "details" };
    }
    onResult(result);
    return { ok: true };
  };

  return (
    <CreateWizard<CreateState>
      draftId={`website-create.${orgSlug}`}
      headerTitleAccessory={({ state, setField }) => {
        // Dropdowns / external links don't have a public surface to publish
        // to, so no status to control.
        if (state.itemType === "dropdown" || state.itemType === "link") return null;
        return (
          <PublishStatusChip
            isPublished={state.isPublished}
            onChange={(next) => setField("isPublished", next)}
          />
        );
      }}
      initialState={initialState}
      mode="create"
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel="Create"
      subtitle="Pick a type, fill in the details, then add it to your site."
      title="New item"
    />
  );
}

// ─── Edit wizard (page only) ──────────────────────────────────────────────────

type EditInnerProps = SharedProps & EditProps;

function EditPageWizard({
  displayHost,
  editingItem,
  onClose,
  onDelete,
  onResult,
  open,
  orgSlug,
  parentItems
}: EditInnerProps) {
  const linkedSlug = getLinkedPageSlug(editingItem);
  const slugLocked = linkedSlug === "home";

  const parentPath = React.useMemo(
    () => buildParentPath(parentItems, editingItem.parentId),
    [parentItems, editingItem.parentId]
  );
  const slugPrefix = React.useMemo(() => buildPrefix(displayHost, parentPath), [displayHost, parentPath]);

  const initialState: EditState = React.useMemo(
    () => ({
      title: editingItem.title,
      slug: linkedSlug ?? "",
      isPublished: editingItem.isPublished
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [editingItem.id]
  );

  const steps: WizardStep<EditState>[] = [
    {
      id: "identity",
      label: "Identity",
      description: "Update the title or URL.",
      validate: (state) => {
        const errors: Record<string, string> = {};
        if (state.title.trim().length < 2) {
          errors.title = "Page title must be at least 2 characters.";
        }
        const slug = sanitizePageSlug(state.slug.trim() || state.title);
        if (!slug) {
          errors.slug = "A slug is required.";
        } else if (slug.length < 1 || slug.length > 60 || !SLUG_PATTERN.test(slug)) {
          errors.slug = "Use 1-60 lowercase letters, numbers, and hyphens.";
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => (
        <div className="space-y-4">
          <FormField error={fieldErrors.title} label="Title">
            <Input
              autoFocus
              onChange={(event) => setField("title", event.target.value)}
              value={state.title}
            />
          </FormField>
          <FormField
            error={fieldErrors.slug}
            hint={slugLocked ? "The home page URL is fixed." : "The public URL path."}
            label="URL"
          >
            <Input
              disabled={slugLocked}
              onChange={(event) => setField("slug", event.target.value)}
              persistentPrefix={slugPrefix}
              slugValidation={{ kind: "page", orgSlug, currentSlug: linkedSlug ?? undefined }}
              value={state.slug}
            />
          </FormField>
        </div>
      )
    },
    // Status moved to the header chip (see `headerTitleAccessory` below) —
    // no separate visibility step. What's left is the danger-zone Delete
    // button, which lives as its own step so it doesn't clutter Identity.
    {
      id: "danger",
      label: "Danger zone",
      description: "Permanent actions for this page.",
      skipWhen: () => !onDelete || slugLocked,
      render: () => (
        <div className="space-y-2">
          <div className="text-sm font-medium text-text">Delete this page</div>
          <p className="text-xs text-text-muted">
            Removing this page deletes it permanently along with any blocks it contains.
          </p>
          <Button onClick={() => void onDelete?.()} size="sm" variant="danger">
            <Trash2 className="h-4 w-4" />
            Delete page
          </Button>
        </div>
      )
    }
  ];

  const handleSubmit = async (state: EditState): Promise<CreateWizardSubmitResult> => {
    const slug = slugLocked ? "home" : sanitizePageSlug(state.slug.trim() || state.title);
    const patch: Parameters<typeof updateWebsiteItemAction>[0]["patch"] = {
      title: state.title.trim(),
      // Home is always published; force-true so a stale wizard state can't
      // smuggle false through. Show-in-menu is no longer a separate field —
      // the action couples it to isPublished server-side.
      isPublished: slugLocked ? true : state.isPublished
    };
    if (!slugLocked && slug !== linkedSlug) {
      patch.slug = slug;
    }
    const res = await updateWebsiteItemAction({ orgSlug, itemId: editingItem.id, patch });
    onResult(res);
    return res.ok ? { ok: true } : { ok: false, message: res.error, stepId: "identity" };
  };

  return (
    <CreateWizard<EditState>
      hideCancel
      headerTitleAccessory={({ state, setField }) => (
        <PublishStatusChip
          disabled={slugLocked}
          isPublished={state.isPublished}
          onChange={(next) => setField("isPublished", next)}
        />
      )}
      initialState={initialState}
      mode="edit"
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel="Save"
      subtitle="Update title or URL."
      title={`Edit "${editingItem.title}"`}
    />
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export function PageWizard(props: Props) {
  if (props.mode === "edit") {
    return (
      <EditPageWizard
        displayHost={props.displayHost}
        editingItem={props.editingItem}
        editingPage={props.editingPage}
        mode="edit"
        onClose={props.onClose}
        onDelete={props.onDelete}
        onResult={props.onResult}
        open={props.open}
        orgSlug={props.orgSlug}
        parentItems={props.parentItems}
      />
    );
  }
  return (
    <CreateItemWizard
      defaultParentId={props.defaultParentId}
      defaultType={props.defaultType}
      displayHost={props.displayHost}
      mode="create"
      onClose={props.onClose}
      onResult={props.onResult}
      open={props.open}
      orgSlug={props.orgSlug}
      parentItems={props.parentItems}
    />
  );
}
