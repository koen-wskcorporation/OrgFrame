"use client";

import { useEffect, useMemo, useState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { EditorSettingsDialog } from "@/components/shared/EditorSettingsDialog";
import { describeButtonHref, isExternalHref } from "@/lib/links";
import { cn } from "@/lib/utils";
import { useOrgLinkPickerPages } from "@/modules/site-builder/hooks/useOrgLinkPickerPages";

type LinkOption = {
  label: string;
  value: string;
};

type LinkPickerDialogProps = {
  open: boolean;
  onClose: () => void;
  value: string;
  onConfirm: (href: string) => void;
  orgSlug?: string;
  title?: string;
  description?: string;
  availableInternalLinks?: LinkOption[];
};

type PageOption = {
  label: string;
  path: string;
  value: string;
  isDraft: boolean;
};

function normalizeInternalPath(value: string) {
  const trimmed = value.trim();

  if (!trimmed || trimmed === "/") {
    return "/";
  }

  const withoutLeadingSlash = trimmed.replace(/^\/+/, "");

  if (!withoutLeadingSlash) {
    return "/";
  }

  return `/${withoutLeadingSlash}`;
}

function toPickerInternalPath(href: string, orgSlug?: string) {
  if (isExternalHref(href)) {
    return "/";
  }

  const normalized = normalizeInternalPath(href);

  if (!orgSlug) {
    return normalized;
  }

  if (normalized === `/${orgSlug}`) {
    return "/";
  }

  if (normalized.startsWith(`/${orgSlug}/`)) {
    const withoutOrgPrefix = normalized.slice(orgSlug.length + 1);
    return normalizeInternalPath(withoutOrgPrefix || "/");
  }

  return normalized;
}

export function LinkPickerDialog({
  open,
  onClose,
  value,
  onConfirm,
  orgSlug,
  title = "Choose link",
  description = "Choose a page on this site or link to an external website.",
  availableInternalLinks = []
}: LinkPickerDialogProps) {
  const { pages, loading, error } = useOrgLinkPickerPages(orgSlug);
  const [mode, setMode] = useState<"page" | "external">(isExternalHref(value) ? "external" : "page");
  const [selectedPath, setSelectedPath] = useState(toPickerInternalPath(value, orgSlug));
  const [externalUrl, setExternalUrl] = useState(isExternalHref(value) ? value.trim() : "");
  const [search, setSearch] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);

  const pageOptions = useMemo<PageOption[]>(() => {
    const options: PageOption[] = [];

    for (const page of pages) {
      const path = page.slug === "home" ? "/" : `/${page.slug}`;
      options.push({
        label: page.title,
        path,
        value: path,
        isDraft: !page.isPublished
      });
    }

    options.push(
      ...availableInternalLinks
        .filter((item) => !isExternalHref(item.value))
        .map((item) => ({
          label: item.label,
          path: normalizeInternalPath(item.value),
          value: normalizeInternalPath(item.value),
          isDraft: false
        }))
    );

    const deduped = new Map<string, PageOption>();

    for (const option of options) {
      if (!deduped.has(option.value)) {
        deduped.set(option.value, option);
      }
    }

    if (!deduped.has("/")) {
      deduped.set("/", {
        label: "Home",
        path: "/",
        value: "/",
        isDraft: false
      });
    }

    return [...deduped.values()];
  }, [availableInternalLinks, pages]);

  const filteredOptions = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return pageOptions;
    }

    return pageOptions.filter((option) => option.label.toLowerCase().includes(query) || option.path.toLowerCase().includes(query));
  }, [pageOptions, search]);
  const optionsToRender = search.trim() ? filteredOptions : pageOptions;

  useEffect(() => {
    if (!open) {
      return;
    }

    const externalMode = isExternalHref(value);

    setMode(externalMode ? "external" : "page");
    setSelectedPath(toPickerInternalPath(value, orgSlug));
    setExternalUrl(externalMode ? value.trim() : "");
    setSearch("");
    setValidationError(null);
  }, [open, orgSlug, value]);

  function handleConfirm() {
    setValidationError(null);

    if (mode === "page") {
      const normalized = normalizeInternalPath(selectedPath || "/");
      onConfirm(normalized);
      onClose();
      return;
    }

    const trimmed = externalUrl.trim();

    if (!trimmed) {
      setValidationError("Enter a website URL.");
      return;
    }

    if (!/^https?:\/\//i.test(trimmed)) {
      setValidationError("Website URL must start with http:// or https://.");
      return;
    }

    onConfirm(trimmed);
    onClose();
  }

  const currentLinkDescription = describeButtonHref(value);
  const selectedPagePath = normalizeInternalPath(selectedPath || "/");

  return (
    <EditorSettingsDialog
      contentClassName="space-y-4"
      description={description}
      footer={
        <>
          <Button onClick={onClose} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button onClick={handleConfirm} size="sm">
            Use link
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
    >
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <button
          className={cn(
            "rounded-control border px-3 py-2 text-left text-sm font-semibold transition-colors",
            mode === "page" ? "border-border bg-surface-muted text-text" : "border-border/60 text-text-muted hover:bg-surface-muted"
          )}
          onClick={() => {
            setMode("page");
            setValidationError(null);
          }}
          type="button"
        >
          Page on this site
        </button>
        <button
          className={cn(
            "rounded-control border px-3 py-2 text-left text-sm font-semibold transition-colors",
            mode === "external" ? "border-border bg-surface-muted text-text" : "border-border/60 text-text-muted hover:bg-surface-muted"
          )}
          onClick={() => {
            setMode("external");
            setValidationError(null);
          }}
          type="button"
        >
          External website
        </button>
      </div>

      {mode === "page" ? (
        <div className="space-y-3">
          <FormField label="Find a page">
            <Input onChange={(event) => setSearch(event.target.value)} placeholder="Search pages" value={search} />
          </FormField>

          <div className="max-h-64 space-y-2 overflow-y-auto rounded-control border p-2">
            {optionsToRender.map((option) => (
              <button
                className={cn(
                  "w-full rounded-control border px-3 py-2 text-left transition-colors",
                  selectedPagePath === option.value ? "border-border bg-surface-muted" : "border-transparent hover:border-border/60 hover:bg-surface-muted"
                )}
                key={option.value}
                onClick={() => {
                  setSelectedPath(option.value);
                  setValidationError(null);
                }}
                type="button"
                >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-text">{option.label}</span>
                  {option.isDraft ? (
                    <Chip className="normal-case tracking-normal" color="yellow" size="small">
                      Draft
                    </Chip>
                  ) : null}
                </div>
                <p className="text-xs text-text-muted">{option.path}</p>
              </button>
            ))}

            {!loading && optionsToRender.length === 0 ? <p className="px-2 py-3 text-xs text-text-muted">No pages match your search.</p> : null}
          </div>

          <div className="rounded-control border bg-surface-muted p-3 text-xs text-text-muted">
            Selected URL: <span className="font-semibold text-text">{selectedPagePath}</span>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <FormField hint="Include http:// or https://" label="Website URL">
            <Input
              onChange={(event) => {
                setExternalUrl(event.target.value);
                setValidationError(null);
              }}
              placeholder="https://example.com"
              value={externalUrl}
            />
          </FormField>
        </div>
      )}

      <div className="rounded-control border bg-surface-muted p-3 text-xs text-text-muted">
        Current link: <span className="font-semibold text-text">{currentLinkDescription}</span>
      </div>

      {error ? <Alert variant="warning">{error}</Alert> : null}
      {validationError ? <Alert variant="destructive">{validationError}</Alert> : null}
    </EditorSettingsDialog>
  );
}
