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
