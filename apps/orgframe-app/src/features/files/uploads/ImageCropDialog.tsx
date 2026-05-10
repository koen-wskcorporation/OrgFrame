"use client";

import * as React from "react";
import Cropper from "react-easy-crop";
import type { Area, Point } from "react-easy-crop";
import { Button } from "@orgframe/ui/primitives/button";
import { Popup } from "@orgframe/ui/primitives/popup";

export type ImageCropResult = {
  blob: Blob;
  file: File;
  width: number;
  height: number;
  crop: { focalX: number; focalY: number; zoom: number };
};

export type ImageCropDialogProps = {
  open: boolean;
  file: File | null;
  /**
   * Crop aspect ratio. Use a number (e.g. 1 for square, 16/9 for wide), or "free" for unconstrained.
   * Defaults to "free".
   */
  aspect?: number | "free";
  /** Min/max zoom for the slider. Defaults: 1, 4. */
  minZoom?: number;
  maxZoom?: number;
  /**
   * Output mime — usually mirror the source. Defaults to "image/jpeg" for raster sources, preserving PNG transparency.
   */
  outputMime?: "image/jpeg" | "image/png" | "image/webp";
  outputQuality?: number;
  title?: string;
  description?: string;
  isSaving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave: (result: ImageCropResult) => void | Promise<void>;
};

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.onerror = () => reject(reader.error ?? new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Failed to decode image"));
    image.src = src;
  });
}

async function renderCrop(
  src: string,
  area: Area,
  outputMime: string,
  outputQuality: number
): Promise<{ blob: Blob; width: number; height: number }> {
  const image = await loadImage(src);
  const canvas = document.createElement("canvas");
  const width = Math.max(1, Math.round(area.width));
  const height = Math.max(1, Math.round(area.height));
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas not supported");
  }
  ctx.drawImage(
    image,
    Math.round(area.x),
    Math.round(area.y),
    Math.round(area.width),
    Math.round(area.height),
    0,
    0,
    width,
    height
  );

  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      (result) => {
        if (result) resolve(result);
        else reject(new Error("Failed to encode cropped image"));
      },
      outputMime,
      outputQuality
    );
  });

  return { blob, width, height };
}

function inferOutputMime(file: File, requested?: ImageCropDialogProps["outputMime"]) {
  if (requested) return requested;
  if (file.type === "image/png") return "image/png";
  if (file.type === "image/webp") return "image/webp";
  return "image/jpeg";
}

function extensionForMime(mime: string) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  return "jpg";
}

export function ImageCropDialog({
  open,
  file,
  aspect = "free",
  minZoom = 1,
  maxZoom = 4,
  outputMime,
  outputQuality = 0.92,
  title = "Crop image",
  description = "Drag the corners to resize. Use the slider to zoom.",
  isSaving = false,
  error,
  onClose,
  onSave
}: ImageCropDialogProps) {
  const [src, setSrc] = React.useState<string | null>(null);
  const [crop, setCrop] = React.useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = React.useState(1);
  const [pixelArea, setPixelArea] = React.useState<Area | null>(null);
  const [internalError, setInternalError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    if (!open || !file) {
      setSrc(null);
      setCrop({ x: 0, y: 0 });
      setZoom(1);
      setPixelArea(null);
      setInternalError(null);
      return;
    }

    readFileAsDataUrl(file)
      .then((dataUrl) => {
        if (!cancelled) setSrc(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setInternalError("Could not read the selected image.");
      });

    return () => {
      cancelled = true;
    };
  }, [open, file]);

  const handleSave = React.useCallback(async () => {
    if (!src || !file || !pixelArea) return;
    setBusy(true);
    setInternalError(null);
    try {
      const mime = inferOutputMime(file, outputMime);
      const { blob, width, height } = await renderCrop(src, pixelArea, mime, outputQuality);
      const baseName = (file.name.replace(/\.[^.]+$/, "") || "image") + "-cropped." + extensionForMime(mime);
      const cropped = new File([blob], baseName, { type: mime });
      // The output blob is already cropped, so downstream consumers should treat it as a fully-framed
      // image — focal point is the center, zoom is 1.
      await onSave({
        blob,
        file: cropped,
        width,
        height,
        crop: { focalX: 0.5, focalY: 0.5, zoom: 1 }
      });
    } catch (err) {
      setInternalError(err instanceof Error ? err.message : "Failed to crop image.");
    } finally {
      setBusy(false);
    }
  }, [src, file, pixelArea, outputMime, outputQuality, onSave, zoom]);

  const cropAspect = aspect === "free" || aspect === undefined ? undefined : aspect;
  const displayedError = error ?? internalError;
  const isWorking = isSaving || busy;

  return (
    <Popup
      footer={
        <>
          <Button intent="cancel" disabled={isWorking} onClick={onClose} size="sm" variant="ghost">Cancel</Button>
          <Button disabled={isWorking || !src || !pixelArea} onClick={() => void handleSave()} size="sm">
            {isWorking ? "Saving..." : "Save"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      size="lg"
      subtitle={description}
      title={title}
    >
      <div className="flex flex-col gap-3">
        <div className="relative h-[420px] w-full overflow-hidden rounded-card border bg-black/90">
          {src ? (
            <Cropper
              aspect={cropAspect}
              crop={crop}
              image={src}
              maxZoom={maxZoom}
              minZoom={minZoom}
              objectFit={cropAspect ? "horizontal-cover" : "contain"}
              onCropChange={setCrop}
              onCropComplete={(_area, areaPixels) => setPixelArea(areaPixels)}
              onZoomChange={setZoom}
              restrictPosition={Boolean(cropAspect)}
              showGrid
              zoom={zoom}
              zoomWithScroll
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-xs text-white/70">
              {file ? "Loading image..." : "No image selected."}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="text-xs font-semibold uppercase tracking-wide text-text-muted">Zoom</span>
          <input
            aria-label="Zoom"
            className="flex-1 accent-accent"
            disabled={!src}
            max={maxZoom}
            min={minZoom}
            onChange={(event) => setZoom(Number.parseFloat(event.target.value))}
            step={0.01}
            type="range"
            value={zoom}
          />
          <span className="w-10 text-right text-xs tabular-nums text-text-muted">{zoom.toFixed(2)}x</span>
        </div>

        {displayedError ? <p className="text-sm text-danger">{displayedError}</p> : null}
      </div>
    </Popup>
  );
}
