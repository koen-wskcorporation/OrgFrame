import { createSupabaseServer } from "@/src/shared/data-api/server";
import type { Permission } from "@/src/features/core/access";
import type { AiChangesetV1, AiExecutionResult, AiProposal, AiResolvedContext } from "@/src/features/ai/types";

const intentType = "org.set_governing_body";
const requiredPermissions: Permission[] = ["org.branding.write"];

type GoverningBodyRow = {
  id: string;
  slug: string;
  name: string;
};

type OrgRow = {
  id: string;
  slug: string;
  name: string;
  governing_body_id: string | null;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalize(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function scoreCandidate(candidate: GoverningBodyRow, freeText: string) {
  const normalizedText = normalize(freeText);
  if (!normalizedText) {
    return 0;
  }

  const slug = normalize(candidate.slug);
  const name = normalize(candidate.name);

  if (normalizedText.includes(name)) {
    return 0.99;
  }

  if (normalizedText.includes(slug)) {
    return 0.97;
  }

  const words = normalizedText.split(" ").filter(Boolean);
  const hitCount = words.filter((word) => word.length >= 3 && (name.includes(word) || slug.includes(word))).length;

  if (hitCount === 0) {
    return 0;
  }

  return Math.min(0.9, 0.4 + hitCount * 0.15);
}

async function getOrgBySlug(orgSlug: string): Promise<OrgRow | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("orgs").from("orgs").select("id, slug, name, governing_body_id").eq("slug", orgSlug).maybeSingle();

  if (error) {
    throw new Error(`Failed to load org for intent: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return data as OrgRow;
}

async function listGoverningBodies(): Promise<GoverningBodyRow[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("orgs").from("governing_bodies").select("id, slug, name").order("name", { ascending: true });

  if (error) {
    throw new Error(`Failed to load governing body options: ${error.message}`);
  }

  return (data ?? []) as GoverningBodyRow[];
}

async function findGoverningBodyById(id: string): Promise<GoverningBodyRow | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("orgs").from("governing_bodies").select("id, slug, name").eq("id", id).maybeSingle();

  if (error) {
    throw new Error(`Failed to load governing body target: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return data as GoverningBodyRow;
}

function noPermissionProposal(orgSlug: string): AiProposal {
  return {
    intentType,
    executable: false,
    requiredPermissions,
    summary: "This change requires additional permissions.",
    steps: [
      {
        key: "permission-check",
        title: "Permission required",
        detail: `You need \`org.branding.write\` in ${orgSlug} to update governing body.`
      }
    ],
    changeset: null,
    warnings: ["Insufficient permissions for execution."],
    ambiguity: null
  };
}

function buildChangeset(input: {
  org: OrgRow;
  previousGoverningBodyId: string | null;
  nextGoverningBody: GoverningBodyRow | null;
}): AiChangesetV1 {
  const nextId = input.nextGoverningBody?.id ?? null;
  const nextName = input.nextGoverningBody?.name ?? "None";

  return {
    version: "v1",
    intentType,
    orgId: input.org.id,
    orgSlug: input.org.slug,
    summary: `Set governing body to ${nextName}.`,
    preconditions: [
      {
        table: "orgs",
        field: "governing_body_id",
        expected: input.previousGoverningBodyId,
        reason: "Prevent stale writes if org details changed since proposal." 
      }
    ],
    operations: [
      {
        kind: "update",
        table: "orgs",
        where: {
          id: input.org.id
        },
        set: {
          governing_body_id: nextId
        },
        before: {
          governing_body_id: input.previousGoverningBodyId
        },
        after: {
          governing_body_id: nextId
        }
      }
    ],
    revalidatePaths: [`/${input.org.slug}/tools/info`, `/${input.org.slug}/tools/info`, `/${input.org.slug}`]
  };
}

async function resolveTarget(input: {
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<{ target: GoverningBodyRow | null; ambiguity: AiProposal["ambiguity"] }> {
  const selectedId = cleanText(input.entitySelections.governing_body);
  if (selectedId) {
    const selected = await findGoverningBodyById(selectedId);
    return {
      target: selected,
      ambiguity: null
    };
  }

  const directId = cleanText(input.parameters.governingBodyId);
  if (directId) {
    const selected = await findGoverningBodyById(directId);
    return {
      target: selected,
      ambiguity: null
    };
  }

  const directSlug = cleanText(input.parameters.governingBodySlug).toLowerCase();
  if (directSlug) {
    const options = await listGoverningBodies();
    const hit = options.find((option) => option.slug.toLowerCase() === directSlug) ?? null;
    return {
      target: hit,
      ambiguity: null
    };
  }

  const freeText = cleanText(input.parameters.freeText) || cleanText(input.parameters.userMessage) || cleanText(input.parameters.targetName);

  if (!freeText) {
    return {
      target: null,
      ambiguity: {
        key: "governing_body",
        title: "Choose a governing body",
        description: "No governing body target was detected from the request.",
        candidates: []
      }
    };
  }

  const normalizedText = normalize(freeText);
  const wantsNone = /\b(clear|remove|none|no governing body)\b/.test(normalizedText);

  if (wantsNone) {
    return {
      target: null,
      ambiguity: null
    };
  }

  const options = await listGoverningBodies();
  const ranked = options
    .map((option) => ({
      option,
      score: scoreCandidate(option, freeText)
    }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      target: null,
      ambiguity: {
        key: "governing_body",
        title: "No governing body match found",
        description: "Select one of the available governing bodies.",
        candidates: options.map((option) => ({
          key: option.id,
          label: option.name,
          description: option.slug
        }))
      }
    };
  }

  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.05) {
    return {
      target: null,
      ambiguity: {
        key: "governing_body",
        title: "Choose between close matches",
        description: "Multiple governing bodies closely match this request.",
        candidates: ranked.slice(0, 5).map((entry) => ({
          key: entry.option.id,
          label: entry.option.name,
          description: entry.option.slug
        }))
      }
    };
  }

  return {
    target: ranked[0].option,
    ambiguity: null
  };
}

export async function proposeSetOrgGoverningBody(input: {
  context: AiResolvedContext;
  orgSlug: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<AiProposal> {
  if (!input.context.org || input.context.org.orgSlug !== input.orgSlug) {
    throw new Error("Organization context is required for this action.");
  }

  const org = await getOrgBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organization not found.");
  }

  if (!input.context.permissionEnvelope.canExecuteOrgActions) {
    return noPermissionProposal(input.orgSlug);
  }

  const resolved = await resolveTarget({
    parameters: input.parameters,
    entitySelections: input.entitySelections
  });

  if (resolved.ambiguity) {
    return {
      intentType,
      executable: false,
      requiredPermissions,
      summary: "Need your selection before proposing executable changes.",
      steps: [
        {
          key: "resolve-target",
          title: "Resolve target",
          detail: "Select a governing body to continue."
        }
      ],
      changeset: null,
      warnings: ["Ambiguous entity selection."],
      ambiguity: resolved.ambiguity
    };
  }

  const nextTargetId = resolved.target?.id ?? null;
  if (org.governing_body_id === nextTargetId) {
    return {
      intentType,
      executable: false,
      requiredPermissions,
      summary: "No update needed; governing body is already set to that value.",
      steps: [
        {
          key: "already-set",
          title: "No-op",
          detail: "Current value already matches requested value."
        }
      ],
      changeset: null,
      warnings: [],
      ambiguity: null
    };
  }

  const changeset = buildChangeset({
    org,
    previousGoverningBodyId: org.governing_body_id,
    nextGoverningBody: resolved.target
  });

  return {
    intentType,
    executable: true,
    requiredPermissions,
    summary: changeset.summary,
    steps: [
      {
        key: "verify-org",
        title: "Verify current org info",
        detail: "Confirm organization context and current governing body value."
      },
      {
        key: "apply-governing-body",
        title: "Update governing body",
        detail: `Set governing body to ${resolved.target?.name ?? "None"}.`
      },
      {
        key: "revalidate",
        title: "Refresh affected pages",
        detail: "Revalidate org info routes and public org header rendering."
      }
    ],
    changeset,
    warnings: [],
    ambiguity: null
  };
}

export async function executeSetOrgGoverningBodyChange(input: {
  context: AiResolvedContext;
  changeset: AiChangesetV1;
  execute: boolean;
}): Promise<AiExecutionResult> {
  if (!input.context.org || input.context.org.orgId !== input.changeset.orgId) {
    throw new Error("Org context mismatch for execution.");
  }

  if (!input.context.permissionEnvelope.canExecuteOrgActions) {
    throw new Error("Insufficient permissions to execute this action.");
  }

  if (input.changeset.intentType !== intentType) {
    throw new Error("Unsupported intent changeset.");
  }

  if (!input.execute) {
    return {
      ok: true,
      summary: input.changeset.summary,
      warnings: [],
      appliedChanges: 0
    };
  }

  const expected = input.changeset.preconditions.find((precondition) => precondition.table === "orgs" && precondition.field === "governing_body_id")?.expected ?? null;
  const nextValue = input.changeset.operations[0]?.set?.governing_body_id ?? null;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .rpc("ai_apply_org_governing_body_change", {
      input_org_id: input.changeset.orgId,
      input_expected_governing_body_id: expected,
      input_next_governing_body_id: nextValue,
      input_actor_user_id: input.context.userId
    })
    .single();

  if (error) {
    if (error.message.includes("STALE_CHANGESET")) {
      throw new Error("This proposal is stale. Please request a fresh plan.");
    }

    if (error.message.includes("FORBIDDEN")) {
      throw new Error("Insufficient permissions to execute this action.");
    }

    throw new Error(`Failed to execute governing body change: ${error.message}`);
  }

  const row = data as { applied?: boolean } | null;

  return {
    ok: true,
    summary: "Governing body updated successfully.",
    warnings: [],
    appliedChanges: row?.applied ? 1 : 0
  };
}
