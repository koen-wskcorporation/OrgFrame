"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { saveDataCenterLayout, loadDataCenterLayout } from "@/src/features/data/layout-storage";
import { dataCenterLayoutSchema, normalizeLayout } from "@/src/features/data/layout";
import { collectionFilterSchema, collectionSortSchema } from "@/src/features/data/collections/types";
import {
  createDataCollection,
  deleteDataCollection,
  updateDataCollectionPinned,
} from "@/src/features/data/collections/storage";

const saveInputSchema = z.object({
  orgSlug: z.string().min(1),
  sourceKey: z.string().min(1),
  layout: dataCenterLayoutSchema,
});

export async function saveDataCenterLayoutAction(input: unknown) {
  const parsed = saveInputSchema.parse(input);
  const orgContext = await requireOrgPermission(parsed.orgSlug, "data.write");

  const saved = await saveDataCenterLayout({
    orgId: orgContext.orgId,
    sourceKey: parsed.sourceKey,
    userId: orgContext.userId,
    layout: normalizeLayout(parsed.layout),
  });

  revalidatePath(`/${parsed.orgSlug}/manage/data/${parsed.sourceKey}`);
  return saved;
}

const resetInputSchema = z.object({
  orgSlug: z.string().min(1),
  sourceKey: z.string().min(1),
});

export async function resetDataCenterLayoutAction(input: unknown) {
  const parsed = resetInputSchema.parse(input);
  const orgContext = await requireOrgPermission(parsed.orgSlug, "data.write");

  await saveDataCenterLayout({
    orgId: orgContext.orgId,
    sourceKey: parsed.sourceKey,
    userId: orgContext.userId,
    layout: { version: 1, widgets: [] },
  });

  revalidatePath(`/${parsed.orgSlug}/manage/data/${parsed.sourceKey}`);
  return loadDataCenterLayout({ orgId: orgContext.orgId, sourceKey: parsed.sourceKey });
}

const createCollectionSchema = z.object({
  orgSlug: z.string().min(1),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional().nullable(),
  sourceKey: z.string().min(1),
  tableKey: z.string().min(1).optional().nullable(),
  filters: z.array(collectionFilterSchema).default([]),
  sort: collectionSortSchema.optional().nullable(),
  pinned: z.boolean().optional(),
});

export async function createDataCollectionAction(input: unknown) {
  const parsed = createCollectionSchema.parse(input);
  const orgContext = await requireOrgPermission(parsed.orgSlug, "data.write");

  const collection = await createDataCollection({
    orgId: orgContext.orgId,
    userId: orgContext.userId,
    name: parsed.name,
    description: parsed.description ?? null,
    sourceKey: parsed.sourceKey,
    tableKey: parsed.tableKey ?? null,
    filters: parsed.filters,
    sort: parsed.sort ?? null,
    pinned: parsed.pinned ?? true,
  });

  revalidatePath(`/${parsed.orgSlug}/manage/data`);
  redirect(`/${parsed.orgSlug}/manage/data/collection:${collection.id}`);
}

const togglePinSchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().uuid(),
  pinned: z.boolean(),
});

export async function toggleCollectionPinAction(input: unknown) {
  const parsed = togglePinSchema.parse(input);
  const orgContext = await requireOrgPermission(parsed.orgSlug, "data.write");
  await updateDataCollectionPinned({ orgId: orgContext.orgId, id: parsed.id, pinned: parsed.pinned });
  revalidatePath(`/${parsed.orgSlug}/manage/data`);
}

const deleteSchema = z.object({
  orgSlug: z.string().min(1),
  id: z.string().uuid(),
});

export async function deleteCollectionAction(input: unknown) {
  const parsed = deleteSchema.parse(input);
  const orgContext = await requireOrgPermission(parsed.orgSlug, "data.write");
  await deleteDataCollection({ orgId: orgContext.orgId, id: parsed.id });
  revalidatePath(`/${parsed.orgSlug}/manage/data`);
  redirect(`/${parsed.orgSlug}/manage/data`);
}
