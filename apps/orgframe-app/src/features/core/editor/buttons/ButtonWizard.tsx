"use client";

import * as React from "react";
import { Trash2 } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button, buttonVariants } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select, type SelectOption } from "@orgframe/ui/primitives/select";
import { cn } from "@orgframe/ui/primitives/utils";
import {
  CreateWizard,
  type CreateWizardSubmitResult,
  type WizardStep
} from "@/src/shared/components/CreateWizard";
import { buttonVariantOptions, type ButtonConfig } from "@/src/features/core/editor/buttons/types";
import { useOrgLinkPickerPages } from "@/src/features/site/hooks/useOrgLinkPickerPages";
import { describeButtonHref, isExternalHref } from "@/src/shared/links";

type ButtonWizardProps = {
  open: boolean;
  mode: "create" | "edit";
  initialValue: ButtonConfig;
  onClose: () => void;
  onSave: (next: ButtonConfig) => void;
  /** Only meaningful in edit mode. Shown as a danger-zone Delete in the Style step. */
  onDelete?: () => void;
  orgSlug?: string;
  availableInternalLinks?: Array<{ label: string; value: string }>;
};

type WizardState = ButtonConfig;

function normalizeInternalPath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "/";
  if (trimmed === "/") return "/";
  return `/${trimmed.replace(/^\/+/, "")}`;
}

function normalizeForSubmit(state: ButtonConfig): ButtonConfig {
  const label = state.label.trim();
  const href = state.href.trim();
  return {
    ...state,
    label,
    href: isExternalHref(href) ? href : normalizeInternalPath(href)
  };
}

/**
 * Heuristic: does the user-typed query plausibly *look* like a link the
 * user wants to use directly, rather than a search filter? Triggers a
 * synthetic URL option in the dropdown. Permissive on purpose — false
 * positives still require an explicit click on the synthesized row to
 * commit.
 */
function looksLikeUrlQuery(raw: string): boolean {
  const q = raw.trim();
  if (q.length === 0) return false;
  if (q.includes("://")) return true; // http://, https://, mailto:, etc.
  if (q.startsWith("/")) return true; // bare path
  if (q.startsWith("mailto:") || q.startsWith("tel:")) return true;
  // Bare domain-ish: "example.com", "site.io/foo"
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(q)) return true;
  return false;
}

/**
 * For user-typed external links, auto-prefix `https://` when the input is
 * a bare domain (e.g. "example.com" → "https://example.com"). Leaves
 * absolute paths, scheme-bearing URLs (http://, mailto:, tel:, etc.),
 * and anchor links untouched.
 */
function prefixHttpsIfNeeded(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return trimmed;
  if (trimmed.includes("://")) return trimmed;
  if (trimmed.startsWith("/") || trimmed.startsWith("#")) return trimmed;
  if (trimmed.startsWith("mailto:") || trimmed.startsWith("tel:")) return trimmed;
  // Bare domain → https://
  if (/^[a-z0-9-]+(\.[a-z0-9-]+)+(\/|$)/i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  return trimmed;
}

/**
 * Wizard panel for creating or editing a button on a site block.
 *
 * Two steps, mirroring the convention used elsewhere in the page editor
 * (settings → design / data, page edit → identity / visibility):
 *
 *  - **Link** — the semantic part: what the button says and where it goes.
 *    The link picker is a searchable `<Select>` that lists every internal
 *    page in the org; if the typed query looks like a URL but doesn't
 *    match an existing page, a synthesized "Use this URL: …" option
 *    appears at the top so the user can commit it in one click.
 *  - **Style** — the visual treatment + new-tab behaviour. Edit mode also
 *    surfaces a danger-zone Delete here.
 *
 * Replaces the previous `<ButtonConfigDialog>` modal. The shape of the
 * payload is unchanged, so consumers continue to receive a `ButtonConfig`
 * via `onSave`.
 */
export function ButtonWizard({
  open,
  mode,
  initialValue,
  onClose,
  onSave,
  onDelete,
  orgSlug,
  availableInternalLinks = []
}: ButtonWizardProps) {
  // Live query text fed by Select's `onQueryChange`. Used to compute the
  // synthesized URL row.
  const [linkQuery, setLinkQuery] = React.useState("");
  const { pages } = useOrgLinkPickerPages(orgSlug);

  // Build a status chip for an option. Every option gets one — Published
  // (emerald) for live pages, Draft (slate) for unpublished pages,
  // External (blue) for off-site URLs — so the dropdown reads uniformly
  // and the user can tell at a glance what kind of link they're picking.
  const chipFor = React.useCallback((kind: "published" | "draft" | "external" | "page") => {
    if (kind === "published") return { label: "Published", color: "emerald" as const, status: true };
    if (kind === "draft") return { label: "Draft", color: "slate" as const, status: true };
    if (kind === "external") return { label: "External", color: "blue" as const, status: true };
    return { label: "Page", color: "slate" as const, status: true };
  }, []);

  // Build the option list once per change to pages / props / query / the
  // currently-set href. Order:
  //   1. (optional) synthesized URL row if the query looks like a URL
  //      and isn't an exact match for an existing option.
  //   2. Org-defined pages, deduped against `availableInternalLinks`.
  //   3. A "currently selected" fallback for whatever's in `state.href`
  //      if it isn't covered above — otherwise the Select renders the
  //      placeholder colour after picking a custom URL.
  const currentHref = initialValue.href;
  const linkOptions: SelectOption[] = React.useMemo(() => {
    const seen = new Set<string>();
    const opts: SelectOption[] = [];

    const pushOnce = (opt: SelectOption) => {
      if (seen.has(opt.value)) return;
      seen.add(opt.value);
      opts.push(opt);
    };

    for (const page of pages) {
      const path = page.slug === "home" ? "/" : `/${page.slug}`;
      pushOnce({
        value: path,
        label: page.title,
        subtext: path,
        chip: chipFor(page.isPublished ? "published" : "draft")
      });
    }
    for (const link of availableInternalLinks) {
      const value = isExternalHref(link.value) ? link.value : normalizeInternalPath(link.value);
      pushOnce({
        value,
        label: link.label,
        subtext: value,
        chip: chipFor(isExternalHref(value) ? "external" : "page")
      });
    }

    // Synthetic URL row — pin to the top so the user spots it without
    // having to scroll past page options. Bare domains get the
    // `https://` prefix automatically when committed; the label shows
    // the (prefixed) target so the user previews the actual link they're
    // about to set. The value IS the target URL (no synthetic prefix)
    // so selecting it sets `state.href` to a value that matches this
    // very option — keeping the Select from falling back to placeholder
    // styling once the choice is committed.
    const typed = linkQuery.trim();
    if (typed && looksLikeUrlQuery(typed)) {
      const target = prefixHttpsIfNeeded(typed);
      if (!seen.has(target) && !seen.has(normalizeInternalPath(target))) {
        opts.unshift({
          value: target,
          label: target,
          chip: chipFor("external")
        });
        seen.add(target);
      }
    }

    // Fallback row for the currently-selected href when nothing in the
    // pages / available-links / typed-query lists matches it. Without
    // this, an existing button whose target is a hand-typed URL would
    // render with the placeholder treatment after the panel opens.
    const fallback = currentHref.trim();
    if (fallback && !seen.has(fallback) && !seen.has(normalizeInternalPath(fallback))) {
      opts.push({
        value: fallback,
        label: fallback,
        chip: chipFor(isExternalHref(fallback) ? "external" : "page")
      });
    }

    return opts;
  }, [availableInternalLinks, chipFor, currentHref, linkQuery, pages]);

  const steps: WizardStep<WizardState>[] = [
    {
      id: "link",
      label: "Link",
      description: "Text, destination, and new-tab behaviour.",
      validate: (state) => {
        const errors: Record<string, string> = {};
        if (!state.label.trim()) {
          errors.label = "Text is required.";
        }
        const href = state.href.trim();
        if (!href) {
          errors.href = "Link is required.";
        } else if (isExternalHref(href) && !/^https?:\/\//i.test(href)) {
          errors.href = "External URL must start with http:// or https://";
        }
        return Object.keys(errors).length > 0 ? errors : null;
      },
      render: ({ state, setField, fieldErrors }) => {
        // Selection value for the Select: matches an option exactly when
        // possible, otherwise empty so the search input shows the
        // placeholder ("…current href").
        const currentValue = state.href.trim();
        const matchedOption = linkOptions.find((opt) => opt.value === currentValue);
        return (
          <div className="space-y-4">
            <FormField error={fieldErrors.label} label="Text">
              <Input
                maxLength={64}
                onChange={(event) => setField("label", event.target.value)}
                placeholder="Button label"
                value={state.label}
              />
            </FormField>
            <FormField
              error={fieldErrors.href}
              hint={
                currentValue && !matchedOption
                  ? `Currently linked to: ${describeButtonHref(currentValue)}`
                  : "Search a page name, or paste a URL."
              }
              label="Link"
            >
              <Select
                onChange={(event) => setField("href", event.target.value)}
                onQueryChange={setLinkQuery}
                options={linkOptions}
                placeholder={currentValue ? describeButtonHref(currentValue) : "Search pages or type a URL"}
                searchable
                value={matchedOption ? currentValue : ""}
              />
            </FormField>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={Boolean(state.newTab)}
                onChange={(event) => setField("newTab", event.target.checked)}
              />
              <span className="font-medium text-text">Open in a new tab</span>
            </label>
            {fieldErrors.href || fieldErrors.label ? (
              <Alert variant="destructive">Please fix the highlighted fields.</Alert>
            ) : null}
          </div>
        );
      }
    },
    {
      id: "style",
      label: "Style",
      description: "Visual treatment for the button.",
      render: ({ state, setField }) => {
        // Live preview text — the actual label the user typed, so they
        // see the exact button they're configuring. Falls back to a
        // neutral placeholder so a blank label still produces visible
        // chips to click.
        const previewLabel = state.label.trim() || "Button";
        return (
          <div className="space-y-5">
            <div aria-label="Button style" className="grid gap-2" role="radiogroup">
              {buttonVariantOptions.map((opt) => {
                const selected = state.variant === opt.value;
                return (
                  <button
                    aria-checked={selected}
                    className={cn(
                      "flex w-full items-center justify-between gap-4 rounded-card border bg-surface px-4 py-3 text-left transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                      selected ? "border-accent bg-canvas/40" : "border-border hover:bg-canvas/30"
                    )}
                    key={opt.value}
                    onClick={() => setField("variant", opt.value as ButtonConfig["variant"])}
                    role="radio"
                    type="button"
                  >
                    <span className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden
                        className={cn(
                          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
                          selected ? "border-accent bg-accent/10" : "border-border"
                        )}
                      >
                        <span
                          className={cn(
                            "h-2.5 w-2.5 rounded-full bg-accent transition-opacity",
                            selected ? "opacity-100" : "opacity-0"
                          )}
                        />
                      </span>
                      <span className="font-medium leading-5 text-text">{opt.label}</span>
                    </span>
                    {/*
                      Preview "button" — rendered as a non-interactive span
                      with the same button classes so the card itself stays
                      the clickable element (no nested-button accessibility
                      headache, no event bubbling needed).
                    */}
                    <span
                      className={cn(
                        buttonVariants({ size: "sm", variant: opt.value }),
                        "pointer-events-none max-w-[60%] shrink-0"
                      )}
                    >
                      <span className="truncate">{previewLabel}</span>
                    </span>
                  </button>
                );
              })}
            </div>
            {mode === "edit" && onDelete ? (
              <div className="space-y-2 border-t border-border pt-4">
                <div className="text-sm font-medium text-text">Danger zone</div>
                <p className="text-xs text-text-muted">
                  Removing this button is permanent. The list keeps its order — the
                  slot disappears.
                </p>
                <Button onClick={() => void onDelete()} size="sm" variant="danger">
                  <Trash2 className="h-4 w-4" />
                  Delete button
                </Button>
              </div>
            ) : null}
          </div>
        );
      }
    }
  ];

  const handleSubmit = async (state: WizardState): Promise<CreateWizardSubmitResult> => {
    onSave(normalizeForSubmit(state));
    return { ok: true };
  };

  return (
    <CreateWizard<WizardState>
      hideCancel
      initialState={initialValue}
      mode={mode}
      onClose={onClose}
      onSubmit={handleSubmit}
      open={open}
      steps={steps}
      submitLabel={mode === "create" ? "Add button" : "Save changes"}
      subtitle={mode === "create" ? "Configure a new button." : "Update this button."}
      title={mode === "create" ? "Add button" : "Edit button"}
    />
  );
}
