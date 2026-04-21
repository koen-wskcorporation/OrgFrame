import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { DataSourceDefinition } from "@/src/features/data/registry/types";
import { buildProgramEntitySource } from "@/src/features/data/sources/entity-program";
import { buildFacilityEntitySource } from "@/src/features/data/sources/entity-facility";
import { buildTeamEntitySource } from "@/src/features/data/sources/entity-team";

/**
 * DB-generated, on-demand entity data sources. Mirrors the file manager's
 * sync_org_entity_file_folders pattern: each program/team/facility produces
 * one entity source per page load, no persistence needed.
 */
export async function resolveEntityDataSources(orgId: string): Promise<DataSourceDefinition[]> {
  const supabase = await createSupabaseServer();
  const out: DataSourceDefinition[] = [];

  const { data: programs } = await supabase
    .schema("programs").from("programs")
    .select("id, name, slug")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(200);

  for (const row of programs ?? []) {
    out.push(buildProgramEntitySource({ orgId, programId: row.id as string, name: row.name as string, slug: row.slug as string }));
  }

  const { data: teams } = await supabase
    .schema("programs").from("program_teams")
    .select("id, name, program_id")
    .order("created_at", { ascending: false })
    .limit(200);

  const programMap = new Map<string, { name: string; slug: string }>();
  for (const row of programs ?? []) {
    programMap.set(row.id as string, { name: row.name as string, slug: row.slug as string });
  }
  for (const row of teams ?? []) {
    const program = programMap.get(row.program_id as string);
    if (!program) continue;
    out.push(
      buildTeamEntitySource({
        orgId,
        teamId: row.id as string,
        teamName: row.name as string,
        programName: program.name,
      })
    );
  }

  const { data: facilities } = await supabase
    .schema("facilities").from("spaces")
    .select("id, name")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(200);

  for (const row of facilities ?? []) {
    out.push(buildFacilityEntitySource({ orgId, spaceId: row.id as string, name: row.name as string }));
  }

  return out;
}
