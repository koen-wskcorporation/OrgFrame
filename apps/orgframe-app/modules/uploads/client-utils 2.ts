import type { UploadCrop } from "@/modules/uploads/types";

const imageExtensions = new Set(["png", "jpg", "jpeg", "webp", "svg", "gif", "avif", "bmp", "ico", "heic", "heif"]);

function normalizeExtension(value: string) {
  const normalized = value.trim().toLowerCase().replace(/^\./, "");
  return normalized === "jpeg" ? "jpg" : normalized;
}

function matchesAcceptToken(file: File, tokenRaw: string) {
  const token = tokenRaw.trim().toLowerCase();
  if (!token) {
    return false;
  }

  if (token.startsWith(".")) {
    const extension = normalizeExtension(file.name.split(".").pop() ?? "");
    return extension === normalizeExtension(token);
  }

  if (token.endsWith("/*")) {
    const major = token.slice(0, -1);
    if (file.type.toLowerCase().startsWith(major)) {
      return true;
    }

    if (major === "image/") {
      const extension = normalizeExtension(file.name.split(".").pop() ?? "");
      return imageExtensions.has(extension);
    }

    return false;
  }

  return file.type.toLowerCase() === token;
}

export function fileMatchesAccept(file: File, accept: string | undefined) {
  if (!accept) {
    return true;
  }

  const tokens = accept
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

  if (tokens.length === 0) {
    return true;
  }

  return tokens.some((token) => matchesAcceptToken(file, token));
}

export function isImageFile(file: File) {
  if (file.type.toLowerCase().startsWith("image/")) {
    return true;
  }

  const extension = normalizeExtension(file.name.split(".").pop() ?? "");
  return imageExtensions.has(extension);
}

export function formatFileSize(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function defaultUploadCrop(initial?: UploadCrop): UploadCrop {
  return {
    focalX: initial?.focalX ?? 0.5,
    focalY: initial?.focalY ?? 0.5,
    zoom: initial?.zoom ?? 1
  };
}

export async function readImageDimensions(file: File) {
  if (!isImageFile(file)) {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const dimensions = await new Promise<{ width: number; height: number } | null>((resolve) => {
      const image = new Image();

      image.onload = () => {
        resolve({
          width: image.naturalWidth,
          height: image.naturalHeight
        });
      };

      image.onerror = () => {
        resolve(null);
      };

      image.src = objectUrl;
    });

    return dimensions;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function clampByte(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function toHex(value: number) {
  return clampByte(value).toString(16).padStart(2, "0");
}

export async function extractDominantColorFromImageFile(file: File): Promise<string | null> {
  if (!isImageFile(file)) {
    return null;
  }

  const objectUrl = URL.createObjectURL(file);

  try {
    const image = await new Promise<HTMLImageElement | null>((resolve) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => resolve(null);
      element.src = objectUrl;
    });

    if (!image) {
      return null;
    }

    const sampleSize = 64;
    const canvas = document.createElement("canvas");
    canvas.width = sampleSize;
    canvas.height = sampleSize;
    const context = canvas.getContext("2d", { willReadFrequently: true });

    if (!context) {
      return null;
    }

    context.drawImage(image, 0, 0, sampleSize, sampleSize);
    const { data } = context.getImageData(0, 0, sampleSize, sampleSize);

    const buckets = new Map<number, { weight: number; r: number; g: number; b: number; count: number }>();
    let fallbackWeight = 0;
    let fallbackR = 0;
    let fallbackG = 0;
    let fallbackB = 0;

    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3] / 255;
      if (alpha < 0.2) {
        continue;
      }

      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const saturation = max === 0 ? 0 : (max - min) / max;
      const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

      const baseWeight = alpha * (1 + saturation);
      fallbackWeight += baseWeight;
      fallbackR += r * baseWeight;
      fallbackG += g * baseWeight;
      fallbackB += b * baseWeight;

      if (luminance <= 0.08 || luminance >= 0.95 || saturation < 0.08) {
        continue;
      }

      const bucketKey = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bucketWeight = alpha * (1 + saturation * 1.4);
      const existing = buckets.get(bucketKey);

      if (existing) {
        existing.weight += bucketWeight;
        existing.r += r * bucketWeight;
        existing.g += g * bucketWeight;
        existing.b += b * bucketWeight;
        existing.count += 1;
      } else {
        buckets.set(bucketKey, {
          weight: bucketWeight,
          r: r * bucketWeight,
          g: g * bucketWeight,
          b: b * bucketWeight,
          count: 1
        });
      }
    }

    let best = Array.from(buckets.values()).sort((a, b) => b.weight - a.weight)[0];

    if (best && best.weight > 0) {
      const r = best.r / best.weight;
      const g = best.g / best.weight;
      const b = best.b / best.weight;
      return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    }

    if (fallbackWeight <= 0) {
      return null;
    }

    return `#${toHex(fallbackR / fallbackWeight)}${toHex(fallbackG / fallbackWeight)}${toHex(fallbackB / fallbackWeight)}`;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
