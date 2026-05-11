import { createSupabaseServer } from "@/src/shared/data-api/server";
import { createDefaultFormSchema, parseFormSchema } from "@/src/features/forms/schema";
import type {
  FormSubmission,
  FormSubmissionEntry,
  FormSubmissionWithEntries,
  OrgForm,
  OrgFormGoogleSheetIntegration,
  OrgFormGoogleSheetSyncRun,
  OrgFormSubmissionView,
  OrgFormVersion,
  SubmissionStatus,
  TargetMode,
  FormKind,
  FormStatus
} from "@/src/features/forms/types";

const formSelect =
  "id, org_id, slug, name, description, form_kind, status, program_id, target_mode, locked_program_node_id, schema_json, ui_json, settings_json, created_by, created_at, updated_at";
const versionSelect = "id, org_id, form_id, version_number, snapshot_json, published_at, created_by, created_at";
const submissionSelect =
  "id, org_id, form_id, version_id, submitted_by_user_id, status, order_id, source_payment_status, admin_notes, sync_rev, answers_json, metadata_json, created_at, updated_at";
const submissionEntrySelect = "id, submission_id, player_id, program_node_id, answers_json, created_at";
const submissionViewSelect =
  "id, org_id, form_id, name, sort_index, visibility_scope, target_user_id, config_json, created_by_user_id, created_at, updated_at";
const googleSheetIntegrationSelect =
  "id, org_id, form_id, spreadsheet_id, spreadsheet_url, status, last_synced_at, last_error, created_by_user_id, created_at, updated_at";
const googleSheetSyncRunSelect =
  "id, org_id, form_id, integration_id, trigger_source, status, inbound_updates_count, inbound_creates_count, outbound_rows_count, conflicts_count, error_count, notes, started_at, completed_at, created_at";

type OrgFormRow = {
  id: string;
  org_id: string;
  slug: string;
  name: string;
  description: string | null;
  form_kind: FormKind;
  status: FormStatus;
  program_id: string | null;
  target_mode: TargetMode;
  locked_program_node_id: string | null;
  schema_json: unknown;
  ui_json: unknown;
  settings_json: unknown;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  org_id: string;
  form_id: string;
  version_number: number;
  snapshot_json: unknown;
  published_at: string;
  created_by: string | null;
  created_at: string;
};

type SubmissionRow = {
  id: string;
  org_id: string;
  form_id: string;
  version_id: string;
  submitted_by_user_id: string | null;
  status: SubmissionStatus;
  order_id: string | null;
  source_payment_status: string | null;
  admin_notes: string | null;
  sync_rev: number | string;
  answers_json: unknown;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

type SubmissionEntryRow = {
  id: string;
  submission_id: string;
  player_id: string;
  program_node_id: string | null;
  answers_json: unknown;
  created_at: string;
};

type SubmissionViewRow = {
  id: string;
  org_id: string;
  form_id: string;
  name: string;
  sort_index: number;
  visibility_scope: "private" | "forms_readers" | "specific_admin";
  target_user_id: string | null;
  config_json: unknown;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type GoogleSheetIntegrationRow = {
  id: string;
  org_id: string;
  form_id: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  status: "active" | "disabled" | "error";
  last_synced_at: string | null;
  last_error: string | null;
  created_by_user_id: string;
  created_at: string;
  updated_at: string;
};

type GoogleSheetSyncRunRow = {
  id: number;
  org_id: string;
  form_id: string;
  integration_id: string | null;
  trigger_source: "manual" | "webhook" | "cron" | "outbox";
  status: "running" | "ok" | "failed" | "partial";
  inbound_updates_count: number;
  inbound_creates_count: number;
  outbound_rows_count: number;
  conflicts_count: number;
  error_count: number;
  notes: string | null;
  started_at: string;
  completed_at: string | null;
  created_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapForm(row: OrgFormRow): OrgForm {
  return {
    id: row.id,
    orgId: row.org_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    formKind: row.form_kind,
    status: row.status,
    programId: row.program_id,
    targetMode: row.target_mode,
    lockedProgramNodeId: row.locked_program_node_id,
    schemaJson: parseFormSchema(row.schema_json, row.name, row.form_kind),
    uiJson: asObject(row.ui_json),
    settingsJson: asObject(row.settings_json),
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapVersion(row: VersionRow): OrgFormVersion {
  return {
    id: row.id,
    orgId: row.org_id,
    formId: row.form_id,
    versionNumber: row.version_number,
    snapshotJson: asObject(row.snapshot_json),
    publishedAt: row.published_at,
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

function mapSubmission(row: SubmissionRow): FormSubmission {
  return {
    id: row.id,
    orgId: row.org_id,
    formId: row.form_id,
    versionId: row.version_id,
    submittedByUserId: row.submitted_by_user_id,
    status: row.status,
    orderId: row.order_id,
    sourcePaymentStatus: row.source_payment_status,
    adminNotes: row.admin_notes,
    syncRev: Number(row.sync_rev ?? 0),
    answersJson: asObject(row.answers_json),
    metadataJson: asObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSubmissionEntry(row: SubmissionEntryRow): FormSubmissionEntry {
  return {
    id: row.id,
    submissionId: row.submission_id,
    playerId: row.player_id,
    programNodeId: row.program_node_id,
    answersJson: asObject(row.answers_json),
    createdAt: row.created_at
  };
}

function mapSubmissionView(row: SubmissionViewRow): OrgFormSubmissionView {
  return {
    id: row.id,
    orgId: row.org_id,
    formId: row.form_id,
    name: row.name,
    sortIndex: row.sort_index,
    visibilityScope: row.visibility_scope,
    targetUserId: row.target_user_id,
    configJson: asObject(row.config_json),
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapGoogleSheetIntegration(row: GoogleSheetIntegrationRow): OrgFormGoogleSheetIntegration {
  return {
    id: row.id,
    orgId: row.org_id,
    formId: row.form_id,
    spreadsheetId: row.spreadsheet_id,
    spreadsheetUrl: row.spreadsheet_url,
    status: row.status,
    lastSyncedAt: row.last_synced_at,
    lastError: row.last_error,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapGoogleSheetSyncRun(row: GoogleSheetSyncRunRow): OrgFormGoogleSheetSyncRun {
  return {
    id: row.id,
    orgId: row.org_id,
    formId: row.form_id,
    integrationId: row.integration_id,
    triggerSource: row.trigger_source,
    status: row.status,
    inboundUpdatesCount: row.inbound_updates_count,
    inboundCreatesCount: row.inbound_creates_count,
    outboundRowsCount: row.outbound_rows_count,
    conflictsCount: row.conflicts_count,
    errorCount: row.error_count,
    notes: row.notes,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

export async function listFormsForManage(orgId: string): Promise<OrgForm[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_forms")
    .select(formSelect)
    .eq("org_id", orgId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list forms: ${error.message}`);
  }

  return (data ?? []).map((row) => mapForm(row as OrgFormRow));
}

export async function getFormById(orgId: string, formId: string): Promise<OrgForm | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_forms")
    .select(formSelect)
    .eq("org_id", orgId)
    .eq("id", formId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load form: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapForm(data as OrgFormRow);
}

export async function getFormBySlug(orgId: string, formSlug: string, options?: { includeDraft?: boolean }): Promise<OrgForm | null> {
  const supabase = await createSupabaseServer();
  let query = supabase.schema("forms").from("org_forms").select(formSelect).eq("org_id", orgId).eq("slug", formSlug).limit(1);

  if (!options?.includeDraft) {
    query = query.eq("status", "published");
  }

  const { data, error } = await query.maybeSingle();

  if (error) {
    throw new Error(`Failed to load form: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapForm(data as OrgFormRow);
}

export async function createFormRecord(input: {
  orgId: string;
  createdByUserId: string;
  slug: string;
  name: string;
  description: string | null;
  formKind: FormKind;
  status: FormStatus;
  programId: string | null;
  targetMode: TargetMode;
  lockedProgramNodeId: string | null;
  settingsJson?: Record<string, unknown>;
}): Promise<OrgForm> {
  const supabase = await createSupabaseServer();
  const schema = createDefaultFormSchema(input.name, input.formKind);
  const { data, error } = await supabase
    .schema("forms").from("org_forms")
    .insert({
      org_id: input.orgId,
      created_by: input.createdByUserId,
      slug: input.slug,
      name: input.name,
      description: input.description,
      form_kind: input.formKind,
      status: input.status,
      program_id: input.programId,
      target_mode: input.targetMode,
      locked_program_node_id: input.lockedProgramNodeId,
      schema_json: schema,
      ui_json: {},
      settings_json: input.settingsJson ?? {}
    })
    .select(formSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create form: ${error.message}`);
  }

  return mapForm(data as OrgFormRow);
}

export async function updateFormRecord(input: {
  orgId: string;
  formId: string;
  slug: string;
  name: string;
  description: string | null;
  formKind: FormKind;
  status: FormStatus;
  programId: string | null;
  targetMode: TargetMode;
  lockedProgramNodeId: string | null;
  schemaJson: Record<string, unknown>;
  settingsJson?: Record<string, unknown>;
}): Promise<OrgForm> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_forms")
    .update({
      slug: input.slug,
      name: input.name,
      description: input.description,
      form_kind: input.formKind,
      status: input.status,
      program_id: input.programId,
      target_mode: input.targetMode,
      locked_program_node_id: input.lockedProgramNodeId,
      schema_json: input.schemaJson,
      settings_json: input.settingsJson ?? {}
    })
    .eq("org_id", input.orgId)
    .eq("id", input.formId)
    .select(formSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update form: ${error.message}`);
  }

  return mapForm(data as OrgFormRow);
}

export async function getLatestFormVersion(formId: string): Promise<OrgFormVersion | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_versions")
    .select(versionSelect)
    .eq("form_id", formId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load form version: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapVersion(data as VersionRow);
}

export async function publishFormVersionRecord(input: {
  orgId: string;
  formId: string;
  createdByUserId: string;
  snapshotJson: Record<string, unknown>;
}): Promise<OrgFormVersion> {
  const latest = await getLatestFormVersion(input.formId);
  const nextVersionNumber = (latest?.versionNumber ?? 0) + 1;

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_versions")
    .insert({
      org_id: input.orgId,
      form_id: input.formId,
      version_number: nextVersionNumber,
      snapshot_json: input.snapshotJson,
      created_by: input.createdByUserId
    })
    .select(versionSelect)
    .single();

  if (error) {
    throw new Error(`Failed to publish form: ${error.message}`);
  }

  return mapVersion(data as VersionRow);
}

export async function listFormSubmissions(orgId: string, formId: string): Promise<FormSubmission[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_submissions")
    .select(submissionSelect)
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list submissions: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSubmission(row as SubmissionRow));
}

export async function listFormSubmissionsWithEntries(orgId: string, formId: string): Promise<FormSubmissionWithEntries[]> {
  const submissions = await listFormSubmissions(orgId, formId);

  if (submissions.length === 0) {
    return [];
  }

  const submissionIds = submissions.map((submission) => submission.id);
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_form_submission_entries")
    .select(submissionEntrySelect)
    .in("submission_id", submissionIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list submission entries: ${error.message}`);
  }

  const entryMap = new Map<string, FormSubmissionEntry[]>();

  for (const row of data ?? []) {
    const entry = mapSubmissionEntry(row as SubmissionEntryRow);
    const existingEntries = entryMap.get(entry.submissionId);

    if (existingEntries) {
      existingEntries.push(entry);
    } else {
      entryMap.set(entry.submissionId, [entry]);
    }
  }

  return submissions.map((submission) => ({
    ...submission,
    entries: entryMap.get(submission.id) ?? []
  }));
}

export async function listSubmissionEntries(submissionId: string): Promise<FormSubmissionEntry[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_form_submission_entries")
    .select(submissionEntrySelect)
    .eq("submission_id", submissionId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list submission entries: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSubmissionEntry(row as SubmissionEntryRow));
}

export async function setFormSubmissionStatus(input: { orgId: string; submissionId: string; status: SubmissionStatus }) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_submissions")
    .update({ status: input.status })
    .eq("org_id", input.orgId)
    .eq("id", input.submissionId)
    .select(submissionSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update submission status: ${error.message}`);
  }

  await supabase
    .schema("programs").from("program_registrations")
    .update({ status: input.status })
    .eq("org_id", input.orgId)
    .eq("submission_id", input.submissionId);

  const { data: registrations, error: registrationError } = await supabase
    .schema("programs").from("program_registrations")
    .select("id")
    .eq("org_id", input.orgId)
    .eq("submission_id", input.submissionId);

  if (!registrationError) {
    const registrationIds = (registrations ?? []).map((row) => row.id).filter(Boolean);
    if (registrationIds.length > 0) {
      const teamStatus =
        input.status === "approved"
          ? "active"
          : input.status === "waitlisted"
            ? "waitlisted"
            : input.status === "submitted" || input.status === "in_review"
              ? "pending"
              : "removed";

      await supabase.schema("programs").from("program_team_members").update({ status: teamStatus }).in("registration_id", registrationIds);
    }
  }

  return mapSubmission(data as SubmissionRow);
}

export async function deleteFormSubmissionRecord(input: { orgId: string; formId: string; submissionId: string }) {
  const supabase = await createSupabaseServer();
  const { error, count } = await supabase
    .schema("forms").from("org_form_submissions")
    .delete({ count: "exact" })
    .eq("org_id", input.orgId)
    .eq("form_id", input.formId)
    .eq("id", input.submissionId);

  if (error) {
    throw new Error(`Failed to delete submission: ${error.message}`);
  }

  return (count ?? 0) > 0;
}

export async function updateFormSubmissionAnswersJson(input: {
  orgId: string;
  submissionId: string;
  answersJson: Record<string, unknown>;
}) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_submissions")
    .update({ answers_json: input.answersJson })
    .eq("org_id", input.orgId)
    .eq("id", input.submissionId)
    .select(submissionSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update submission answers: ${error.message}`);
  }

  return mapSubmission(data as SubmissionRow);
}

export async function updateFormSubmissionAdminNotes(input: {
  orgId: string;
  submissionId: string;
  adminNotes: string | null;
}) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_submissions")
    .update({ admin_notes: input.adminNotes })
    .eq("org_id", input.orgId)
    .eq("id", input.submissionId)
    .select(submissionSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update submission notes: ${error.message}`);
  }

  return mapSubmission(data as SubmissionRow);
}

export async function updateFormSubmissionEntryAnswersJson(input: {
  submissionEntryId: string;
  answersJson: Record<string, unknown>;
}) {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_form_submission_entries")
    .update({ answers_json: input.answersJson })
    .eq("id", input.submissionEntryId)
    .select(submissionEntrySelect)
    .single();

  if (error) {
    throw new Error(`Failed to update submission entry answers: ${error.message}`);
  }

  return mapSubmissionEntry(data as SubmissionEntryRow);
}

export async function listFormsForProgram(orgId: string, programId: string): Promise<OrgForm[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_forms")
    .select(formSelect)
    .eq("org_id", orgId)
    .eq("program_id", programId)
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list forms for program: ${error.message}`);
  }

  return (data ?? []).map((row) => mapForm(row as OrgFormRow));
}

export async function listPublishedFormsForProgram(orgId: string, programId: string): Promise<OrgForm[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_forms")
    .select(formSelect)
    .eq("org_id", orgId)
    .eq("program_id", programId)
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list published forms: ${error.message}`);
  }

  return (data ?? []).map((row) => mapForm(row as OrgFormRow));
}

export async function listPublishedFormsForOrg(orgId: string): Promise<OrgForm[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_forms")
    .select(formSelect)
    .eq("org_id", orgId)
    .eq("status", "published")
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list published forms: ${error.message}`);
  }

  return (data ?? []).map((row) => mapForm(row as OrgFormRow));
}

export async function listFormSubmissionViews(orgId: string, formId: string): Promise<OrgFormSubmissionView[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_submission_views")
    .select(submissionViewSelect)
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .order("sort_index", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Failed to list submission views: ${error.message}`);
  }

  return (data ?? []).map((row) => mapSubmissionView(row as SubmissionViewRow));
}

export async function createFormSubmissionViewRecord(input: {
  orgId: string;
  formId: string;
  name: string;
  visibilityScope: "private" | "forms_readers" | "specific_admin";
  targetUserId: string | null;
  sortIndex?: number;
  configJson: Record<string, unknown>;
  createdByUserId: string;
}): Promise<OrgFormSubmissionView> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_submission_views")
    .insert({
      org_id: input.orgId,
      form_id: input.formId,
      name: input.name,
      visibility_scope: input.visibilityScope,
      target_user_id: input.targetUserId,
      sort_index: typeof input.sortIndex === "number" ? input.sortIndex : undefined,
      config_json: input.configJson,
      created_by_user_id: input.createdByUserId
    })
    .select(submissionViewSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create submission view: ${error.message}`);
  }

  return mapSubmissionView(data as SubmissionViewRow);
}

export async function updateFormSubmissionViewConfigRecord(input: {
  orgId: string;
  formId: string;
  viewId: string;
  configJson: Record<string, unknown>;
}): Promise<OrgFormSubmissionView> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_submission_views")
    .update({
      config_json: input.configJson
    })
    .eq("org_id", input.orgId)
    .eq("form_id", input.formId)
    .eq("id", input.viewId)
    .select(submissionViewSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update submission view: ${error.message}`);
  }

  return mapSubmissionView(data as SubmissionViewRow);
}

export async function updateFormSubmissionViewRecord(input: {
  orgId: string;
  formId: string;
  viewId: string;
  name: string;
  visibilityScope: "private" | "forms_readers" | "specific_admin";
  targetUserId: string | null;
  sortIndex?: number;
}): Promise<OrgFormSubmissionView> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_submission_views")
    .update({
      name: input.name,
      sort_index: typeof input.sortIndex === "number" ? input.sortIndex : undefined,
      visibility_scope: input.visibilityScope,
      target_user_id: input.targetUserId
    })
    .eq("org_id", input.orgId)
    .eq("form_id", input.formId)
    .eq("id", input.viewId)
    .select(submissionViewSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update submission view: ${error.message}`);
  }

  return mapSubmissionView(data as SubmissionViewRow);
}

export async function deleteFormSubmissionViewRecord(input: { orgId: string; formId: string; viewId: string }): Promise<void> {
  const supabase = await createSupabaseServer();
  const { error } = await supabase
    .schema("forms").from("org_form_submission_views")
    .delete()
    .eq("org_id", input.orgId)
    .eq("form_id", input.formId)
    .eq("id", input.viewId);

  if (error) {
    throw new Error(`Failed to delete submission view: ${error.message}`);
  }
}

export async function updateFormSubmissionViewsOrderRecord(input: {
  orgId: string;
  formId: string;
  viewOrder: string[];
}): Promise<void> {
  const supabase = await createSupabaseServer();

  for (const [index, viewId] of input.viewOrder.entries()) {
    const { error } = await supabase
      .schema("forms").from("org_form_submission_views")
      .update({ sort_index: index })
      .eq("org_id", input.orgId)
      .eq("form_id", input.formId)
      .eq("id", viewId);

    if (error) {
      throw new Error(`Failed to reorder submission views: ${error.message}`);
    }
  }
}

export async function getFormGoogleSheetIntegration(orgId: string, formId: string): Promise<OrgFormGoogleSheetIntegration | null> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_google_sheet_integrations")
    .select(googleSheetIntegrationSelect)
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Sheets integration: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapGoogleSheetIntegration(data as GoogleSheetIntegrationRow);
}

export async function upsertFormGoogleSheetIntegrationRecord(input: {
  orgId: string;
  formId: string;
  spreadsheetId: string;
  spreadsheetUrl: string;
  createdByUserId: string;
  status?: "active" | "disabled" | "error";
  lastError?: string | null;
  lastSyncedAt?: string | null;
}): Promise<OrgFormGoogleSheetIntegration> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_google_sheet_integrations")
    .upsert(
      {
        org_id: input.orgId,
        form_id: input.formId,
        spreadsheet_id: input.spreadsheetId,
        spreadsheet_url: input.spreadsheetUrl,
        created_by_user_id: input.createdByUserId,
        status: input.status ?? "active",
        last_error: input.lastError ?? null,
        last_synced_at: input.lastSyncedAt ?? null
      },
      {
        onConflict: "org_id,form_id"
      }
    )
    .select(googleSheetIntegrationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to save Sheets integration: ${error.message}`);
  }

  return mapGoogleSheetIntegration(data as GoogleSheetIntegrationRow);
}

export async function updateFormGoogleSheetIntegrationRecord(input: {
  orgId: string;
  formId: string;
  status?: "active" | "disabled" | "error";
  spreadsheetId?: string;
  spreadsheetUrl?: string;
  lastError?: string | null;
  lastSyncedAt?: string | null;
}): Promise<OrgFormGoogleSheetIntegration | null> {
  const payload: Record<string, unknown> = {};
  if (input.status) {
    payload.status = input.status;
  }
  if (typeof input.spreadsheetId === "string") {
    payload.spreadsheet_id = input.spreadsheetId;
  }
  if (typeof input.spreadsheetUrl === "string") {
    payload.spreadsheet_url = input.spreadsheetUrl;
  }
  if ("lastError" in input) {
    payload.last_error = input.lastError ?? null;
  }
  if ("lastSyncedAt" in input) {
    payload.last_synced_at = input.lastSyncedAt ?? null;
  }

  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_google_sheet_integrations")
    .update(payload)
    .eq("org_id", input.orgId)
    .eq("form_id", input.formId)
    .select(googleSheetIntegrationSelect)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to update Sheets integration: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  return mapGoogleSheetIntegration(data as GoogleSheetIntegrationRow);
}

export async function listRecentFormGoogleSheetSyncRuns(
  orgId: string,
  formId: string,
  options?: { limit?: number }
): Promise<OrgFormGoogleSheetSyncRun[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .schema("forms").from("org_form_google_sheet_sync_runs")
    .select(googleSheetSyncRunSelect)
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .order("started_at", { ascending: false })
    .limit(Math.min(Math.max(options?.limit ?? 10, 1), 50));

  if (error) {
    throw new Error(`Failed to load Sheets sync runs: ${error.message}`);
  }

  return (data ?? []).map((row) => mapGoogleSheetSyncRun(row as GoogleSheetSyncRunRow));
}
