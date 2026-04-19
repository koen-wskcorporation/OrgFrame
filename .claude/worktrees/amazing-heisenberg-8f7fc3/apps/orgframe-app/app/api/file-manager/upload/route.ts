import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import {
  getFolderById,
  insertUploadedFileRecord,
  uploadBinaryToStorage
} from "@/src/features/files/manager/server";
import { uploadPurposeConfigByPurpose } from "@/src/features/files/uploads/config";
import type {
  FileManagerAccessTag,
  FileManagerEntityType,
  FileManagerScope,
  FileManagerUploadPayload,
  FileManagerUploadResult,
  FileManagerVisibility
} from "@/src/features/files/manager/types";

const payloadSchema = z.object({
  scope: z.enum(["organization", "personal"] satisfies FileManagerScope[]),
  orgSlug: z.string().trim().min(1).optional(),
  folderId: z.string().uuid(),
  bucket: z.string().trim().min(1).optional(),
  accessTag: z.enum(["manage", "branding", "programs", "pages", "personal"] satisfies FileManagerAccessTag[]).optional(),
  visibility: z.enum(["private", "public"] satisfies FileManagerVisibility[]).optional(),
  entityType: z.enum(["program", "division", "team", "general"] satisfies FileManagerEntityType[]).optional(),
  entityId: z.string().uuid().nullable().optional(),
  legacyPurpose: z
    .enum(["org-logo", "org-icon", "program-cover", "profile-photo", "birth-certificate", "site-hero", "site-block-image", "attachment"])
    .nullable()
    .optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
  crop: z
    .object({
      focalX: z.number().min(0).max(1),
      focalY: z.number().min(0).max(1),
      zoom: z.number().min(1).max(2)
    })
    .optional(),
  dominantColor: z.string().trim().max(32).optional(),
  metadataJson: z.record(z.string(), z.unknown()).optional()
});

function extensionFromName(fileName: string) {
  const trimmed = fileName.trim();
  const dotIndex = trimmed.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === trimmed.length - 1) {
    return null;
  }

  return trimmed.slice(dotIndex + 1).toLowerCase();
}

function inferBucket(input: { payload: z.infer<typeof payloadSchema>; scope: FileManagerScope; accessTag: FileManagerAccessTag }) {
  if (input.payload.bucket) {
    return input.payload.bucket;
  }

  const legacyPurpose = input.payload.legacyPurpose;
  if (legacyPurpose) {
    const config = uploadPurposeConfigByPurpose[legacyPurpose];
    return config.bucket;
  }

  if (input.scope === "personal") {
    return "account-assets";
  }

  if (input.accessTag === "pages") {
    return "org-site-assets";
  }

  return "org-private-files";
}

function inferVisibility(input: { payload: z.infer<typeof payloadSchema>; bucket: string }) {
  if (input.payload.visibility) {
    return input.payload.visibility;
  }

  if (input.bucket === "org-site-assets" || input.bucket === "org-assets") {
    return "public" as const;
  }

  return "private" as const;
}

function asUploadPayload(parsed: z.infer<typeof payloadSchema>, bucket: string, visibility: FileManagerVisibility): FileManagerUploadPayload {
  return {
    scope: parsed.scope,
    orgSlug: parsed.orgSlug,
    folderId: parsed.folderId,
    bucket,
    accessTag: parsed.accessTag,
    visibility,
    entityType: parsed.entityType,
    entityId: parsed.entityId,
    legacyPurpose: parsed.legacyPurpose,
    width: parsed.width,
    height: parsed.height,
    crop: parsed.crop,
    dominantColor: parsed.dominantColor,
    metadataJson: parsed.metadataJson
  };
}

function failure(error: string, status = 400) {
  const body: FileManagerUploadResult = {
    ok: false,
    error
  };

  return NextResponse.json(body, {
    status
  });
}

export async function POST(request: Request) {
  const formData = await request.formData();
  const payloadRaw = formData.get("payload");
  const file = formData.get("file");

  if (typeof payloadRaw !== "string" || !payloadRaw.trim()) {
    return failure("Upload payload was invalid.");
  }

  if (!(file instanceof File) || file.size <= 0) {
    return failure("Choose a file before uploading.");
  }

  let parsedPayload: z.infer<typeof payloadSchema>;
  try {
    parsedPayload = payloadSchema.parse(JSON.parse(payloadRaw));
  } catch {
    return failure("Upload payload was invalid.");
  }

  const user = await getSessionUser();
  if (!user) {
    return failure("You must be signed in to upload files.", 401);
  }

  const folder = await getFolderById(parsedPayload.folderId);
  if (!folder) {
    return failure("Target folder was not found.");
  }

  if (folder.scope !== parsedPayload.scope) {
    return failure("Target folder scope mismatch.");
  }

  if (folder.scope === "personal") {
    if (folder.ownerUserId !== user.id) {
      return failure("You do not have permission to upload to this folder.", 403);
    }
  } else {
    if (!folder.orgId) {
      return failure("Target organization folder is invalid.");
    }

    const supabase = await createSupabaseServer();
    const { data: canWrite, error: writeError } = await supabase.rpc("file_manager_write_allowed", {
      target_org_id: folder.orgId,
      access_tag: folder.accessTag
    });

    if (writeError || canWrite !== true) {
      return failure("You do not have permission to upload to this folder.", 403);
    }
  }

  const bucket = inferBucket({
    payload: parsedPayload,
    scope: folder.scope,
    accessTag: folder.accessTag
  });

  const visibility = inferVisibility({
    payload: parsedPayload,
    bucket
  });

  const payload = asUploadPayload(parsedPayload, bucket, visibility);
  const extension = extensionFromName(file.name);

  try {
    const path = await uploadBinaryToStorage({
      scope: folder.scope,
      bucket,
      folderId: folder.id,
      orgId: folder.orgId,
      userId: user.id,
      extension,
      bytes: await file.arrayBuffer(),
      contentType: file.type || "application/octet-stream",
      legacyPurpose: payload.legacyPurpose ?? null
    });

    const record = await insertUploadedFileRecord({
      payload,
      folder,
      userId: user.id,
      orgId: folder.orgId,
      fileName: file.name,
      fileMime: file.type || "application/octet-stream",
      fileSize: file.size,
      bucket,
      storagePath: path
    });

    const body: FileManagerUploadResult = {
      ok: true,
      file: record
    };

    return NextResponse.json(body, {
      status: 200
    });
  } catch (error) {
    return failure(error instanceof Error ? error.message : "Upload failed. Please try again.");
  }
}
