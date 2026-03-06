import { createSupabaseServer } from "@/lib/supabase/server";
import { resolveEntitiesInputSchema } from "@/modules/ai/schemas";
import type { AiEntityResolution } from "@/modules/ai/types";
import type { AiToolDefinition } from "@/modules/ai/tools/base";

export type ResolveEntitiesResult = {
  ok: true;
  matches: AiEntityResolution[];
};

type GoverningBodyRow = {
  id: string;
  slug: string;
  name: string;
};

type ProgramRow = {
  id: string;
  slug: string;
  name: string;
};

type ProgramNodeRow = {
  id: string;
  program_id: string;
  name: string;
  node_kind: string;
};

type PlayerRow = {
  id: string;
  first_name: string;
  last_name: string;
};

type FormRow = {
  id: string;
  slug: string;
  name: string;
};

type FormSubmissionRow = {
  id: string;
  status: string;
  form: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null;
};

type CalendarEntryRow = {
  id: string;
  title: string;
};

function normalize(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ");
}

function scoreMatch(label: string, freeText: string) {
  const needle = normalize(label);
  const haystack = normalize(freeText);

  if (!haystack || !needle) {
    return 0;
  }

  if (haystack.includes(needle)) {
    return 0.99;
  }

  const words = haystack.split(" ").filter(Boolean);
  const hits = words.filter((word) => word.length >= 3 && needle.includes(word)).length;

  if (hits === 0) {
    return 0;
  }

  return Math.min(0.92, 0.4 + hits * 0.15);
}

async function resolveOrgId(orgSlug: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("orgs").select("id").eq("slug", orgSlug).maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve org in entity lookup: ${error.message}`);
  }

  return data?.id ?? null;
}

function toResolution<T extends { id: string }>(input: {
  type: AiEntityResolution["type"];
  rows: T[];
  freeText: string;
  getLabel: (row: T) => string;
  getSubtitle?: (row: T) => string | null;
  getMetadata?: (row: T) => Record<string, unknown>;
}): AiEntityResolution {
  return {
    type: input.type,
    candidates: input.rows
      .map((row) => {
        const label = input.getLabel(row);
        return {
          id: row.id,
          type: input.type,
          label,
          subtitle: input.getSubtitle ? input.getSubtitle(row) : null,
          confidence: scoreMatch(label, input.freeText),
          metadata: input.getMetadata ? input.getMetadata(row) : undefined
        };
      })
      .filter((candidate) => candidate.confidence > 0)
      .sort((a, b) => b.confidence - a.confidence)
      .slice(0, 8)
  };
}

function mapNestedForm(value: FormSubmissionRow["form"]) {
  const row = Array.isArray(value) ? value[0] : value;
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    slug: row.slug
  };
}

export const resolveEntitiesTool: AiToolDefinition<typeof resolveEntitiesInputSchema, ResolveEntitiesResult> = {
  name: "resolve_entities",
  description: "Resolve likely org-scoped entities from natural language input with confidence-ranked candidates.",
  inputSchema: resolveEntitiesInputSchema,
  requiredPermissions: [],
  supportsDryRun: true,
  async execute(_context, input) {
    const supabase = await createSupabaseServer();
    const orgId = await resolveOrgId(input.orgSlug);

    if (!orgId) {
      return {
        ok: true,
        matches: []
      };
    }

    const [governingBodies, programs, programNodes, players, forms, submissions, calendarEntries] = await Promise.all([
      supabase.from("governing_bodies").select("id, slug, name").order("name", { ascending: true }),
      supabase.from("programs").select("id, slug, name").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(30),
      supabase
        .from("program_nodes")
        .select("id, program_id, name, node_kind, programs!inner(org_id)")
        .eq("programs.org_id", orgId)
        .order("updated_at", { ascending: false })
        .limit(60),
      supabase
        .from("players")
        .select("id, first_name, last_name, program_registrations!inner(org_id)")
        .eq("program_registrations.org_id", orgId)
        .order("last_name", { ascending: true })
        .limit(40),
      supabase.from("org_forms").select("id, slug, name").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(30),
      supabase
        .from("org_form_submissions")
        .select("id, status, form:org_forms!inner(id, name, slug, org_id)")
        .eq("form.org_id", orgId)
        .order("created_at", { ascending: false })
        .limit(40),
      supabase.from("calendar_entries").select("id, title").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(30)
    ]);

    const resolutions: AiEntityResolution[] = [];

    resolutions.push(
      toResolution({
        type: "governing_body",
        rows: (governingBodies.data ?? []) as GoverningBodyRow[],
        freeText: input.freeText,
        getLabel: (row) => row.name,
        getSubtitle: (row) => row.slug
      })
    );

    if (!programs.error) {
      resolutions.push(
        toResolution({
          type: "program",
          rows: (programs.data ?? []) as ProgramRow[],
          freeText: input.freeText,
          getLabel: (row) => row.name,
          getSubtitle: (row) => row.slug
        })
      );
    }

    if (!programNodes.error) {
      resolutions.push(
        toResolution({
          type: "program_node",
          rows: (programNodes.data ?? []) as ProgramNodeRow[],
          freeText: input.freeText,
          getLabel: (row) => row.name,
          getSubtitle: (row) => row.node_kind
        })
      );
    }

    if (!players.error) {
      resolutions.push(
        toResolution({
          type: "player",
          rows: (players.data ?? []) as PlayerRow[],
          freeText: input.freeText,
          getLabel: (row) => `${row.first_name} ${row.last_name}`,
          getSubtitle: () => null
        })
      );
    }

    if (!forms.error) {
      resolutions.push(
        toResolution({
          type: "form",
          rows: (forms.data ?? []) as FormRow[],
          freeText: input.freeText,
          getLabel: (row) => row.name,
          getSubtitle: (row) => row.slug
        })
      );
    }

    if (!submissions.error) {
      const submissionRows = ((submissions.data ?? []) as FormSubmissionRow[]).map((row) => ({
        id: row.id,
        status: row.status,
        form: mapNestedForm(row.form)
      }));

      resolutions.push(
        toResolution({
          type: "form_submission",
          rows: submissionRows,
          freeText: input.freeText,
          getLabel: (row) => `Submission ${row.id.slice(0, 8)} (${row.form?.name ?? "Unknown form"})`,
          getSubtitle: (row) => row.status,
          getMetadata: (row) => ({
            formId: row.form?.id ?? null,
            formSlug: row.form?.slug ?? null
          })
        })
      );
    }

    if (!calendarEntries.error) {
      resolutions.push(
        toResolution({
          type: "event",
          rows: (calendarEntries.data ?? []) as CalendarEntryRow[],
          freeText: input.freeText,
          getLabel: (row) => row.title,
          getSubtitle: () => null
        })
      );
    }

    return {
      ok: true,
      matches: resolutions.filter((resolution) => resolution.candidates.length > 0)
    };
  }
};
