"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgPermission } from "@/src/shared/permissions/requireOrgPermission";
import { saveDataCenterLayout, loadDataCenterLayout } from "@/src/features/data-center/layout-storage";
import { dataCenterLayoutSchema, normalizeLayout } from "@/src/features/data-center/layout";

const saveInputSchema = z.object({
  orgSlug: z.string().min(1),
  sourceKey: z.string().min(1),
  layout: dataCenterLayoutSchema,
});

export async function saveDataCenterLayoutAction(input: unknown) {
  const parsed = saveInputSchema.parse(input);
  const orgContext = await requireOrgPermission(parsed.orgSlug, "data-center.write");

  const saved = await saveDataCenterLayout({
    orgId: orgContext.orgId,
    sourceKey: parsed.sourceKey,
    userId: orgContext.userId,
    layout: normalizeLayout(parsed.layout),
  });

  revalidatePath(`/${parsed.orgSlug}/manage/data-center/${parsed.sourceKey}`);
  return saved;
}

const resetInputSchema = z.object({
  orgSlug: z.string().min(1),
  sourceKey: z.string().min(1),
});

export async function resetDataCenterLayoutAction(input: unknown) {
  const parsed = resetInputSchema.parse(input);
  const orgContext = await requireOrgPermission(parsed.orgSlug, "data-center.write");

  await saveDataCenterLayout({
    orgId: orgContext.orgId,
    sourceKey: parsed.sourceKey,
    userId: orgContext.userId,
    layout: { version: 1, widgets: [] },
  });

  revalidatePath(`/${parsed.orgSlug}/manage/data-center/${parsed.sourceKey}`);
  return loadDataCenterLayout({ orgId: orgContext.orgId, sourceKey: parsed.sourceKey });
}
