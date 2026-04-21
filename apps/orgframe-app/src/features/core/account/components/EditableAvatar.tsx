"use client";

import * as React from "react";
import { Camera } from "lucide-react";
import { Avatar } from "@orgframe/ui/primitives/avatar";
import { cn } from "@orgframe/ui/primitives/utils";
import { ImageCropDialog, type ImageCropResult } from "@/src/features/files/uploads/ImageCropDialog";
import { useUploader } from "@/src/features/files/uploads/useUploader";
import type { UploadedAsset } from "@/src/features/files/uploads/types";

export type EditableAvatarProps = {
  src: string | null;
  name: string | null;
  sizePx: number;
  className?: string;
  priority?: boolean;
  /**
   * Called with the cropped File after the user confirms the crop. The handler is responsible for the
   * final upload (e.g. of the cropped image) and any downstream wiring such as updating the user record.
   */
  onSelect: (result: ImageCropResult) => Promise<void> | void;
  disabled?: boolean;
  ariaLabel?: string;
  cropAspect?: number | "free";
};

async function fetchAssetAsFile(asset: UploadedAsset): Promise<File> {
  const response = await fetch(asset.publicUrl);
  if (!response.ok) {
    throw new Error("Could not load the selected image.");
  }
  const blob = await response.blob();
  const baseName = asset.path.split("/").pop() || "image";
  return new File([blob], baseName, { type: asset.mime || blob.type });
}

export function EditableAvatar({
  src,
  name,
  sizePx,
  className,
  priority,
  onSelect,
  disabled = false,
  ariaLabel = "Change profile picture",
  cropAspect = 1
}: EditableAvatarProps) {
  const { openUpload } = useUploader();
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [opening, setOpening] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleClick() {
    if (disabled || saving || opening) return;
    setError(null);
    setOpening(true);
    try {
      const asset = await openUpload({
        kind: "account",
        purpose: "profile-photo",
        title: "Choose a profile picture",
        description: "Select an existing image or upload a new one. You'll crop it next.",
        constraints: { accept: "image/*", maxSizeMB: 10 }
      });
      if (!asset) return;
      const file = await fetchAssetAsFile(asset);
      setPendingFile(file);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the selected image.");
    } finally {
      setOpening(false);
    }
  }

  async function handleSave(result: ImageCropResult) {
    setSaving(true);
    setError(null);
    try {
      await onSelect(result);
      setPendingFile(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save image.");
    } finally {
      setSaving(false);
    }
  }

  const iconSize = Math.max(14, Math.round(sizePx * 0.32));
  const isBusy = disabled || saving || opening;

  return (
    <>
      <button
        aria-label={ariaLabel}
        className={cn(
          "group relative shrink-0 rounded-full p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          isBusy ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className
        )}
        disabled={isBusy}
        onClick={() => void handleClick()}
        style={{ width: sizePx, height: sizePx }}
        type="button"
      >
        <Avatar name={name} priority={priority} sizePx={sizePx} src={src} />
        <span
          aria-hidden
          className={cn(
            "pointer-events-none absolute inset-0 flex items-center justify-center rounded-full bg-black/45 text-white opacity-0 transition-opacity duration-150",
            !disabled && "group-hover:opacity-100 group-focus-visible:opacity-100"
          )}
        >
          <Camera style={{ width: iconSize, height: iconSize }} />
        </span>
      </button>
      <ImageCropDialog
        aspect={cropAspect}
        error={error}
        file={pendingFile}
        isSaving={saving}
        onClose={() => {
          if (saving) return;
          setPendingFile(null);
        }}
        onSave={handleSave}
        open={Boolean(pendingFile)}
        title="Crop your profile picture"
      />
    </>
  );
}
