"use server";

import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { uploadPurposeConfigByPurpose } from "@/modules/uploads/config";
import {
  buildOrgStoragePath,
  buildUserStoragePath,
  fileMatchesAcceptConstraint,
  mbToBytes,
  resolveFileExtension,
  resolveMaxSizeMb,
  resolveUploadedAssetUrl
} from "@/modules/uploads/server";
import type { CommitUploadRequest, CommitUploadResult, UploadConstraints, UploadCrop, UploadKind, UploadPurpose } from "@/modules/uploads/types";

const uploadKinds: UploadKind[] = ["org", "account", "public-org"];
const uploadPurposes: UploadPurpose[] = [
  "org-logo",
  "org-icon",
  "program-cover",
  "profile-photo",
  "birth-certificate",
  "site-hero",
  "site-block-image",
  "attachment"
];

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function asString(value: unknown) {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim();
}

function asNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseFloat(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return Number.NaN;
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function isUploadKind(value: string): value is UploadKind {
  return uploadKinds.includes(value as UploadKind);
}

function isUploadPurpose(value: string): value is UploadPurpose {
  return uploadPurposes.includes(value as UploadPurpose);
}

function parseConstraints(value: unknown): UploadConstraints | undefined {
  const parsed = asObject(value);
  if (Object.keys(parsed).length === 0) {
    return undefined;
  }

  const maxSizeMbValue = asNumber(parsed.maxSizeMB);
  const recommendedWidth = asNumber(asObject(parsed.recommendedPx).w);
  const recommendedHeight = asNumber(asObject(parsed.recommendedPx).h);
  const aspectRaw = parsed.aspect;

  const aspect =
    typeof aspectRaw === "number"
      ? aspectRaw
      : aspectRaw === "wide" || aspectRaw === "square" || aspectRaw === "free"
        ? aspectRaw
        : undefined;

  return {
    accept: asString(parsed.accept) || undefined,
    maxSizeMB: Number.isFinite(maxSizeMbValue) && maxSizeMbValue > 0 ? maxSizeMbValue : undefined,
    aspect,
    recommendedPx:
      Number.isFinite(recommendedWidth) && Number.isFinite(recommendedHeight) && recommendedWidth > 0 && recommendedHeight > 0
        ? {
            w: Math.round(recommendedWidth),
            h: Math.round(recommendedHeight)
          }
        : undefined,
    allowMultiple: typeof parsed.allowMultiple === "boolean" ? parsed.allowMultiple : undefined
  };
}

function parseCrop(value: unknown): UploadCrop | undefined {
  const parsed = asObject(value);
  if (Object.keys(parsed).length === 0) {
    return undefined;
  }

  const focalX = asNumber(parsed.focalX);
  const focalY = asNumber(parsed.focalY);
  const zoom = asNumber(parsed.zoom);

  if (!Number.isFinite(focalX) || !Number.isFinite(focalY) || !Number.isFinite(zoom)) {
    return undefined;
  }

  return {
    focalX: clamp(focalX, 0, 1),
    focalY: clamp(focalY, 0, 1),
    zoom: clamp(zoom, 1, 2)
  };
}

function parseDimension(value: unknown) {
  const parsed = asNumber(value);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }

  return Math.round(parsed);
}

function parseRequest(value: FormDataEntryValue | null): CommitUploadRequest | null {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  try {
    const parsed = asObject(JSON.parse(value));
    const kind = asString(parsed.kind);
    const purpose = asString(parsed.purpose);

    if (!isUploadKind(kind) || !isUploadPurpose(purpose)) {
      return null;
    }

    return {
      kind,
      purpose,
      orgSlug: asString(parsed.orgSlug) || undefined,
      constraints: parseConstraints(parsed.constraints),
      crop: parseCrop(parsed.crop),
      width: parseDimension(parsed.width),
      height: parseDimension(parsed.height)
    };
  } catch {
    return null;
  }
}

function isImageExtension(extension: string) {
  return ["png", "jpg", "jpeg", "webp", "svg", "ico", "heic", "heif"].includes(extension);
}

type UploadActor = {
  orgId?: string;
  userId?: string;
};

async function resolveUploadActor(request: CommitUploadRequest): Promise<UploadActor | null> {
  const purposeConfig = uploadPurposeConfigByPurpose[request.purpose];

  if (request.kind === "account") {
    const user = await getSessionUser();
    if (!user) {
      return null;
    }

    return {
      userId: user.id
    };
  }

  if (!request.orgSlug) {
    return null;
  }

  if (request.kind === "public-org") {
    if (!purposeConfig.allowPublicOrg) {
      return null;
    }

    const org = await getOrgPublicContext(request.orgSlug);
    return {
      orgId: org.orgId
    };
  }

  const org = await requireOrgPermission(request.orgSlug, purposeConfig.orgPermission ?? "org.manage.read");
  return {
    orgId: org.orgId
  };
}

export async function commitUploadAction(formData: FormData): Promise<CommitUploadResult> {
  try {
    const request = parseRequest(formData.get("request"));
    const file = formData.get("file");

    if (!request) {
      return {
        ok: false,
        error: "Upload request was invalid."
      };
    }

    if (!(file instanceof File) || file.size <= 0) {
      return {
        ok: false,
        error: "Choose a file before saving."
      };
    }

    if (request.constraints?.allowMultiple) {
      return {
        ok: false,
        error: "Multiple file uploads are not enabled yet."
      };
    }

    if (request.kind === "account" && request.purpose !== "profile-photo" && request.purpose !== "birth-certificate") {
      return {
        ok: false,
        error: "This upload target is not available for account uploads."
      };
    }

    const actor = await resolveUploadActor(request);
    if (!actor) {
      return {
        ok: false,
        error: "You do not have permission to upload this file."
      };
    }

    const purposeConfig = uploadPurposeConfigByPurpose[request.purpose];
    const maxSizeMb = resolveMaxSizeMb(purposeConfig.maxSizeMB, request.constraints?.maxSizeMB);
    const maxSizeBytes = mbToBytes(maxSizeMb);

    if (file.size > maxSizeBytes) {
      return {
        ok: false,
        error: `File must be ${maxSizeMb}MB or smaller.`
      };
    }

    if (!fileMatchesAcceptConstraint(file, request.constraints?.accept)) {
      return {
        ok: false,
        error: "This file type is not allowed for this upload."
      };
    }

    const extension = resolveFileExtension(file, purposeConfig.allowedExtensions);
    if (!extension) {
      return {
        ok: false,
        error: `Allowed file types: ${purposeConfig.allowedExtensions.join(", ")}.`
      };
    }

    if (!actor.orgId && !actor.userId) {
      return {
        ok: false,
        error: "Upload target could not be resolved."
      };
    }

    const path = actor.orgId
      ? buildOrgStoragePath(actor.orgId, request.purpose, extension)
      : buildUserStoragePath(actor.userId ?? "", request.purpose, extension);

    const serviceRoleClient = createOptionalSupabaseServiceRoleClient();

    if (request.kind === "public-org" && !serviceRoleClient) {
      return {
        ok: false,
        error: "Public uploads are not configured on this server."
      };
    }

    const supabaseClient = serviceRoleClient ?? (await createSupabaseServer());

    if (!supabaseClient) {
      return {
        ok: false,
        error: "Uploads are not configured on this server."
      };
    }

    const bytes = await file.arrayBuffer();
    const { error } = await supabaseClient.storage.from(purposeConfig.bucket).upload(path, bytes, {
      contentType: file.type || undefined,
      upsert: false
    });

    if (error) {
      return {
        ok: false,
        error: `Upload failed: ${error.message}`
      };
    }

    const publicUrl = await resolveUploadedAssetUrl(purposeConfig.bucket, path);
    if (!publicUrl) {
      return {
        ok: false,
        error: "Upload finished but the preview URL could not be created."
      };
    }

    const includeImageMeta = file.type.startsWith("image/") || isImageExtension(extension);

    return {
      ok: true,
      asset: {
        id: crypto.randomUUID(),
        bucket: purposeConfig.bucket,
        path,
        publicUrl,
        mime: file.type || "application/octet-stream",
        size: file.size,
        width: includeImageMeta ? request.width : undefined,
        height: includeImageMeta ? request.height : undefined,
        crop: includeImageMeta ? request.crop : undefined
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);

    return {
      ok: false,
      error: "Upload failed. Please try again."
    };
  }
}
