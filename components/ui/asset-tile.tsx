"use client";

import { ImageIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useUploader } from "@/modules/uploads/useUploader";
import type { OpenUploadOptions, UploadedAsset, UploadConstraints, UploadKind, UploadPurpose } from "@/modules/uploads/types";

type AssetTileFitMode = "contain" | "cover";
const overlayBackground = "rgba(0, 0, 0, 0.62)";

type AssetTileProps = {
  name?: string;
  kind: UploadKind;
  purpose: UploadPurpose;
  orgSlug?: string;
  constraints?: UploadConstraints;
  initialPath?: string | null;
  initialUrl?: string | null;
  initialCrop?: OpenUploadOptions["initialCrop"];
  value?: UploadedAsset | string | null;
  title?: string;
  specificationText?: string;
  emptyLabel?: string;
  previewAlt?: string;
  fit?: AssetTileFitMode;
  disabled?: boolean;
  className?: string;
  onChange?: (asset: UploadedAsset) => void;
  onRemove?: () => void;
};

function deriveInitialUrl(value: AssetTileProps["value"], initialUrl?: string | null): string {
  if (typeof value === "string") {
    return value;
  }

  return value?.publicUrl ?? initialUrl ?? "";
}

function deriveInitialPath(value: AssetTileProps["value"], initialPath?: string | null): string {
  if (value && typeof value !== "string") {
    return value.path;
  }

  return initialPath ?? "";
}

export function AssetTile({
  name,
  kind,
  purpose,
  orgSlug,
  constraints,
  initialPath,
  initialUrl,
  initialCrop,
  value,
  title,
  specificationText,
  emptyLabel = "Upload asset",
  previewAlt = "Uploaded asset",
  fit = "contain",
  disabled = false,
  className,
  onChange,
  onRemove
}: AssetTileProps) {
  const { openUpload } = useUploader();
  const [pathValue, setPathValue] = useState(deriveInitialPath(value, initialPath));
  const [previewUrl, setPreviewUrl] = useState(deriveInitialUrl(value, initialUrl));
  const [currentCrop, setCurrentCrop] = useState(initialCrop);
  const [isUploading, setIsUploading] = useState(false);
  const [isOverlayVisible, setIsOverlayVisible] = useState(false);

  useEffect(() => {
    setPathValue(deriveInitialPath(value, initialPath));
    setPreviewUrl(deriveInitialUrl(value, initialUrl));
    setCurrentCrop(initialCrop);
  }, [initialCrop, initialPath, initialUrl, value]);

  const hasSelection = useMemo(() => Boolean(pathValue || previewUrl), [pathValue, previewUrl]);
  const changeLabel = isUploading ? "Opening..." : hasSelection ? "Change" : "Upload";

  async function handleChangeAsset() {
    setIsUploading(true);

    try {
      const uploadedAsset = await openUpload({
        kind,
        purpose,
        orgSlug,
        constraints,
        initialCrop: currentCrop
      });

      if (!uploadedAsset) {
        return;
      }

      setPathValue(uploadedAsset.path);
      setPreviewUrl(uploadedAsset.publicUrl);
      setCurrentCrop(uploadedAsset.crop);
      onChange?.(uploadedAsset);
    } finally {
      setIsUploading(false);
    }
  }

  function handleRemoveAsset() {
    setPathValue("");
    setPreviewUrl("");
    setCurrentCrop(undefined);
    onRemove?.();
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div
        className="relative w-full overflow-hidden rounded-card border bg-surface p-4 shadow-card"
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
            setIsOverlayVisible(false);
          }
        }}
        onFocusCapture={() => setIsOverlayVisible(true)}
        onPointerEnter={() => setIsOverlayVisible(true)}
        onPointerLeave={() => setIsOverlayVisible(false)}
      >
        <div className="relative w-full overflow-hidden rounded-control" style={{ aspectRatio: "16 / 9" }}>
          {hasSelection && previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              alt={previewAlt}
              className={cn(
                "absolute inset-0 block h-full w-full object-center",
                fit === "cover" ? "object-cover" : "object-contain",
                "max-h-full max-w-full"
              )}
              src={previewUrl}
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-2 text-center text-text-muted">
              <ImageIcon className="h-5 w-5" aria-hidden="true" />
              <span className="sr-only">{emptyLabel}</span>
            </div>
          )}

        </div>

        <div
          className={cn(
            "absolute inset-0 z-10 flex flex-col items-center justify-center p-3 text-center text-white transition-opacity duration-200",
            isOverlayVisible ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"
          )}
          style={{ backgroundColor: overlayBackground }}
        >
          <div className="flex flex-wrap items-center justify-center gap-2">
            <Button
              aria-label={title ? `Change ${title}` : "Change asset"}
              disabled={disabled || isUploading}
              loading={isUploading}
              onClick={handleChangeAsset}
              size="sm"
              variant="secondary"
            >
              {changeLabel}
            </Button>

            {hasSelection ? (
              <Button
                aria-label={title ? `Remove ${title}` : "Remove asset"}
                disabled={disabled}
                onClick={handleRemoveAsset}
                size="sm"
                variant="secondary"
              >
                Remove
              </Button>
            ) : null}
          </div>

          {specificationText ? <p className="mt-2 text-[11px] text-white/85">{specificationText}</p> : null}
        </div>
      </div>

      {name ? <input name={name} type="hidden" value={pathValue} /> : null}
    </div>
  );
}
