import { createSupabaseServer } from "@/lib/supabase/server";
import type { Permission } from "@/modules/core/access";
import type { AiChangesetV1, AiExecutionResult, AiProposal, AiResolvedContext } from "@/modules/ai/types";

const formsWritePermissions: Permission[] = ["forms.write"];
const submissionStatuses = ["submitted", "in_review", "approved", "rejected", "waitlisted", "cancelled"] as const;

type FormStatus = "draft" | "published" | "archived";
type SubmissionStatus = (typeof submissionStatuses)[number];

type OrgRow = {
  id: string;
  slug: string;
  name: string;
};

type FormRow = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  form_kind: string;
  status: FormStatus;
  target_mode: string;
  updated_at: string;
};

type SubmissionRow = {
  id: string;
  org_id: string;
  form_id: string;
  status: SubmissionStatus;
  created_at: string;
  updated_at: string;
};

type SubmissionLookupRow = SubmissionRow & {
  form: { id: string; name: string; slug: string } | { id: string; name: string; slug: string }[] | null;
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

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function parseRequestedFormStatus(value: string): FormStatus | null {
  if (value.includes("publish") || value.includes("published")) {
    return "published";
  }

  if (value.includes("archive") || value.includes("archived")) {
    return "archived";
  }

  if (value.includes("draft")) {
    return "draft";
  }

  return null;
}

function parseRequestedSubmissionStatus(value: string): SubmissionStatus | null {
  const normalized = normalize(value);

  if (normalized.includes("in review") || normalized.includes("under review")) {
    return "in_review";
  }

  for (const status of submissionStatuses) {
    if (normalized.includes(status.replace("_", " "))) {
      return status;
    }
  }

  if (normalized.includes("approve")) {
    return "approved";
  }

  if (normalized.includes("reject")) {
    return "rejected";
  }

  if (normalized.includes("waitlist")) {
    return "waitlisted";
  }

  if (normalized.includes("cancel")) {
    return "cancelled";
  }

  return null;
}

async function getOrgBySlug(orgSlug: string): Promise<OrgRow | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("orgs").select("id, slug, name").eq("slug", orgSlug).maybeSingle();

  if (error) {
    throw new Error(`Failed to load org context: ${error.message}`);
  }

  return (data as OrgRow | null) ?? null;
}

async function listRecentForms(orgId: string, limit = 25): Promise<FormRow[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_forms").select("id, org_id, slug, name, description, form_kind, status, target_mode, updated_at").eq("org_id", orgId).order("updated_at", { ascending: false }).limit(limit);

  if (error) {
    throw new Error(`Failed to list forms: ${error.message}`);
  }

  return (data ?? []) as FormRow[];
}

async function findFormById(orgId: string, formId: string): Promise<FormRow | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_forms").select("id, org_id, slug, name, description, form_kind, status, target_mode, updated_at").eq("org_id", orgId).eq("id", formId).maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve form: ${error.message}`);
  }

  return (data as FormRow | null) ?? null;
}

async function findSubmissionById(orgId: string, submissionId: string): Promise<SubmissionRow | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.from("org_form_submissions").select("id, org_id, form_id, status, created_at, updated_at").eq("org_id", orgId).eq("id", submissionId).maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve submission: ${error.message}`);
  }

  return (data as SubmissionRow | null) ?? null;
}

async function listRecentSubmissions(orgId: string, limit = 20): Promise<SubmissionLookupRow[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_form_submissions")
    .select("id, org_id, form_id, status, created_at, updated_at, form:org_forms!inner(id, name, slug, org_id)")
    .eq("form.org_id", orgId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list recent submissions: ${error.message}`);
  }

  return (data ?? []) as SubmissionLookupRow[];
}

function mapSubmissionForm(value: SubmissionLookupRow["form"]) {
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

async function resolveFormTarget(input: {
  orgId: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<{ form: FormRow | null; ambiguity: AiProposal["ambiguity"] }> {
  const selectedId = cleanText(input.entitySelections.form);
  if (selectedId) {
    const byId = await findFormById(input.orgId, selectedId);
    return { form: byId, ambiguity: byId ? null : { key: "form", title: "Form not found", description: "The selected form no longer exists.", candidates: [] } };
  }

  const explicitId = cleanText(input.parameters.formId);
  if (explicitId) {
    const byId = await findFormById(input.orgId, explicitId);
    return { form: byId, ambiguity: byId ? null : { key: "form", title: "Form not found", description: "No form matched that id.", candidates: [] } };
  }

  const explicitSlug = cleanText(input.parameters.formSlug).toLowerCase();
  const targetName = cleanText(input.parameters.formName) || cleanText(input.parameters.targetName);
  const freeText = `${targetName} ${cleanText(input.parameters.freeText)} ${cleanText(input.parameters.userMessage)}`;

  const forms = await listRecentForms(input.orgId, 40);

  if (explicitSlug) {
    const bySlug = forms.find((form) => form.slug.toLowerCase() === explicitSlug) ?? null;
    if (bySlug) {
      return { form: bySlug, ambiguity: null };
    }
  }

  const targetText = normalize(freeText);
  if (!targetText) {
    return {
      form: null,
      ambiguity: {
        key: "form",
        title: "Select a form",
        description: "Pick which form you want to update.",
        candidates: forms.slice(0, 8).map((form) => ({ key: form.id, label: form.name, description: form.slug }))
      }
    };
  }

  const ranked = forms
    .map((form) => {
      const nameScore = normalize(form.name);
      const slugScore = normalize(form.slug);
      let score = 0;
      if (targetText.includes(nameScore) || targetText.includes(slugScore)) {
        score = 0.95;
      } else {
        const words = targetText.split(" ").filter((word) => word.length >= 3);
        const hits = words.filter((word) => nameScore.includes(word) || slugScore.includes(word)).length;
        if (hits > 0) {
          score = Math.min(0.88, 0.4 + hits * 0.15);
        }
      }

      return { form, score };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return {
      form: null,
      ambiguity: {
        key: "form",
        title: "No form match found",
        description: "Choose from recent forms.",
        candidates: forms.slice(0, 8).map((form) => ({ key: form.id, label: form.name, description: form.slug }))
      }
    };
  }

  if (ranked.length > 1 && ranked[0].score - ranked[1].score < 0.06) {
    return {
      form: null,
      ambiguity: {
        key: "form",
        title: "Choose form",
        description: "Multiple forms match this request.",
        candidates: ranked.slice(0, 8).map((entry) => ({ key: entry.form.id, label: entry.form.name, description: entry.form.slug }))
      }
    };
  }

  return {
    form: ranked[0].form,
    ambiguity: null
  };
}

function noPermissionProposal(intentType: string): AiProposal {
  return {
    intentType,
    executable: false,
    requiredPermissions: formsWritePermissions,
    summary: "This action requires forms write access.",
    steps: [
      {
        key: "permission",
        title: "Permission required",
        detail: "You need `forms.write` permission to execute this forms action."
      }
    ],
    changeset: null,
    warnings: ["Insufficient permissions for execution."],
    ambiguity: null
  };
}

function createFormChangeset(input: {
  org: OrgRow;
  slug: string;
  name: string;
  description: string | null;
  formKind: "generic" | "program_registration";
}): AiChangesetV1 {
  return {
    version: "v1",
    intentType: "forms.create_form",
    orgId: input.org.id,
    orgSlug: input.org.slug,
    summary: `Create a new ${input.formKind === "program_registration" ? "registration" : "generic"} form named ${input.name}.`,
    preconditions: [
      {
        table: "org_forms",
        field: "slug",
        expected: null,
        reason: `Expect slug ${input.slug} to be available in this org.`
      }
    ],
    operations: [
      {
        kind: "insert",
        table: "org_forms",
        where: {
          org_id: input.org.id,
          slug: input.slug
        },
        set: {
          name: input.name,
          description: input.description,
          form_kind: input.formKind,
          status: "draft"
        }
      }
    ],
    revalidatePaths: [`/${input.org.slug}/tools/forms`, `/${input.org.slug}/manage/forms`]
  };
}

export async function proposeCreateFormAction(input: {
  context: AiResolvedContext;
  orgSlug: string;
  parameters: Record<string, unknown>;
}): Promise<AiProposal> {
  if (!input.context.permissionEnvelope.permissions.includes("forms.write")) {
    return noPermissionProposal("forms.create_form");
  }

  const org = await getOrgBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organization not found.");
  }

  const freeText = `${cleanText(input.parameters.formName)} ${cleanText(input.parameters.targetName)} ${cleanText(input.parameters.freeText)} ${cleanText(input.parameters.userMessage)}`;
  const fallbackName = cleanText(input.parameters.formName) || cleanText(input.parameters.targetName) || "New Form";

  let name = fallbackName;
  const quotedName = freeText.match(/(?:called|named|title)\s+["']([^"']+)["']/i)?.[1];
  if (quotedName) {
    name = quotedName.trim();
  }

  const formKind: "generic" | "program_registration" = normalize(freeText).includes("registration") ? "program_registration" : "generic";

  const requestedSlug = cleanText(input.parameters.formSlug) || slugify(name);
  const baseSlug = requestedSlug || "new-form";
  const existing = await listRecentForms(org.id, 200);
  const existingSlugs = new Set(existing.map((form) => form.slug));

  let slug = baseSlug;
  let suffix = 2;
  while (existingSlugs.has(slug)) {
    slug = `${baseSlug}-${suffix}`;
    suffix += 1;
  }

  const description = cleanText(input.parameters.description) || null;
  const changeset = createFormChangeset({
    org,
    slug,
    name,
    description,
    formKind
  });

  return {
    intentType: "forms.create_form",
    executable: true,
    requiredPermissions: formsWritePermissions,
    summary: changeset.summary,
    steps: [
      { key: "build-config", title: "Generate form draft", detail: "Create a draft form in org_forms." },
      { key: "validate-slug", title: "Validate slug", detail: `Use slug ${slug} (auto-adjusted if needed).` },
      { key: "refresh-views", title: "Refresh forms pages", detail: "Revalidate forms manage routes." }
    ],
    changeset,
    warnings: [],
    ambiguity: null
  };
}

export async function proposeUpdateFormBuilderAction(input: {
  context: AiResolvedContext;
  orgSlug: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<AiProposal> {
  if (!input.context.permissionEnvelope.permissions.includes("forms.write")) {
    return noPermissionProposal("forms.update_form_builder");
  }

  const org = await getOrgBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organization not found.");
  }

  const resolved = await resolveFormTarget({
    orgId: org.id,
    parameters: input.parameters,
    entitySelections: input.entitySelections
  });

  if (resolved.ambiguity || !resolved.form) {
    return {
      intentType: "forms.update_form_builder",
      executable: false,
      requiredPermissions: formsWritePermissions,
      summary: "Need a specific form before proposing updates.",
      steps: [{ key: "select-form", title: "Select form", detail: "Choose a form to update." }],
      changeset: null,
      warnings: ["Ambiguous or missing form target."],
      ambiguity: resolved.ambiguity
    };
  }

  const freeText = `${cleanText(input.parameters.freeText)} ${cleanText(input.parameters.userMessage)}`;
  const requestedName = cleanText(input.parameters.newName) || cleanText(input.parameters.formName);
  const requestedDescription = cleanText(input.parameters.description);
  const requestedStatus = cleanText(input.parameters.status) || freeText;

  const nextName = requestedName || resolved.form.name;
  const nextDescription = requestedDescription || resolved.form.description;
  const parsedStatus = parseRequestedFormStatus(requestedStatus);
  const nextStatus = parsedStatus ?? resolved.form.status;

  if (nextName === resolved.form.name && nextDescription === resolved.form.description && nextStatus === resolved.form.status) {
    return {
      intentType: "forms.update_form_builder",
      executable: false,
      requiredPermissions: formsWritePermissions,
      summary: "No form-builder updates detected from request.",
      steps: [{ key: "no-op", title: "No changes", detail: "Specify a name, description, or status change." }],
      changeset: null,
      warnings: [],
      ambiguity: null
    };
  }

  const changeset: AiChangesetV1 = {
    version: "v1",
    intentType: "forms.update_form_builder",
    orgId: org.id,
    orgSlug: org.slug,
    summary: `Update form ${resolved.form.name}.`,
    preconditions: [
      {
        table: "org_forms",
        field: "updated_at",
        expected: resolved.form.updated_at,
        reason: "Ensure form is unchanged since proposal." 
      }
    ],
    operations: [
      {
        kind: "update",
        table: "org_forms",
        where: {
          id: resolved.form.id,
          org_id: org.id
        },
        set: {
          name: nextName,
          description: nextDescription,
          status: nextStatus
        },
        before: {
          name: resolved.form.name,
          description: resolved.form.description,
          status: resolved.form.status
        },
        after: {
          name: nextName,
          description: nextDescription,
          status: nextStatus
        }
      }
    ],
    revalidatePaths: [`/${org.slug}/tools/forms`, `/${org.slug}/tools/forms/${resolved.form.id}/editor`, `/${org.slug}/manage/forms`]
  };

  return {
    intentType: "forms.update_form_builder",
    executable: true,
    requiredPermissions: formsWritePermissions,
    summary: changeset.summary,
    steps: [
      { key: "resolve-form", title: "Resolve form", detail: `Target form: ${resolved.form.name}.` },
      { key: "apply-builder-update", title: "Apply form builder updates", detail: "Update form metadata and/or status." },
      { key: "refresh", title: "Refresh form surfaces", detail: "Revalidate manage/editor routes." }
    ],
    changeset,
    warnings: [],
    ambiguity: null
  };
}

async function resolveSubmissionTarget(input: {
  orgId: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<{ submission: SubmissionRow | null; ambiguity: AiProposal["ambiguity"] }> {
  const recent = await listRecentSubmissions(input.orgId, 20);
  const candidateList = recent.map((submission) => {
    const form = mapSubmissionForm(submission.form);
    return {
      key: submission.id,
      label: `${submission.id.slice(0, 8)} (${form?.name ?? "Unknown form"})`,
      description: submission.status
    };
  });

  const selectedId = cleanText(input.entitySelections.form_submission);
  if (selectedId) {
    const submission = await findSubmissionById(input.orgId, selectedId);
    return {
      submission,
      ambiguity: submission
        ? null
        : {
            key: "form_submission",
            title: "Submission not found",
            description: "The selected submission was not found.",
            candidates: candidateList
          }
    };
  }

  const explicitId = cleanText(input.parameters.submissionId);
  if (explicitId) {
    const submission = await findSubmissionById(input.orgId, explicitId);
    return {
      submission,
      ambiguity: submission
        ? null
        : {
            key: "form_submission",
            title: "Submission not found",
            description: "No submission matched that id.",
            candidates: candidateList
          }
    };
  }

  return {
    submission: null,
    ambiguity: {
      key: "form_submission",
      title: "Select a response",
      description: "Pick which form response/submission to update.",
      candidates: candidateList
    }
  };
}

export async function proposeUpdateResponseStatusAction(input: {
  context: AiResolvedContext;
  orgSlug: string;
  parameters: Record<string, unknown>;
  entitySelections: Record<string, string>;
}): Promise<AiProposal> {
  if (!input.context.permissionEnvelope.permissions.includes("forms.write")) {
    return noPermissionProposal("forms.responses.update_status");
  }

  const org = await getOrgBySlug(input.orgSlug);
  if (!org) {
    throw new Error("Organization not found.");
  }

  const submissionResolved = await resolveSubmissionTarget({
    orgId: org.id,
    parameters: input.parameters,
    entitySelections: input.entitySelections
  });

  if (submissionResolved.ambiguity || !submissionResolved.submission) {
    return {
      intentType: "forms.responses.update_status",
      executable: false,
      requiredPermissions: formsWritePermissions,
      summary: "Need a specific response/submission before proposing status updates.",
      steps: [{ key: "select-response", title: "Select response", detail: "Provide or pick submission id." }],
      changeset: null,
      warnings: ["Ambiguous or missing submission target."],
      ambiguity: submissionResolved.ambiguity
    };
  }

  const statusHint = `${cleanText(input.parameters.status)} ${cleanText(input.parameters.freeText)} ${cleanText(input.parameters.userMessage)}`;
  const targetStatus = parseRequestedSubmissionStatus(statusHint);

  if (!targetStatus) {
    return {
      intentType: "forms.responses.update_status",
      executable: false,
      requiredPermissions: formsWritePermissions,
      summary: "Need the target response status.",
      steps: [{ key: "pick-status", title: "Choose status", detail: "Specify approved/rejected/in_review/etc." }],
      changeset: null,
      warnings: ["Missing target status."],
      ambiguity: {
        key: "submission_status",
        title: "Pick target status",
        description: "Select one status to apply to this response.",
        candidates: submissionStatuses.map((status) => ({ key: status, label: status.replace("_", " "), description: null }))
      }
    };
  }

  if (targetStatus === submissionResolved.submission.status) {
    return {
      intentType: "forms.responses.update_status",
      executable: false,
      requiredPermissions: formsWritePermissions,
      summary: "Response already has that status.",
      steps: [{ key: "no-op", title: "No changes", detail: "Requested status equals current status." }],
      changeset: null,
      warnings: [],
      ambiguity: null
    };
  }

  const changeset: AiChangesetV1 = {
    version: "v1",
    intentType: "forms.responses.update_status",
    orgId: org.id,
    orgSlug: org.slug,
    summary: `Update response ${submissionResolved.submission.id} to ${targetStatus}.`,
    preconditions: [
      {
        table: "org_form_submissions",
        field: "status",
        expected: submissionResolved.submission.status,
        reason: "Prevent stale status updates."
      }
    ],
    operations: [
      {
        kind: "update",
        table: "org_form_submissions",
        where: {
          id: submissionResolved.submission.id,
          org_id: org.id
        },
        set: {
          status: targetStatus
        },
        before: {
          status: submissionResolved.submission.status
        },
        after: {
          status: targetStatus
        }
      }
    ],
    revalidatePaths: [`/${org.slug}/tools/forms`, `/${org.slug}/manage/forms`]
  };

  return {
    intentType: "forms.responses.update_status",
    executable: true,
    requiredPermissions: formsWritePermissions,
    summary: changeset.summary,
    steps: [
      { key: "resolve-response", title: "Resolve response", detail: `Target submission: ${submissionResolved.submission.id}.` },
      { key: "update-status", title: "Update response status", detail: `Set status to ${targetStatus}.` },
      { key: "sync-registration", title: "Sync registrations", detail: "Apply the same status to linked program registrations." }
    ],
    changeset,
    warnings: [],
    ambiguity: null
  };
}

async function executeCreateFormChangeset(input: {
  context: AiResolvedContext;
  changeset: AiChangesetV1;
  execute: boolean;
}): Promise<AiExecutionResult> {
  const operation = input.changeset.operations[0];
  if (!operation) {
    throw new Error("Invalid create form changeset.");
  }

  const slug = operation.where.slug;
  const name = operation.set.name;
  const description = operation.set.description ?? null;
  const formKind = operation.set.form_kind === "program_registration" ? "program_registration" : "generic";

  if (!slug || !name) {
    throw new Error("Invalid form create payload.");
  }

  if (!input.execute) {
    return {
      ok: true,
      summary: input.changeset.summary,
      warnings: [],
      appliedChanges: 0
    };
  }

  const supabase = await createSupabaseServer();
  const { data: existing } = await supabase.from("org_forms").select("id").eq("org_id", input.changeset.orgId).eq("slug", slug).maybeSingle();

  if (existing) {
    throw new Error("This form slug is no longer available. Please request a fresh proposal.");
  }

  const { error } = await supabase.from("org_forms").insert({
    org_id: input.changeset.orgId,
    created_by: input.context.userId,
    slug,
    name,
    description,
    form_kind: formKind,
    status: "draft",
    target_mode: "choice",
    schema_json: {},
    ui_json: {},
    settings_json: {}
  });

  if (error) {
    throw new Error(`Failed to create form: ${error.message}`);
  }

  return {
    ok: true,
    summary: "Form draft created successfully.",
    warnings: [],
    appliedChanges: 1
  };
}

async function executeUpdateFormBuilderChangeset(input: {
  changeset: AiChangesetV1;
  execute: boolean;
}): Promise<AiExecutionResult> {
  const operation = input.changeset.operations[0];
  if (!operation) {
    throw new Error("Invalid form update changeset.");
  }

  const formId = operation.where.id;
  if (!formId) {
    throw new Error("Missing form id in changeset.");
  }

  if (!input.execute) {
    return {
      ok: true,
      summary: input.changeset.summary,
      warnings: [],
      appliedChanges: 0
    };
  }

  const supabase = await createSupabaseServer();

  const { data: current, error: currentError } = await supabase
    .from("org_forms")
    .select("id, updated_at")
    .eq("org_id", input.changeset.orgId)
    .eq("id", formId)
    .maybeSingle();

  if (currentError || !current) {
    throw new Error("Form not found.");
  }

  const expectedUpdatedAt = input.changeset.preconditions.find((precondition) => precondition.table === "org_forms" && precondition.field === "updated_at")?.expected;
  if (expectedUpdatedAt && current.updated_at !== expectedUpdatedAt) {
    throw new Error("This form changed since proposal. Please request a fresh plan.");
  }

  const patch: Record<string, string | null> = {};
  if (operation.set.name) {
    patch.name = operation.set.name;
  }
  if (Object.prototype.hasOwnProperty.call(operation.set, "description")) {
    patch.description = operation.set.description;
  }
  if (operation.set.status) {
    patch.status = operation.set.status;
  }

  const { error } = await supabase.from("org_forms").update(patch).eq("org_id", input.changeset.orgId).eq("id", formId);

  if (error) {
    throw new Error(`Failed to update form: ${error.message}`);
  }

  return {
    ok: true,
    summary: "Form builder settings updated.",
    warnings: [],
    appliedChanges: 1
  };
}

async function executeResponseStatusChangeset(input: {
  changeset: AiChangesetV1;
  execute: boolean;
}): Promise<AiExecutionResult> {
  const operation = input.changeset.operations[0];
  if (!operation) {
    throw new Error("Invalid response changeset.");
  }

  const submissionId = operation.where.id;
  const nextStatus = operation.set.status as SubmissionStatus | undefined;
  if (!submissionId || !nextStatus) {
    throw new Error("Invalid response status payload.");
  }

  if (!input.execute) {
    return {
      ok: true,
      summary: input.changeset.summary,
      warnings: [],
      appliedChanges: 0
    };
  }

  const supabase = await createSupabaseServer();
  const { data: current, error: loadError } = await supabase
    .from("org_form_submissions")
    .select("id, status")
    .eq("org_id", input.changeset.orgId)
    .eq("id", submissionId)
    .maybeSingle();

  if (loadError || !current) {
    throw new Error("Submission not found.");
  }

  const expectedStatus = input.changeset.preconditions.find((precondition) => precondition.table === "org_form_submissions" && precondition.field === "status")?.expected;
  if (expectedStatus && current.status !== expectedStatus) {
    throw new Error("This response status changed since proposal. Please request a fresh plan.");
  }

  const { error } = await supabase.from("org_form_submissions").update({ status: nextStatus }).eq("org_id", input.changeset.orgId).eq("id", submissionId);

  if (error) {
    throw new Error(`Failed to update response status: ${error.message}`);
  }

  const { error: registrationSyncError } = await supabase
    .from("program_registrations")
    .update({ status: nextStatus })
    .eq("org_id", input.changeset.orgId)
    .eq("submission_id", submissionId);

  if (registrationSyncError) {
    throw new Error(`Response status changed but registration sync failed: ${registrationSyncError.message}`);
  }

  return {
    ok: true,
    summary: `Response updated to ${nextStatus}.`,
    warnings: [],
    appliedChanges: 1
  };
}

export async function executeFormsChangeset(input: {
  context: AiResolvedContext;
  changeset: AiChangesetV1;
  execute: boolean;
}): Promise<AiExecutionResult> {
  if (!input.context.org || input.context.org.orgId !== input.changeset.orgId) {
    throw new Error("Org context mismatch for forms execution.");
  }

  if (!input.context.permissionEnvelope.permissions.includes("forms.write")) {
    throw new Error("Insufficient permissions to execute forms actions.");
  }

  if (input.changeset.intentType === "forms.create_form") {
    return executeCreateFormChangeset(input);
  }

  if (input.changeset.intentType === "forms.update_form_builder") {
    return executeUpdateFormBuilderChangeset(input);
  }

  if (input.changeset.intentType === "forms.responses.update_status") {
    return executeResponseStatusChangeset(input);
  }

  throw new Error(`Unsupported forms changeset intent: ${input.changeset.intentType}`);
}
