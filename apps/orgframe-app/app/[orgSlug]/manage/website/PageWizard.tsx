"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { ChipPicker } from "@orgframe/ui/primitives/chip";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import {
  CreateWizard,
  type CreateWizardSubmitResult,
  type WizardStep
} from "@/src/shared/components/CreateWizard";
import { sanitizePageSlug } from "@/src/features/site/blocks/helpers";
import type { OrgManagePage, OrgSiteStructureItem } from "@/src/features/site/types";
import {
  createWebsiteDropdownAction,
  createWebsiteExternalLinkAction,
  createWebsitePageAction,
  updateWebsiteItemAction,
  type WebsiteManagerActionResult
} from "@/src/features/site/websiteManagerActions";
import { TypePicker, type ItemType } from "./TypePicker";

export type { ItemType };

// One unified state shape covers all three item types. Fields that don't apply
// to the current `itemType` are simply ignored at submit time. SEO fields have
// been removed for now — they can be re-added later as a separate step.
type CreateState = {
  itemType: ItemType;
  title: string;
  slug: string; // page only
  url: string; // link only
  openInNewTab: boolean; // link only
  isPublished: boolean;
  showInMenu: boolean;
};

type EditState = {
  title: string;
  slug: string;
  isPublished: boolean;
  showInMenu: boolean;
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

function buildPrefix(displayHost: string, parentPath: string[]) {
  const segments = parentPath.filter(Boolean);
  return `${displayHost}/${segments.length > 0 ? `${segments.join("/")}/` : ""}`;
}

// ─── Status-chip toggle ──────────────────────────────────────────────────────

const PUBLISH_OPTIONS = [
  { value: "published", label: "Published", color: "emerald" as const },
  { value: "unpublished", label: "Unpublished", color: "slate" as const }
];

function PublishStatusChip({
  isPublished,
  onChange
}: {
  isPublished: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <ChipPicker
      onChange={(value) => onChange(value === "published")}
      options={PUBLISH_OPTIONS}
      size="md"
      status
      value={isPublished ? "published" : "unpublished"}
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
      showInMenu: true
    }),
    // Reset whenever the dialog opens (so re-opening gives a clean form).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [open, defaultType, defaultParentId]
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
      id: "details",
      label: "Details",
      description: "Title and destination.",
      validate: (state) => {
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
    {
      id: "visibility",
      label: "Visibility",
      description: "Set the publish status and choose whether it appears in the navigation.",
      render: ({ state, setField }) => (
        <div className="space-y-5">
          {state.itemType === "page" ? (
            <div className="space-y-2">
              <div className="text-sm font-medium text-text">Status</div>
              <PublishStatusChip
                isPublished={state.isPublished}
                onChange={(next) => setField("isPublished", next)}
              />
              <p className="text-xs text-text-muted">
                Unpublished items are saved but won&apos;t render publicly. Click the chip to change.
              </p>
            </div>
          ) : null}
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={state.showInMenu}
              className="mt-0.5"
              onCheckedChange={(checked) => setField("showInMenu", checked)}
            />
            <span>
              <span className="font-medium text-text">Show in navigation</span>
              <span className="block text-xs text-text-muted">
                Add this to your site&apos;s top navigation. Hidden items are still reachable by URL.
              </span>
            </span>
          </label>
        </div>
      )
    }
  ];

  const handleSubmit = async (state: CreateState): Promise<CreateWizardSubmitResult> => {
    const parentId = defaultParentId;

    if (state.itemType === "dropdown") {
      const res = await createWebsiteDropdownAction({
        orgSlug,
        parentId,
        title: state.title.trim(),
        showInMenu: state.showInMenu
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
        openInNewTab: state.openInNewTab,
        showInMenu: state.showInMenu
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
      isPublished: state.isPublished,
      showInMenu: state.showInMenu
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
      isPublished: editingItem.isPublished,
      showInMenu: editingItem.showInMenu
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
    {
      id: "visibility",
      label: "Visibility",
      description: "Set the publish status and choose whether it appears in the navigation.",
      render: ({ state, setField }) => (
        <div className="space-y-5">
          <div className="space-y-2">
            <div className="text-sm font-medium text-text">Status</div>
            <PublishStatusChip
              isPublished={state.isPublished}
              onChange={(next) => setField("isPublished", next)}
            />
            <p className="text-xs text-text-muted">
              Unpublished items are saved but won&apos;t render publicly. Click the chip to change.
            </p>
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={state.showInMenu}
              className="mt-0.5"
              onCheckedChange={(checked) => setField("showInMenu", checked)}
            />
            <span>
              <span className="font-medium text-text">Show in navigation</span>
              <span className="block text-xs text-text-muted">
                Add this page to your site&apos;s top navigation.
              </span>
            </span>
          </label>
          {onDelete ? (
            <div className="space-y-2 border-t border-border pt-4">
              <div className="text-sm font-medium text-text">Danger zone</div>
              <p className="text-xs text-text-muted">
                Removing this page deletes it permanently along with any blocks it contains.
              </p>
              <Button onClick={() => void onDelete()} size="sm" variant="danger">
                <Trash2 className="h-4 w-4" />
                Delete page
              </Button>
            </div>
          ) : null}
        </div>
      )
    }
  ];

  const handleSubmit = async (state: EditState): Promise<CreateWizardSubmitResult> => {
    const slug = slugLocked ? "home" : sanitizePageSlug(state.slug.trim() || state.title);
    const patch: Parameters<typeof updateWebsiteItemAction>[0]["patch"] = {
      title: state.title.trim(),
      isPublished: state.isPublished,
      showInMenu: state.showInMenu
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
      initialState={initialState}
      mode="edit"
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel="Save"
      subtitle="Update title, URL, and visibility."
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
