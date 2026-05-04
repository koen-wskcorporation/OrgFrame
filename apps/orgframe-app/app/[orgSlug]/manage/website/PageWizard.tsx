"use client";

import * as React from "react";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import {
  CreateWizard,
  type CreateWizardSubmitResult,
  type WizardStep
} from "@/src/shared/components/CreateWizard";
import { sanitizePageSlug } from "@/src/features/site/blocks/helpers";
import type { OrgManagePage, OrgSiteStructureItem } from "@/src/features/site/types";
import {
  createWebsitePageAction,
  updateWebsiteItemAction,
  type WebsiteManagerActionResult
} from "@/src/features/site/websiteManagerActions";

type WizardState = {
  title: string;
  slug: string;
  parentId: string;
  isPublished: boolean;
  showInMenu: boolean;
  seoTitle: string;
  metaDescription: string;
  ogImagePath: string;
};

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type CreateProps = {
  mode: "create";
  defaultParentId: string | null;
};

type EditProps = {
  mode: "edit";
  editingItem: OrgSiteStructureItem;
  editingPage: OrgManagePage | null;
};

type SharedProps = {
  open: boolean;
  onClose: () => void;
  onResult: (res: WebsiteManagerActionResult) => void;
  orgSlug: string;
  parentItems: OrgSiteStructureItem[];
};

type Props = SharedProps & (CreateProps | EditProps);

function getLinkedPageSlug(item: OrgSiteStructureItem): string | null {
  const slug = item.linkTargetJson?.pageSlug;
  return typeof slug === "string" ? slug : null;
}

function buildParentOptions(items: OrgSiteStructureItem[], excludeId?: string) {
  const byParent = new Map<string | null, OrgSiteStructureItem[]>();
  for (const item of items) {
    const list = byParent.get(item.parentId) ?? [];
    list.push(item);
    byParent.set(item.parentId, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => a.orderIndex - b.orderIndex || a.title.localeCompare(b.title));
  }
  const out: { value: string; label: string; disabled?: boolean }[] = [
    { value: "", label: "Top level (no parent)" }
  ];
  // Collect descendants of excludeId so we can disable them as parent options
  // (preventing self/cycle when editing).
  const blocked = new Set<string>();
  if (excludeId) {
    const stack = [excludeId];
    while (stack.length) {
      const id = stack.pop()!;
      blocked.add(id);
      for (const child of byParent.get(id) ?? []) stack.push(child.id);
    }
  }
  const walk = (parentId: string | null, depth: number) => {
    const list = byParent.get(parentId) ?? [];
    for (const item of list) {
      if (item.type === "dynamic") continue;
      const isHostable = item.type === "placeholder" || item.type === "page";
      const indent = "— ".repeat(depth);
      out.push({
        value: item.id,
        label: `${indent}${item.title}${item.type === "placeholder" ? " (dropdown)" : ""}`,
        disabled: !isHostable || blocked.has(item.id)
      });
      walk(item.id, depth + 1);
    }
  };
  walk(null, 0);
  return out;
}

export function PageWizard(props: Props) {
  const isEdit = props.mode === "edit";
  const editingItem = isEdit ? props.editingItem : null;
  const editingPage = isEdit ? props.editingPage : null;
  const linkedSlug = editingItem ? getLinkedPageSlug(editingItem) : null;

  const initialState: WizardState = React.useMemo(() => {
    if (isEdit && editingItem) {
      return {
        title: editingItem.title,
        slug: linkedSlug ?? "",
        parentId: editingItem.parentId ?? "",
        isPublished: editingItem.isPublished,
        showInMenu: editingItem.showInMenu,
        seoTitle: editingPage?.seoTitle ?? "",
        metaDescription: editingPage?.metaDescription ?? "",
        ogImagePath: editingPage?.ogImagePath ?? ""
      };
    }
    return {
      title: "",
      slug: "",
      parentId: !isEdit ? props.defaultParentId ?? "" : "",
      isPublished: true,
      showInMenu: true,
      seoTitle: "",
      metaDescription: "",
      ogImagePath: ""
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isEdit, editingItem?.id, editingPage?.id]);

  const parentOptions = React.useMemo(
    () => buildParentOptions(props.parentItems, editingItem?.id),
    [props.parentItems, editingItem?.id]
  );

  const slugLocked = isEdit && linkedSlug === "home";

  const steps: WizardStep<WizardState>[] = [
    {
      id: "identity",
      label: "Identity",
      description: isEdit ? "Update the title, URL, or location in the site tree." : "Name the page and pick where it lives in the site.",
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
              placeholder="e.g. About us"
              value={state.title}
            />
          </FormField>
          <FormField
            error={fieldErrors.slug}
            hint={slugLocked ? "The home page URL is fixed to /." : "Auto-generated from the title if blank."}
            label="URL slug"
          >
            <Input
              disabled={slugLocked}
              onChange={(event) => setField("slug", event.target.value)}
              onSlugAutoChange={(value) => setField("slug", value)}
              persistentPrefix={`/${props.orgSlug}/`}
              slugAutoEnabled={!isEdit}
              slugAutoSource={state.title}
              slugValidation={{
                kind: "page",
                orgSlug: props.orgSlug,
                currentSlug: linkedSlug ?? undefined
              }}
              value={state.slug}
            />
          </FormField>
          <FormField hint="Pick a parent page or dropdown to nest this page underneath." label="Parent">
            <Select
              onChange={(event) => setField("parentId", event.target.value)}
              options={parentOptions}
              value={state.parentId}
            />
          </FormField>
        </div>
      )
    },
    {
      id: "visibility",
      label: "Visibility",
      description: "Control whether this page is published and shown in navigation.",
      render: ({ state, setField }) => (
        <div className="space-y-4">
          <label className="flex items-start gap-2 text-sm">
            <input
              checked={state.isPublished}
              className="mt-0.5"
              onChange={(event) => setField("isPublished", event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="font-medium text-text">Published</span>
              <span className="block text-xs text-text-muted">
                When unchecked, the page is saved as a draft and won&apos;t render publicly.
              </span>
            </span>
          </label>
          <label className="flex items-start gap-2 text-sm">
            <input
              checked={state.showInMenu}
              className="mt-0.5"
              onChange={(event) => setField("showInMenu", event.target.checked)}
              type="checkbox"
            />
            <span>
              <span className="font-medium text-text">Show in navigation</span>
              <span className="block text-xs text-text-muted">
                Add this page to your site&apos;s top navigation. Hidden pages still render at their public URL.
              </span>
            </span>
          </label>
        </div>
      )
    },
    {
      id: "seo",
      label: "SEO",
      description: "Optional. Override the title and description used in browser tabs, search results, and link previews.",
      render: ({ state, setField }) => (
        <div className="space-y-4">
          <FormField hint="Defaults to the page title if left blank." label="SEO title">
            <Input
              maxLength={120}
              onChange={(event) => setField("seoTitle", event.target.value)}
              placeholder={state.title}
              value={state.seoTitle}
            />
          </FormField>
          <FormField
            hint="Shown under the title in Google results. Aim for 150–160 characters."
            label="Meta description"
          >
            <Textarea
              maxLength={320}
              onChange={(event) => setField("metaDescription", event.target.value)}
              rows={3}
              value={state.metaDescription}
            />
          </FormField>
          <FormField
            hint="Path to a share image stored in org assets. 1200×630 works best."
            label="Share image path"
          >
            <Input
              onChange={(event) => setField("ogImagePath", event.target.value)}
              value={state.ogImagePath}
            />
          </FormField>
        </div>
      )
    }
  ];

  const handleSubmit = async (state: WizardState): Promise<CreateWizardSubmitResult> => {
    const slug = slugLocked ? "home" : sanitizePageSlug(state.slug.trim() || state.title);

    if (isEdit && editingItem) {
      // Edit flow: send a single combined patch.
      const patch: Parameters<typeof updateWebsiteItemAction>[0]["patch"] = {
        title: state.title.trim(),
        isPublished: state.isPublished,
        showInMenu: state.showInMenu,
        seoTitle: state.seoTitle.trim() || null,
        metaDescription: state.metaDescription.trim() || null,
        ogImagePath: state.ogImagePath.trim() || null
      };
      if (!slugLocked && slug !== linkedSlug) {
        patch.slug = slug;
      }
      const res = await updateWebsiteItemAction({
        orgSlug: props.orgSlug,
        itemId: editingItem.id,
        patch
      });
      props.onResult(res);
      // Reparenting isn't part of updateWebsiteItemAction yet — surface a soft
      // hint if the user changed the parent dropdown so we don't silently drop it.
      if (res.ok && (state.parentId || "") !== (editingItem.parentId ?? "")) {
        return {
          ok: false,
          message: "Use the indent / outdent buttons in the tree to change a page's parent.",
          stepId: "identity"
        };
      }
      return res.ok ? { ok: true } : { ok: false, message: res.error, stepId: "identity" };
    }

    // Create flow.
    const result = await createWebsitePageAction({
      orgSlug: props.orgSlug,
      parentId: state.parentId || null,
      title: state.title.trim(),
      slug,
      isPublished: state.isPublished,
      showInMenu: state.showInMenu
    });
    if (!result.ok) {
      return { ok: false, message: result.error, stepId: "identity" };
    }

    const hasSeo =
      state.seoTitle.trim().length > 0 ||
      state.metaDescription.trim().length > 0 ||
      state.ogImagePath.trim().length > 0;
    if (hasSeo) {
      const created = result.snapshot.items.find(
        (item) =>
          item.parentId === (state.parentId || null) &&
          item.type === "page" &&
          typeof item.linkTargetJson?.pageSlug === "string" &&
          item.linkTargetJson.pageSlug === slug
      );
      if (created) {
        const seoResult = await updateWebsiteItemAction({
          orgSlug: props.orgSlug,
          itemId: created.id,
          patch: {
            seoTitle: state.seoTitle.trim() || null,
            metaDescription: state.metaDescription.trim() || null,
            ogImagePath: state.ogImagePath.trim() || null
          }
        });
        props.onResult(seoResult);
        return seoResult.ok ? { ok: true } : { ok: false, message: seoResult.error, stepId: "seo" };
      }
    }

    props.onResult(result);
    return { ok: true };
  };

  return (
    <CreateWizard
      draftId={isEdit ? undefined : `website-page-create.${props.orgSlug}`}
      hideCancel={isEdit}
      initialState={initialState}
      mode={isEdit ? "edit" : "create"}
      onClose={props.onClose}
      onSubmit={handleSubmit}
      open={props.open}
      steps={steps}
      submitLabel={isEdit ? "Save" : "Create page"}
      subtitle={
        isEdit
          ? "Update title, URL, visibility, and SEO. Move to a different parent with the indent buttons in the tree."
          : "Step through the basics, then drop in blocks with the visual editor."
      }
      title={isEdit ? `Edit "${editingItem?.title ?? "page"}"` : "New page"}
    />
  );
}
