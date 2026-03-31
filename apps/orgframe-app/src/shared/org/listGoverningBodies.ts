import { getGoverningBodyLogoUrl } from "@/src/shared/branding/getGoverningBodyLogoUrl";
import { createSupabaseServer } from "@/src/shared/data-api/server";

export type GoverningBodyOption = {
  id: string;
  slug: string;
  name: string;
  logoPath: string;
  logoUrl: string;
};

export async function listGoverningBodies(): Promise<GoverningBodyOption[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("orgs").from("governing_bodies").select("id, slug, name, logo_path").order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to list governing bodies: ${error.message}`);
  }

  return (data ?? []).map((body) => ({
    id: body.id,
    slug: body.slug,
    name: body.name,
    logoPath: body.logo_path,
    logoUrl: getGoverningBodyLogoUrl(body.logo_path)
  }));
}
