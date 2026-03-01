"use client";

import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { EditorSettingsDialog } from "@/components/shared/EditorSettingsDialog";
import type { UploadAspectMode, UploadCrop } from "@/modules/uploads/types";

type ImagePositionDialogProps = {
  open: boolean;
  file: File | null;
  aspect: UploadAspectMode;
  crop: UploadCrop;
  error?: string | null;
  isSaving: boolean;
  dimensions?: {
    width: number;
    height: number;
  } | null;
  recommendedPx?: {
    w: number;
    h: number;
  };
  title: string;
  description: string;
  onChangeCrop: (next: UploadCrop) => void;
  onReset: () => void;
  onBack: () => void;
  onClose: () => void;
  onSave: () => void;
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function aspectRatioValue(
  aspect: UploadAspectMode,
  dimensions: {
    width: number;
    height: number;
  } | null | undefined
) {
  if (typeof aspect === "number" && Number.isFinite(aspect) && aspect > 0) {
    return aspect;
  }

  if (aspect === "square") {
    return 1;
  }

  if (aspect === "wide") {
    return 16 / 9;
  }

  if (dimensions && dimensions.width > 0 && dimensions.height > 0) {
    return dimensions.width / dimensions.height;
  }

  return undefined;
}

export function ImagePositionDialog({
  open,
  file,
  aspect,
  crop,
  error,
  isSaving,
  dimensions,
  recommendedPx,
  title,
  description,
  onChangeCrop,
  onReset,
  onBack,
  onClose,
  onSave
}: ImagePositionDialogProps) {
  const previewUrl = useMemo(() => {
    if (!file) {
      return null;
    }

    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const previewAspect = aspectRatioValue(aspect, dimensions);

  function updateFromPointer(event: React.PointerEvent<HTMLDivElement>) {
    if (event.type === "pointermove" && event.buttons === 0) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const focalX = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const focalY = clamp((event.clientY - rect.top) / rect.height, 0, 1);

    onChangeCrop({
      ...crop,
      focalX,
      focalY
    });
  }

  return (
    <EditorSettingsDialog
      description={description}
      footer={
        <>
          <Button onClick={onClose} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button onClick={onBack} size="sm" variant="secondary">
            Back
          </Button>
          <Button disabled={!file || isSaving} loading={isSaving} onClick={onSave} size="sm">
            {isSaving ? "Saving..." : "Save"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <div
            className="relative w-full overflow-hidden rounded-card border bg-surface-muted"
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId);
              updateFromPointer(event);
            }}
            onPointerMove={updateFromPointer}
            style={{
              aspectRatio: previewAspect
            }}
          >
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                alt="Image position preview"
                className="absolute inset-0 h-full w-full object-cover"
                src={previewUrl}
                style={{
                  objectPosition: `${crop.focalX * 100}% ${crop.focalY * 100}%`,
                  transform: `scale(${crop.zoom})`
                }}
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center text-sm text-text-muted">Select an image to continue.</div>
            )}

            <div
              className="pointer-events-none absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-accent shadow-card"
              style={{
                left: `${crop.focalX * 100}%`,
                top: `${crop.focalY * 100}%`
              }}
            />
          </div>

          <p className="text-xs text-text-muted">Click or drag on the image to set the focal point.</p>
          {recommendedPx ? (
            <p className="text-xs text-text-muted">
              Recommended output: {recommendedPx.w} x {recommendedPx.h}px
            </p>
          ) : null}
        </div>

        <FormField hint="1.0 to 2.0" label="Zoom">
          <input
            className="w-full accent-accent"
            max={2}
            min={1}
            onChange={(event) => {
              onChangeCrop({
                ...crop,
                zoom: clamp(Number.parseFloat(event.target.value), 1, 2)
              });
            }}
            step={0.01}
            type="range"
            value={crop.zoom}
          />
        </FormField>

        <div className="flex flex-wrap gap-2">
          <Button onClick={onReset} size="sm" variant="secondary">
            Reset crop
          </Button>
        </div>

        {error ? (
          <p className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    </EditorSettingsDialog>
  );
}
