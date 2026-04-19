import { createSupabaseServer } from "@/src/shared/data-api/server";
import { getSupabasePublicConfig } from "@/src/shared/supabase/config";
import type { Permission } from "@/src/features/core/access";
import { queryOrgDataInputSchema } from "@/src/features/ai/schemas";
import type { AiToolDefinition } from "@/src/features/ai/tools/base";

const formSubmissionStatuses = ["submitted", "in_review", "approved", "rejected", "waitlisted", "cancelled"] as const;

type Metric = "form_submission_count" | "forms_summary" | "programs_summary" | "events_summary" | "org_overview" | "rag_retrieve";

type FormRow = {
  id: string;
  slug: string;
  name: string;
  status: "draft" | "published" | "archived";
};

export type QueryOrgDataResult = {
  ok: true;
  metric: Metric;
  orgSlug: string;
  data: Record<string, unknown>;
  warnings: string[];
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

function hasAnyPermission(granted: Permission[], required: Permission[]) {
  if (required.length === 0) {
    return true;
  }

  const grantedSet = new Set(granted);
  return required.some((permission) => grantedSet.has(permission));
}

async function resolveOrgId(orgSlug: string) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.schema("orgs").from("orgs").select("id").eq("slug", orgSlug).maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve organization: ${error.message}`);
  }

  return data?.id ?? null;
}

async function getSessionAccessToken() {
  const supabase = await createSupabaseServer();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    throw new Error("Missing auth session for RAG retrieval.");
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (!sessionError && sessionData.session?.access_token) {
    return sessionData.session.access_token;
  }

  const { data: refreshedData, error: refreshError } = await supabase.auth.refreshSession();
  if (refreshError || !refreshedData.session?.access_token) {
    throw new Error("Missing auth session for RAG retrieval.");
  }

  return refreshedData.session.access_token;
}

async function runRagRetrieve(input: { orgId: string; query: string; topK: number }) {
  const accessToken = await getSessionAccessToken();
  const { supabaseUrl, supabasePublishableKey } = getSupabasePublicConfig();
  const response = await fetch(`${supabaseUrl}/functions/v1/vector-retrieve`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: supabasePublishableKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      org_id: input.orgId,
      query: input.query,
      top_k: input.topK,
    }),
    cache: "no-store",
  });

  const rawText = await response.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(rawText) as Record<string, unknown>;
  } catch {
    parsed = {};
  }

  if (!response.ok) {
    throw new Error(cleanText(parsed.error) || rawText || `RAG retrieval failed (${response.status}).`);
  }

  return parsed;
}

async function countRows(input: {
  schema: string;
  table: string;
  filters?: Array<{ field: string; value: string }>;
}) {
  const supabase = await createSupabaseServer();
  let query = supabase.schema(input.schema).from(input.table).select("id", { count: "exact", head: true });

  for (const filter of input.filters ?? []) {
    query = query.eq(filter.field, filter.value);
  }

  const { error, count } = await query;
  if (error) {
    throw new Error(`Failed to count ${input.schema}.${input.table}: ${error.message}`);
  }

  return count ?? 0;
}

async function listForms(orgId: string, limit = 80) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_forms")
    .select("id, slug, name, status")
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list forms: ${error.message}`);
  }

  return (data ?? []) as FormRow[];
}

function resolveFormFromInput(forms: FormRow[], input: { formId?: string; formSlug?: string; formName?: string; question?: string }) {
  if (input.formId) {
    const found = forms.find((form) => form.id === input.formId) ?? null;
    return {
      form: found,
      candidates: found ? [] : forms.slice(0, 8).map((form) => ({ id: form.id, slug: form.slug, name: form.name }))
    };
  }

  const slug = cleanText(input.formSlug).toLowerCase();
  if (slug) {
    const found = forms.find((form) => form.slug.toLowerCase() === slug) ?? null;
    return {
      form: found,
      candidates: found ? [] : forms.slice(0, 8).map((form) => ({ id: form.id, slug: form.slug, name: form.name }))
    };
  }

  const targetText = normalize(`${cleanText(input.formName)} ${cleanText(input.question)}`);
  if (!targetText) {
    return {
      form: null,
      candidates: forms.slice(0, 8).map((form) => ({ id: form.id, slug: form.slug, name: form.name }))
    };
  }

  const ranked = forms
    .map((form) => {
      const name = normalize(form.name);
      const formSlug = normalize(form.slug);
      let score = 0;

      if (targetText.includes(name) || targetText.includes(formSlug)) {
        score = 0.98;
      } else {
        const words = targetText.split(" ").filter((word) => word.length >= 3);
        const hits = words.filter((word) => name.includes(word) || formSlug.includes(word)).length;
        if (hits > 0) {
          score = Math.min(0.9, 0.35 + hits * 0.15);
        }
      }

      return { form, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      form: null,
      candidates: forms.slice(0, 8).map((form) => ({ id: form.id, slug: form.slug, name: form.name }))
    };
  }

  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.06) {
    return {
      form: null,
      candidates: ranked.slice(0, 8).map((entry) => ({ id: entry.form.id, slug: entry.form.slug, name: entry.form.name }))
    };
  }

  return {
    form: ranked[0].form,
    candidates: []
  };
}

async function getFormsSummary(orgId: string) {
  const [draft, published, archived, totalSubmissions] = await Promise.all([
    countRows({
      schema: "forms",
      table: "org_forms",
      filters: [
        { field: "org_id", value: orgId },
        { field: "status", value: "draft" }
      ]
    }),
    countRows({
      schema: "forms",
      table: "org_forms",
      filters: [
        { field: "org_id", value: orgId },
        { field: "status", value: "published" }
      ]
    }),
    countRows({
      schema: "forms",
      table: "org_forms",
      filters: [
        { field: "org_id", value: orgId },
        { field: "status", value: "archived" }
      ]
    }),
    countRows({
      schema: "forms",
      table: "org_form_submissions",
      filters: [{ field: "org_id", value: orgId }]
    })
  ]);

  return {
    formsByStatus: {
      draft,
      published,
      archived
    },
    totalForms: draft + published + archived,
    totalSubmissions
  };
}

async function getProgramsSummary(orgId: string) {
  const totalPrograms = await countRows({
    schema: "programs",
    table: "programs",
    filters: [{ field: "org_id", value: orgId }]
  });

  return {
    totalPrograms
  };
}

async function getEventsSummary(orgId: string) {
  const totalCalendarItems = await countRows({
    schema: "calendar",
    table: "calendar_items",
    filters: [{ field: "org_id", value: orgId }]
  });

  return {
    totalCalendarItems
  };
}

async function getFormSubmissionCount(orgId: string, input: { formId?: string; formSlug?: string; formName?: string; question?: string }) {
  const forms = await listForms(orgId);
  const { form, candidates } = resolveFormFromInput(forms, input);

  if (!form) {
    return {
      form: null,
      totalSubmissions: null,
      countsByStatus: null,
      candidates,
      reason: candidates.length > 0 ? "FORM_AMBIGUOUS_OR_NOT_FOUND" : "NO_FORMS_AVAILABLE"
    };
  }

  const totalSubmissions = await countRows({
    schema: "forms",
    table: "org_form_submissions",
    filters: [
      { field: "org_id", value: orgId },
      { field: "form_id", value: form.id }
    ]
  });

  const perStatus = await Promise.all(
    formSubmissionStatuses.map(async (status) => ({
      status,
      count: await countRows({
        schema: "forms",
        table: "org_form_submissions",
        filters: [
          { field: "org_id", value: orgId },
          { field: "form_id", value: form.id },
          { field: "status", value: status }
        ]
      })
    }))
  );

  return {
    form: {
      id: form.id,
      slug: form.slug,
      name: form.name,
      status: form.status
    },
    totalSubmissions,
    countsByStatus: Object.fromEntries(perStatus.map((entry) => [entry.status, entry.count])),
    candidates: []
  };
}

export const queryOrgDataTool: AiToolDefinition<typeof queryOrgDataInputSchema, QueryOrgDataResult> = {
  name: "query_org_data",
  description:
    "Read org-scoped data for grounded answers (form submission counts, forms summary, programs summary, events summary, and org overview).",
  inputSchema: queryOrgDataInputSchema,
  requiredPermissions: [],
  supportsDryRun: true,
  async execute(context, input) {
    const orgId = await resolveOrgId(input.orgSlug);
    if (!orgId) {
      return {
        ok: true,
        metric: input.metric,
        orgSlug: input.orgSlug,
        data: {
          error: "ORG_NOT_FOUND"
        },
        warnings: ["Organization context could not be resolved."]
      };
    }

    const permissions = context.requestContext.permissionEnvelope.permissions;
    const warnings: string[] = [];

    const canReadForms = hasAnyPermission(permissions, ["forms.read", "forms.write"]);
    const canReadPrograms = hasAnyPermission(permissions, ["programs.read", "programs.write"]);
    const canReadEvents = hasAnyPermission(permissions, ["calendar.read", "calendar.write", "events.read", "events.write"]);

    if (input.metric === "form_submission_count") {
      if (!canReadForms) {
        return {
          ok: true,
          metric: input.metric,
          orgSlug: input.orgSlug,
          data: {
            error: "PERMISSION_DENIED",
            requiredAnyPermission: ["forms.read", "forms.write"]
          },
          warnings: ["Missing forms read permission."]
        };
      }

      const data = await getFormSubmissionCount(orgId, {
        formId: input.formId,
        formSlug: input.formSlug,
        formName: input.formName,
        question: input.question
      });

      return {
        ok: true,
        metric: input.metric,
        orgSlug: input.orgSlug,
        data,
        warnings
      };
    }

    if (input.metric === "forms_summary") {
      if (!canReadForms) {
        return {
          ok: true,
          metric: input.metric,
          orgSlug: input.orgSlug,
          data: {
            error: "PERMISSION_DENIED",
            requiredAnyPermission: ["forms.read", "forms.write"]
          },
          warnings: ["Missing forms read permission."]
        };
      }

      return {
        ok: true,
        metric: input.metric,
        orgSlug: input.orgSlug,
        data: await getFormsSummary(orgId),
        warnings
      };
    }

    if (input.metric === "programs_summary") {
      if (!canReadPrograms) {
        return {
          ok: true,
          metric: input.metric,
          orgSlug: input.orgSlug,
          data: {
            error: "PERMISSION_DENIED",
            requiredAnyPermission: ["programs.read", "programs.write"]
          },
          warnings: ["Missing programs read permission."]
        };
      }

      return {
        ok: true,
        metric: input.metric,
        orgSlug: input.orgSlug,
        data: await getProgramsSummary(orgId),
        warnings
      };
    }

    if (input.metric === "events_summary") {
      if (!canReadEvents) {
        return {
          ok: true,
          metric: input.metric,
          orgSlug: input.orgSlug,
          data: {
            error: "PERMISSION_DENIED",
            requiredAnyPermission: ["calendar.read", "calendar.write", "events.read", "events.write"]
          },
          warnings: ["Missing calendar/events read permission."]
        };
      }

      return {
        ok: true,
        metric: input.metric,
        orgSlug: input.orgSlug,
        data: await getEventsSummary(orgId),
        warnings
      };
    }

    if (input.metric === "rag_retrieve") {
      const query = cleanText(input.question);
      if (!query) {
        return {
          ok: true,
          metric: input.metric,
          orgSlug: input.orgSlug,
          data: {
            error: "MISSING_QUERY",
          },
          warnings: ["Provide a question for RAG retrieval."],
        };
      }

      return {
        ok: true,
        metric: input.metric,
        orgSlug: input.orgSlug,
        data: await runRagRetrieve({
          orgId,
          query,
          topK: input.topK ?? 6,
        }),
        warnings,
      };
    }

    const overview: Record<string, unknown> = {};

    if (canReadForms) {
      overview.forms = await getFormsSummary(orgId);
    } else {
      warnings.push("Forms summary omitted due to missing forms read permission.");
    }

    if (canReadPrograms) {
      overview.programs = await getProgramsSummary(orgId);
    } else {
      warnings.push("Programs summary omitted due to missing programs read permission.");
    }

    if (canReadEvents) {
      overview.events = await getEventsSummary(orgId);
    } else {
      warnings.push("Events summary omitted due to missing calendar/events read permission.");
    }

    return {
      ok: true,
      metric: input.metric,
      orgSlug: input.orgSlug,
      data: overview,
      warnings
    };
  }
};
