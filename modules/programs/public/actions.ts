"use server";

import { z } from "zod";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { getProgramDetailsBySlug } from "@/modules/programs/db/queries";

const slugSchema = z.string().trim().min(1);

const inputSchema = z.object({
  orgSlug: slugSchema,
  programSlug: slugSchema,
  divisionSlug: slugSchema,
  teamSlug: slugSchema.optional().nullable()
});

export type ProgramSubnavContext = {
  program: {
    id: string;
    name: string;
    slug: string;
  };
  division: {
    id: string;
    name: string;
    slug: string;
  };
  team: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type ProgramSubnavActionResult =
  | {
      ok: true;
      data: ProgramSubnavContext;
    }
  | {
      ok: false;
      error: string;
    };

export async function getProgramSubnavContextAction(input: z.infer<typeof inputSchema>): Promise<ProgramSubnavActionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Invalid request." };
  }

  const { orgSlug, programSlug, divisionSlug, teamSlug } = parsed.data;
  const org = await getOrgPublicContext(orgSlug);
  const details = await getProgramDetailsBySlug(org.orgId, programSlug, { includeDraft: false });

  if (!details) {
    return { ok: false, error: "Program not found." };
  }

  const division = details.nodes.find((node) => node.nodeKind === "division" && node.slug === divisionSlug);
  if (!division) {
    return { ok: false, error: "Division not found." };
  }

  const team = teamSlug
    ? details.nodes.find((node) => node.nodeKind === "team" && node.slug === teamSlug && node.parentId === division.id) ?? null
    : null;

  if (teamSlug && !team) {
    return { ok: false, error: "Team not found." };
  }

  return {
    ok: true,
    data: {
      program: {
        id: details.program.id,
        name: details.program.name,
        slug: details.program.slug
      },
      division: {
        id: division.id,
        name: division.name,
        slug: division.slug
      },
      team: team
        ? {
            id: team.id,
            name: team.name,
            slug: team.slug
          }
        : null
    }
  };
}
