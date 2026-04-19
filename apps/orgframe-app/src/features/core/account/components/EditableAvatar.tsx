"use client";

import * as React from "react";
import { Camera } from "lucide-react";
import { Avatar } from "@orgframe/ui/primitives/avatar";
import { cn } from "@orgframe/ui/primitives/utils";
import { ImageCropDialog, type ImageCropResult } from "@/src/features/files/uploads/ImageCropDialog";

export type EditableAvatarProps = {
  src: string | null;
  name: string | null;
  sizePx: number;
  className?: string;
  priority?: boolean;
  /**
   * Called with the cropped File after the user confirms. The handler is responsible for the upload
   * and any downstream wiring (e.g. saving the resulting storage path on the user record).
   */
  onSelect: (result: ImageCropResult) => Promise<void> | void;
  disabled?: boolean;
  ariaLabel?: string;
  cropAspect?: number | "free";
};

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
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  const [pendingFile, setPendingFile] = React.useState<File | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  function openPicker() {
    if (disabled || saving) return;
    setError(null);
    inputRef.current?.click();
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    event.target.value = "";
    if (!next) return;
    if (!next.type.startsWith("image/")) {
      setError("Please choose an image file.");
      return;
    }
    setPendingFile(next);
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

  return (
    <>
      <button
        aria-label={ariaLabel}
        className={cn(
          "group relative shrink-0 rounded-full p-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
          disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
          className
        )}
        disabled={disabled || saving}
        onClick={openPicker}
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
      <input
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
        ref={inputRef}
        type="file"
      />
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
