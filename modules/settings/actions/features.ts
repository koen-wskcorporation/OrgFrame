"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { orgFeatureDefinitions } from "@/lib/org/features";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { createSupabaseServer } from "@/lib/supabase/server";

export async function saveOrgFeaturesAction(orgSlug: string, formData: FormData) {
  try {
    const orgContext = await requireOrgPermission(orgSlug, "org.manage.read");
    const enabledKeys = new Set(
      formData
        .getAll("features")
        .filter((value): value is string => typeof value === "string")
    );

    const featuresJson = orgFeatureDefinitions.reduce<Record<string, { enabled: boolean }>>((acc, feature) => {
      acc[feature.key] = { enabled: enabledKeys.has(feature.key) };
      return acc;
    }, {});

    const supabase = await createSupabaseServer();
    const { error } = await supabase
      .from("orgs")
      .update({
        features_json: featuresJson
      })
      .eq("id", orgContext.orgId);

    if (error) {
      redirect(`/${orgSlug}/workspace/settings/features?error=save_failed`);
    }

    revalidatePath(`/${orgSlug}`);
    revalidatePath(`/${orgSlug}/workspace`);
    revalidatePath(`/${orgSlug}/workspace/settings`);
    revalidatePath(`/${orgSlug}/workspace/settings/features`);
    revalidatePath(`/${orgSlug}/workspace/programs`);
    revalidatePath(`/${orgSlug}/workspace/events`);
    revalidatePath(`/${orgSlug}/workspace/facilities`);
    revalidatePath(`/${orgSlug}/workspace/forms`);

    redirect(`/${orgSlug}/workspace/settings/features?saved=1`);
  } catch (error) {
    rethrowIfNavigationError(error);
    redirect(`/${orgSlug}/workspace/settings/features?error=save_failed`);
  }
}
