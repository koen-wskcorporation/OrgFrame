"use client";

import Link from "next/link";
import { Download, Link2, Plus, QrCode } from "lucide-react";
import { useEffect, useMemo, useState, useTransition } from "react";
import { EditorSettingsDialog } from "@/components/shared/EditorSettingsDialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { addFormToPageAction, getFormSharingDataAction, type FormSharingData } from "@/modules/forms/actions";

type FormSharingPanelProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
  formId: string;
  formSlug: string;
};

function asPagePath(orgSlug: string, pageSlug: string) {
  if (pageSlug === "home") {
    return `/${orgSlug}`;
  }

  return `/${orgSlug}/${pageSlug}`;
}

export function FormSharingPanel({ open, onClose, orgSlug, formId, formSlug }: FormSharingPanelProps) {
  const { toast } = useToast();
  const [sharingData, setSharingData] = useState<FormSharingData | null>(null);
  const [selectedPageId, setSelectedPageId] = useState("");
  const [isLoading, startLoading] = useTransition();
  const [isAdding, startAdding] = useTransition();
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setSharingData(null);
    startLoading(async () => {
      const result = await getFormSharingDataAction({
        orgSlug,
        formId
      });

      if (!result.ok) {
        toast({
          title: "Unable to load sharing details",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setSharingData(result.data);
    });
  }, [formId, open, orgSlug, toast]);

  const activeFormSlug = sharingData?.formSlug ?? formSlug;
  const formPath = `/${orgSlug}/register/${activeFormSlug}`;
  const shareUrl = origin ? `${origin}${formPath}` : formPath;
  const qrCodeUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=512x512&data=${encodeURIComponent(shareUrl)}`;
  }, [shareUrl]);

  const includedPages = (sharingData?.pages ?? []).filter((page) => page.includeCount > 0);
  const availablePages = (sharingData?.pages ?? []).filter((page) => page.includeCount === 0);
  const canAddToPage = Boolean(sharingData?.canWritePages);

  useEffect(() => {
    if (availablePages.length === 0) {
      setSelectedPageId("");
      return;
    }

    const hasSelected = availablePages.some((page) => page.id === selectedPageId);
    if (!hasSelected) {
      setSelectedPageId(availablePages[0]?.id ?? "");
    }
  }, [availablePages, selectedPageId]);

  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(shareUrl);
      toast({
        title: "Link copied",
        variant: "success"
      });
    } catch (_error) {
      toast({
        title: "Unable to copy link",
        description: "Copy the URL manually.",
        variant: "destructive"
      });
    }
  }

  async function handleDownloadQr() {
    try {
      const response = await fetch(qrCodeUrl);
      if (!response.ok) {
        throw new Error("fetch_failed");
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = `${activeFormSlug}-qr.png`;
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
    } catch (_error) {
      toast({
        title: "Unable to download QR code",
        description: "Try again in a moment.",
        variant: "destructive"
      });
    }
  }

  function handleAddToPage() {
    if (!selectedPageId) {
      return;
    }

    startAdding(async () => {
      const result = await addFormToPageAction({
        orgSlug,
        formId,
        pageId: selectedPageId
      });

      if (!result.ok) {
        toast({
          title: "Unable to add form to page",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      const refreshed = await getFormSharingDataAction({
        orgSlug,
        formId
      });

      if (refreshed.ok) {
        setSharingData(refreshed.data);
      }

      toast({
        title: "Form added to page",
        variant: "success"
      });
    });
  }

  return (
    <EditorSettingsDialog
      description="Share this form link and place it on site pages."
      onClose={onClose}
      open={open}
      title="Sharing"
    >
      <div className="space-y-5">
        <FormField label="Public form link">
          <div className="flex items-center gap-2">
            <Input readOnly value={shareUrl} />
            <Button onClick={handleCopyLink} size="sm" type="button" variant="secondary">
              <Link2 className="h-4 w-4" />
              Copy
            </Button>
          </div>
        </FormField>

        <section className="space-y-3 rounded-card border bg-surface-muted p-3">
          <div className="flex items-center gap-2">
            <QrCode className="h-4 w-4 text-text-muted" />
            <p className="text-sm font-semibold text-text">QR code</p>
          </div>
          <div className="mx-auto w-full max-w-[220px] rounded-control border bg-surface p-2">
            <img alt="Form sharing QR code" className="h-auto w-full rounded-[8px]" src={qrCodeUrl} />
          </div>
          <Button className="w-full" onClick={handleDownloadQr} size="sm" type="button" variant="secondary">
            <Download className="h-4 w-4" />
            Download QR
          </Button>
        </section>

        <section className="space-y-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text">Included on pages</p>
            <p className="text-xs text-text-muted">Pages that already include this form via a Form block.</p>
          </div>
          {isLoading ? <Alert variant="info">Loading sharing details...</Alert> : null}
          {!isLoading && includedPages.length === 0 ? <Alert variant="info">This form has not been added to any pages yet.</Alert> : null}
          {includedPages.length > 0 ? (
            <div className="space-y-2">
              {includedPages.map((page) => (
                <div className="flex items-center justify-between rounded-control border bg-surface px-3 py-2" key={page.id}>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-text">{page.title}</p>
                    <p className="truncate text-xs text-text-muted">{asPagePath(orgSlug, page.slug)}</p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    {page.includeCount > 1 ? <span className="text-xs text-text-muted">{page.includeCount} blocks</span> : null}
                    <Link className="text-xs font-semibold text-accent hover:underline" href={asPagePath(orgSlug, page.slug)} rel="noopener noreferrer" target="_blank">
                      Open
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </section>

        <section className="space-y-3 rounded-card border bg-surface p-3">
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text">Add to page</p>
            <p className="text-xs text-text-muted">Insert a Form block with this form selected.</p>
          </div>

          {!canAddToPage ? <Alert variant="info">You do not have permission to edit pages.</Alert> : null}
          {canAddToPage && availablePages.length === 0 ? <Alert variant="info">This form is already on every available page.</Alert> : null}

          {canAddToPage && availablePages.length > 0 ? (
            <div className="space-y-2">
              <Select
                onChange={(event) => {
                  setSelectedPageId(event.target.value);
                }}
                options={availablePages.map((page) => ({
                  value: page.id,
                  label: page.slug === "home" ? `${page.title} (/)` : `${page.title} (/${page.slug})`
                }))}
                value={selectedPageId}
              />
              <Button disabled={!selectedPageId || isAdding} loading={isAdding} onClick={handleAddToPage} size="sm" type="button" variant="secondary">
                <Plus className="h-4 w-4" />
                Add to page
              </Button>
            </div>
          ) : null}
        </section>
      </div>
    </EditorSettingsDialog>
  );
}
