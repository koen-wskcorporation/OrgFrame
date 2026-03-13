import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import {
  batchUpdateSpreadsheet,
  clearSheetRange,
  createSpreadsheet,
  createSpreadsheetWithAccessToken,
  getSpreadsheetMetadata,
  getSheetValues,
  isGoogleSheetsConfigured,
  shareSpreadsheetWithUser,
  shareSpreadsheetWithUserAccessToken,
  updateSheetValues
} from "@/lib/integrations/google-sheets/client";
import { parseFormSchema } from "@/modules/forms/schema";
import {
  GOOGLE_SHEET_BASE_READ_COLUMNS,
  GOOGLE_SHEET_ENTRY_BASE_COLUMNS,
  GOOGLE_SHEET_ENTRY_LINK_COLUMNS,
  GOOGLE_SHEET_ENTRY_SYSTEM_COLUMNS,
  GOOGLE_SHEET_LINK_COLUMNS,
  GOOGLE_SHEET_MUTABLE_COLUMNS,
  GOOGLE_SHEET_SUBMISSION_STATUS_VALUES,
  GOOGLE_SHEET_SYSTEM_COLUMNS,
  GOOGLE_SHEETS_TAB_ENTRIES,
  GOOGLE_SHEETS_TAB_SUBMISSIONS,
  buildRowHash,
  normalizeAdminNotes,
  normalizeSheetCell,
  normalizeSubmissionStatus,
  parseSheetSyncRev
} from "@/modules/forms/integrations/google-sheets/schema";
import type { SubmissionStatus } from "@/modules/forms/types";

type IntegrationRow = {
  id: string;
  org_id: string;
  form_id: string;
  spreadsheet_id: string;
  spreadsheet_url: string;
  status: "active" | "disabled" | "error";
  last_synced_at: string | null;
  last_error: string | null;
};

type FormRow = {
  id: string;
  org_id: string;
  name: string;
  form_kind: "generic" | "program_registration";
  schema_json: unknown;
};

type SubmissionRow = {
  id: string;
  org_id: string;
  form_id: string;
  version_id: string;
  status: SubmissionStatus;
  admin_notes: string | null;
  sync_rev: number;
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

type VersionRow = {
  id: string;
};

type SyncRunTrigger = "manual" | "webhook" | "cron" | "outbox";

type SyncFormInput = {
  orgId: string;
  formId: string;
  trigger: SyncRunTrigger;
  allowInbound: boolean;
  allowOutbound: boolean;
};

type SyncStats = {
  inboundUpdatesCount: number;
  inboundCreatesCount: number;
  outboundRowsCount: number;
  conflictsCount: number;
  errorCount: number;
  notes: string[];
};

type SheetColumnSet = {
  submissionHeaders: string[];
  submissionAnswerFields: string[];
  entryHeaders: string[];
  entryAnswerFields: string[];
};

type EnsureResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  submissionsSheetId: number;
  entriesSheetId: number;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function parseFieldNames(schemaJson: unknown, formKind: FormRow["form_kind"]): string[] {
  const schema = parseFormSchema(schemaJson, "Form", formKind);
  const fieldNames: string[] = [];
  const seen = new Set<string>();

  schema.pages.forEach((page) => {
    page.fields.forEach((field) => {
      if (!field.name || seen.has(field.name)) {
        return;
      }

      seen.add(field.name);
      fieldNames.push(field.name);
    });
  });

  return fieldNames;
}

function toIsoNow() {
  return new Date().toISOString();
}

function normalizeOrigin(value: string | null | undefined): string {
  if (!value) {
    return "";
  }

  return value.trim().replace(/\/+$/, "");
}

function resolveAppOrigin(): string {
  const configured = normalizeOrigin(process.env.NEXT_PUBLIC_SITE_URL || process.env.SITE_URL);
  if (configured) {
    return configured;
  }

  return "http://localhost:3000";
}

function resolveGoogleSheetsServiceAccountEmail(): string | null {
  const candidates = [
    process.env.GCP_SERVICE_ACCOUNT_EMAIL,
    process.env.GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL,
    process.env.GOOGLE_SHEETS_RUNTIME_SERVICE_ACCOUNT_EMAIL
  ];

  for (const candidate of candidates) {
    const trimmed = candidate?.trim();
    if (trimmed) {
      return trimmed;
    }
  }

  return null;
}

function buildSubmissionManageUrl(input: {
  appOrigin: string;
  orgSlug: string;
  formId: string;
  submissionId: string;
  entryId?: string | null;
  section?: string;
}): string {
  const params = new URLSearchParams({
    submissionId: input.submissionId
  });

  if (input.entryId) {
    params.set("entryId", input.entryId);
  }

  if (input.section) {
    params.set("section", input.section);
  }

  const basePath = `/${input.orgSlug}/tools/forms/${input.formId}/submissions`;
  return `${input.appOrigin}${basePath}?${params.toString()}`;
}

async function insertSyncRun(input: {
  orgId: string;
  formId: string;
  integrationId: string | null;
  trigger: SyncRunTrigger;
}): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("org_form_google_sheet_sync_runs")
    .insert({
      org_id: input.orgId,
      form_id: input.formId,
      integration_id: input.integrationId,
      trigger_source: input.trigger,
      status: "running"
    })
    .select("id")
    .single();

  if (error || !data) {
    throw new Error(`Failed to create Sheets sync run: ${error?.message ?? "missing row"}`);
  }

  return Number(data.id);
}

async function finishSyncRun(
  runId: number,
  stats: SyncStats,
  status: "ok" | "partial" | "failed",
  note: string | null
): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();

  await supabase
    .from("org_form_google_sheet_sync_runs")
    .update({
      status,
      inbound_updates_count: stats.inboundUpdatesCount,
      inbound_creates_count: stats.inboundCreatesCount,
      outbound_rows_count: stats.outboundRowsCount,
      conflicts_count: stats.conflictsCount,
      error_count: stats.errorCount,
      notes: note,
      completed_at: toIsoNow()
    })
    .eq("id", runId);
}

async function loadForm(orgId: string, formId: string): Promise<FormRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("org_forms")
    .select("id, org_id, name, form_kind, schema_json")
    .eq("org_id", orgId)
    .eq("id", formId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load form for Sheets sync: ${error.message}`);
  }

  return (data as FormRow | null) ?? null;
}

async function loadOrgSlug(orgId: string): Promise<string | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.from("orgs").select("slug").eq("id", orgId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load org slug for Sheets sync: ${error.message}`);
  }

  const slug = typeof data?.slug === "string" ? data.slug.trim() : "";
  return slug || null;
}

async function loadIntegration(orgId: string, formId: string): Promise<IntegrationRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("org_form_google_sheet_integrations")
    .select("id, org_id, form_id, spreadsheet_id, spreadsheet_url, status, last_synced_at, last_error")
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load Sheets integration: ${error.message}`);
  }

  return (data as IntegrationRow | null) ?? null;
}

async function updateIntegrationState(input: {
  orgId: string;
  formId: string;
  status?: "active" | "disabled" | "error";
  lastError?: string | null;
  lastSyncedAt?: string | null;
}): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (input.status) {
    payload.status = input.status;
  }
  if ("lastError" in input) {
    payload.last_error = input.lastError ?? null;
  }
  if ("lastSyncedAt" in input) {
    payload.last_synced_at = input.lastSyncedAt ?? null;
  }

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("org_form_google_sheet_integrations")
    .update(payload)
    .eq("org_id", input.orgId)
    .eq("form_id", input.formId);

  if (error) {
    throw new Error(`Failed to update Sheets integration state: ${error.message}`);
  }
}

async function ensureSpreadsheetStructure(
  integration: IntegrationRow,
  columns: SheetColumnSet,
  formKind: FormRow["form_kind"]
): Promise<EnsureResult> {
  let metadata = await getSpreadsheetMetadata(integration.spreadsheet_id);

  const sheetByTitle = new Map(metadata.sheets.map((sheet) => [sheet.properties.title, sheet]));
  const addSheetRequests: Array<Record<string, unknown>> = [];

  if (!sheetByTitle.has(GOOGLE_SHEETS_TAB_SUBMISSIONS)) {
    addSheetRequests.push({
      addSheet: {
        properties: {
          title: GOOGLE_SHEETS_TAB_SUBMISSIONS
        }
      }
    });
  }

  if (!sheetByTitle.has(GOOGLE_SHEETS_TAB_ENTRIES)) {
    addSheetRequests.push({
      addSheet: {
        properties: {
          title: GOOGLE_SHEETS_TAB_ENTRIES,
          hidden: formKind === "generic"
        }
      }
    });
  }

  if (addSheetRequests.length > 0) {
    await batchUpdateSpreadsheet(integration.spreadsheet_id, addSheetRequests);
    metadata = await getSpreadsheetMetadata(integration.spreadsheet_id);
  }

  const latestByTitle = new Map(metadata.sheets.map((sheet) => [sheet.properties.title, sheet]));
  const submissionsSheet = latestByTitle.get(GOOGLE_SHEETS_TAB_SUBMISSIONS);
  const entriesSheet = latestByTitle.get(GOOGLE_SHEETS_TAB_ENTRIES);

  if (!submissionsSheet || !entriesSheet) {
    throw new Error("Google spreadsheet is missing required tabs.");
  }

  const submissionsSheetId = submissionsSheet.properties.sheetId;
  const entriesSheetId = entriesSheet.properties.sheetId;

  const managedProtectionPrefix = "sports-saas:";
  const requests: Array<Record<string, unknown>> = [];

  [submissionsSheet, entriesSheet].forEach((sheet) => {
    (sheet.protectedRanges ?? []).forEach((range) => {
      if (typeof range.protectedRangeId === "number" && String(range.description ?? "").startsWith(managedProtectionPrefix)) {
        requests.push({
          deleteProtectedRange: {
            protectedRangeId: range.protectedRangeId
          }
        });
      }
    });
  });

  requests.push(
    {
      updateSheetProperties: {
        properties: {
          sheetId: submissionsSheetId,
          gridProperties: {
            frozenRowCount: 2
          }
        },
        fields: "gridProperties.frozenRowCount"
      }
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId: entriesSheetId,
          hidden: formKind === "generic",
          gridProperties: {
            frozenRowCount: 2
          }
        },
        fields: "hidden,gridProperties.frozenRowCount"
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: submissionsSheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: GOOGLE_SHEET_SYSTEM_COLUMNS.length
        },
        properties: {
          hiddenByUser: true
        },
        fields: "hiddenByUser"
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: entriesSheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: GOOGLE_SHEET_ENTRY_SYSTEM_COLUMNS.length
        },
        properties: {
          hiddenByUser: true
        },
        fields: "hiddenByUser"
      }
    }
  );

  const statusColumnIndex = GOOGLE_SHEET_SYSTEM_COLUMNS.length;
  const adminNotesColumnIndex = statusColumnIndex + 1;
  const submissionsColumnCount = columns.submissionHeaders.length;
  const entriesColumnCount = columns.entryHeaders.length;

  requests.push({
    setDataValidation: {
      range: {
        sheetId: submissionsSheetId,
        startRowIndex: 2,
        startColumnIndex: statusColumnIndex,
        endColumnIndex: statusColumnIndex + 1
      },
      rule: {
        condition: {
          type: "ONE_OF_LIST",
          values: GOOGLE_SHEET_SUBMISSION_STATUS_VALUES.map((value) => ({ userEnteredValue: value }))
        },
        strict: true,
        showCustomUi: true
      }
    }
  });

  requests.push(
    {
      repeatCell: {
        range: {
          sheetId: submissionsSheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: submissionsColumnCount
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true
            },
            backgroundColor: {
              red: 0.95,
              green: 0.96,
              blue: 0.98
            }
          }
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)"
      }
    },
    {
      repeatCell: {
        range: {
          sheetId: submissionsSheetId,
          startRowIndex: 2,
          startColumnIndex: statusColumnIndex,
          endColumnIndex: adminNotesColumnIndex + 1
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: {
              red: 0.93,
              green: 0.97,
              blue: 1
            }
          }
        },
        fields: "userEnteredFormat(backgroundColor)"
      }
    },
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId: submissionsSheetId,
            startRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: submissionsColumnCount
          }
        }
      }
    },
    {
      addProtectedRange: {
        protectedRange: {
          description: `${managedProtectionPrefix}submissions-sheet`,
          warningOnly: false,
          range: {
            sheetId: submissionsSheetId
          },
          unprotectedRanges: [
            {
              sheetId: submissionsSheetId,
              startRowIndex: 2,
              startColumnIndex: statusColumnIndex,
              endColumnIndex: adminNotesColumnIndex + 1
            }
          ]
        }
      }
    },
    {
      repeatCell: {
        range: {
          sheetId: entriesSheetId,
          startRowIndex: 1,
          endRowIndex: 2,
          startColumnIndex: 0,
          endColumnIndex: entriesColumnCount
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              bold: true
            },
            backgroundColor: {
              red: 0.95,
              green: 0.96,
              blue: 0.98
            }
          }
        },
        fields: "userEnteredFormat(textFormat,backgroundColor)"
      }
    },
    {
      setBasicFilter: {
        filter: {
          range: {
            sheetId: entriesSheetId,
            startRowIndex: 1,
            startColumnIndex: 0,
            endColumnIndex: entriesColumnCount
          }
        }
      }
    },
    {
      addProtectedRange: {
        protectedRange: {
          description: `${managedProtectionPrefix}entries-sheet`,
          warningOnly: false,
          range: {
            sheetId: entriesSheetId
          }
        }
      }
    }
  );

  await batchUpdateSpreadsheet(integration.spreadsheet_id, requests);

  return {
    spreadsheetId: integration.spreadsheet_id,
    spreadsheetUrl: integration.spreadsheet_url,
    submissionsSheetId,
    entriesSheetId
  };
}

async function loadSubmissionsWithEntries(orgId: string, formId: string): Promise<{
  submissions: SubmissionRow[];
  entriesBySubmissionId: Map<string, SubmissionEntryRow[]>;
}> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: submissionRows, error: submissionError } = await supabase
    .from("org_form_submissions")
    .select("id, org_id, form_id, version_id, status, admin_notes, sync_rev, answers_json, metadata_json, created_at, updated_at")
    .eq("org_id", orgId)
    .eq("form_id", formId)
    .order("created_at", { ascending: false });

  if (submissionError) {
    throw new Error(`Failed to list submissions for Sheets sync: ${submissionError.message}`);
  }

  const submissions = (submissionRows ?? []) as SubmissionRow[];
  const submissionIds = submissions.map((row) => row.id);
  const entriesBySubmissionId = new Map<string, SubmissionEntryRow[]>();

  if (submissionIds.length > 0) {
    const { data: entryRows, error: entryError } = await supabase
      .from("org_form_submission_entries")
      .select("id, submission_id, player_id, program_node_id, answers_json, created_at")
      .in("submission_id", submissionIds)
      .order("created_at", { ascending: true });

    if (entryError) {
      throw new Error(`Failed to list entry rows for Sheets sync: ${entryError.message}`);
    }

    (entryRows ?? []).forEach((entryRaw) => {
      const entry = entryRaw as SubmissionEntryRow;
      const existing = entriesBySubmissionId.get(entry.submission_id);
      if (existing) {
        existing.push(entry);
      } else {
        entriesBySubmissionId.set(entry.submission_id, [entry]);
      }
    });
  }

  return {
    submissions,
    entriesBySubmissionId
  };
}

function buildColumnSet(form: FormRow): SheetColumnSet {
  const answerFields = parseFieldNames(form.schema_json, form.form_kind);

  return {
    submissionHeaders: [
      ...GOOGLE_SHEET_SYSTEM_COLUMNS,
      ...GOOGLE_SHEET_MUTABLE_COLUMNS,
      ...GOOGLE_SHEET_LINK_COLUMNS,
      ...GOOGLE_SHEET_BASE_READ_COLUMNS,
      ...answerFields
    ],
    submissionAnswerFields: answerFields,
    entryHeaders: [
      ...GOOGLE_SHEET_ENTRY_SYSTEM_COLUMNS,
      ...GOOGLE_SHEET_ENTRY_BASE_COLUMNS,
      ...GOOGLE_SHEET_ENTRY_LINK_COLUMNS,
      ...answerFields
    ],
    entryAnswerFields: answerFields
  };
}

function buildSubmissionRow(input: {
  orgSlug: string;
  appOrigin: string;
  formId: string;
  submission: SubmissionRow;
  answerFields: string[];
  syncedAt: string;
}): Array<string | number> {
  const answers = asObject(input.submission.answers_json);
  const submissionUrl = buildSubmissionManageUrl({
    appOrigin: input.appOrigin,
    orgSlug: input.orgSlug,
    formId: input.formId,
    submissionId: input.submission.id
  });
  const playersLinkedUrl = buildSubmissionManageUrl({
    appOrigin: input.appOrigin,
    orgSlug: input.orgSlug,
    formId: input.formId,
    submissionId: input.submission.id,
    section: "players"
  });

  const rowHash = buildRowHash([
    input.submission.id,
    input.submission.sync_rev,
    input.submission.status,
    input.submission.admin_notes,
    input.submission.created_at,
    input.submission.updated_at,
    JSON.stringify(answers)
  ]);

  return [
    input.submission.id,
    input.submission.sync_rev,
    rowHash,
    input.syncedAt,
    input.formId,
    input.submission.status,
    input.submission.admin_notes ?? "",
    playersLinkedUrl,
    submissionUrl,
    input.submission.created_at,
    input.submission.updated_at,
    ...input.answerFields.map((field) => normalizeSheetCell(answers[field]))
  ];
}

function buildEntryRow(input: {
  orgSlug: string;
  appOrigin: string;
  formId: string;
  submission: SubmissionRow;
  entry: SubmissionEntryRow;
  answerFields: string[];
  syncedAt: string;
}): Array<string | number> {
  const answers = asObject(input.entry.answers_json);
  const entryManageUrl = buildSubmissionManageUrl({
    appOrigin: input.appOrigin,
    orgSlug: input.orgSlug,
    formId: input.formId,
    submissionId: input.submission.id,
    entryId: input.entry.id,
    section: "players"
  });
  const entryActionsUrl = buildSubmissionManageUrl({
    appOrigin: input.appOrigin,
    orgSlug: input.orgSlug,
    formId: input.formId,
    submissionId: input.submission.id,
    entryId: input.entry.id
  });

  const rowHash = buildRowHash([
    input.entry.id,
    input.submission.id,
    input.submission.sync_rev,
    input.entry.player_id,
    input.entry.program_node_id,
    input.entry.created_at,
    JSON.stringify(answers)
  ]);

  return [
    input.entry.id,
    input.submission.id,
    input.submission.sync_rev,
    rowHash,
    input.syncedAt,
    input.formId,
    input.entry.player_id,
    input.entry.program_node_id ?? "",
    input.entry.created_at,
    entryManageUrl,
    entryActionsUrl,
    ...input.answerFields.map((field) => normalizeSheetCell(answers[field]))
  ];
}

async function writeCanonicalSheets(input: {
  orgSlug: string;
  appOrigin: string;
  form: FormRow;
  integration: IntegrationRow;
  columns: SheetColumnSet;
  submissions: SubmissionRow[];
  entriesBySubmissionId: Map<string, SubmissionEntryRow[]>;
  stats: SyncStats;
}): Promise<void> {
  const syncedAt = toIsoNow();
  const warning =
    "Managed by Sports SaaS. Edit only 'status' and 'admin_notes' on existing rows. Do not add/delete columns. Link columns open managed views in the app.";

  const submissionRows = input.submissions.map((submission) => {
    return buildSubmissionRow({
      orgSlug: input.orgSlug,
      appOrigin: input.appOrigin,
      formId: input.form.id,
      submission,
      answerFields: input.columns.submissionAnswerFields,
      syncedAt
    });
  });

  const entryRows = input.submissions.flatMap((submission) => {
    const entries = input.entriesBySubmissionId.get(submission.id) ?? [];
    return entries.map((entry) =>
      buildEntryRow({
        orgSlug: input.orgSlug,
        appOrigin: input.appOrigin,
        formId: input.form.id,
        submission,
        entry,
        answerFields: input.columns.entryAnswerFields,
        syncedAt
      })
    );
  });

  await clearSheetRange(input.integration.spreadsheet_id, `${GOOGLE_SHEETS_TAB_SUBMISSIONS}!A1:ZZ`);
  await updateSheetValues({
    spreadsheetId: input.integration.spreadsheet_id,
    range: `${GOOGLE_SHEETS_TAB_SUBMISSIONS}!A1`,
    valueInputOption: "RAW",
    values: [[warning], input.columns.submissionHeaders, ...submissionRows]
  });

  await clearSheetRange(input.integration.spreadsheet_id, `${GOOGLE_SHEETS_TAB_ENTRIES}!A1:ZZ`);
  await updateSheetValues({
    spreadsheetId: input.integration.spreadsheet_id,
    range: `${GOOGLE_SHEETS_TAB_ENTRIES}!A1`,
    valueInputOption: "RAW",
    values: [[warning], input.columns.entryHeaders, ...entryRows]
  });

  input.stats.outboundRowsCount = submissionRows.length + entryRows.length;
}

async function applyInboundSubmissions(input: {
  form: FormRow;
  integration: IntegrationRow;
  columns: SheetColumnSet;
  stats: SyncStats;
}): Promise<void> {
  const values = await getSheetValues(input.integration.spreadsheet_id, `${GOOGLE_SHEETS_TAB_SUBMISSIONS}!A1:ZZ`);
  if (values.length < 2) {
    return;
  }

  const headers = values[1] ?? [];
  const headerIndex = new Map(headers.map((header, index) => [header.trim(), index]));

  const submissionIdIndex = headerIndex.get("app_submission_id");
  const syncRevIndex = headerIndex.get("app_sync_rev");
  const statusIndex = headerIndex.get("status");
  const adminNotesIndex = headerIndex.get("admin_notes");

  if (
    typeof submissionIdIndex !== "number" ||
    typeof syncRevIndex !== "number" ||
    typeof statusIndex !== "number" ||
    typeof adminNotesIndex !== "number"
  ) {
    input.stats.errorCount += 1;
    input.stats.notes.push("Submissions tab is missing required managed columns.");
    return;
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: dbRows, error: dbError } = await supabase
    .from("org_form_submissions")
    .select("id, sync_rev, status, admin_notes")
    .eq("org_id", input.form.org_id)
    .eq("form_id", input.form.id);

  if (dbError) {
    throw new Error(`Failed to load submissions during inbound sync: ${dbError.message}`);
  }

  const dbById = new Map<string, { sync_rev: number; status: SubmissionStatus; admin_notes: string | null }>(
    (dbRows ?? []).map((row) => [String(row.id), {
      sync_rev: Number(row.sync_rev ?? 0),
      status: String(row.status ?? "submitted") as SubmissionStatus,
      admin_notes: typeof row.admin_notes === "string" ? row.admin_notes : null
    }])
  );

  let latestVersionId: string | null = null;
  if (input.form.form_kind === "generic") {
    const { data: versionRows, error: versionError } = await supabase
      .from("org_form_versions")
      .select("id")
      .eq("form_id", input.form.id)
      .order("version_number", { ascending: false })
      .limit(1);

    if (versionError) {
      throw new Error(`Failed to load latest form version for sheet create: ${versionError.message}`);
    }

    latestVersionId = ((versionRows ?? [])[0] as VersionRow | undefined)?.id ?? null;
  }

  const dataRows = values.slice(2);
  for (const [index, row] of dataRows.entries()) {
    const submissionId = String(row[submissionIdIndex] ?? "").trim();
    const syncRev = parseSheetSyncRev(row[syncRevIndex]);
    const statusRaw = String(row[statusIndex] ?? "").trim();
    const status = normalizeSubmissionStatus(statusRaw);
    const adminNotes = normalizeAdminNotes(row[adminNotesIndex]);

    const hasEditablePayload = Boolean(status) || Boolean(adminNotes);
    const sheetRowNumber = index + 3;

    if (!submissionId) {
      if (statusRaw.length > 0 && !status) {
        input.stats.errorCount += 1;
        input.stats.notes.push(`Ignored row ${sheetRowNumber}: invalid status value '${statusRaw}'.`);
        continue;
      }

      if (!hasEditablePayload) {
        continue;
      }

      if (input.form.form_kind !== "generic") {
        input.stats.conflictsCount += 1;
        input.stats.notes.push(`Ignored row ${sheetRowNumber}: sheet row create is disabled for program registration forms.`);
        continue;
      }

      if (!latestVersionId) {
        input.stats.errorCount += 1;
        input.stats.notes.push(`Ignored row ${sheetRowNumber}: latest form version not found.`);
        continue;
      }

      const createStatus = status ?? "submitted";
      const { error: insertError } = await supabase.from("org_form_submissions").insert({
        org_id: input.form.org_id,
        form_id: input.form.id,
        version_id: latestVersionId,
        submitted_by_user_id: null,
        status: createStatus,
        admin_notes: adminNotes,
        answers_json: {},
        metadata_json: {
          source: "google_sheet"
        }
      });

      if (insertError) {
        input.stats.errorCount += 1;
        input.stats.notes.push(`Failed to create submission from row ${sheetRowNumber}: ${insertError.message}`);
      } else {
        input.stats.inboundCreatesCount += 1;
      }

      continue;
    }

    const dbRow = dbById.get(submissionId);
    if (!dbRow) {
      input.stats.conflictsCount += 1;
      continue;
    }

    if (statusRaw.length > 0 && !status) {
      input.stats.errorCount += 1;
      input.stats.notes.push(`Ignored row ${sheetRowNumber}: invalid status value '${statusRaw}'.`);
      continue;
    }

    if (syncRev === null || syncRev !== dbRow.sync_rev) {
      input.stats.conflictsCount += 1;
      continue;
    }

    const nextStatus = status ?? dbRow.status;
    const nextNotes = adminNotes;

    if (nextStatus === dbRow.status && nextNotes === dbRow.admin_notes) {
      continue;
    }

    const { data: updatedRows, error: updateError } = await supabase
      .from("org_form_submissions")
      .update({
        status: nextStatus,
        admin_notes: nextNotes
      })
      .eq("org_id", input.form.org_id)
      .eq("id", submissionId)
      .eq("sync_rev", dbRow.sync_rev)
      .select("id")
      .limit(1);

    if (updateError) {
      input.stats.errorCount += 1;
      input.stats.notes.push(`Failed to apply row ${sheetRowNumber} update: ${updateError.message}`);
      continue;
    }

    if (!updatedRows || updatedRows.length === 0) {
      input.stats.conflictsCount += 1;
      continue;
    }

    input.stats.inboundUpdatesCount += 1;
  }
}

export async function runGoogleSheetSyncForForm(input: SyncFormInput): Promise<SyncStats> {
  if (!isGoogleSheetsConfigured()) {
    throw new Error("Google Sheets integration is not configured on the server.");
  }

  const stats: SyncStats = {
    inboundUpdatesCount: 0,
    inboundCreatesCount: 0,
    outboundRowsCount: 0,
    conflictsCount: 0,
    errorCount: 0,
    notes: []
  };

  const form = await loadForm(input.orgId, input.formId);
  if (!form) {
    throw new Error("Form not found.");
  }
  const orgSlug = await loadOrgSlug(form.org_id);
  if (!orgSlug) {
    throw new Error("Organization slug not found for Google Sheets sync.");
  }

  const integration = await loadIntegration(input.orgId, input.formId);
  if (!integration || integration.status !== "active") {
    throw new Error("Google Sheets integration is not active for this form.");
  }

  const runId = await insertSyncRun({
    orgId: input.orgId,
    formId: input.formId,
    integrationId: integration.id,
    trigger: input.trigger
  });

  try {
    const columns = buildColumnSet(form);
    await ensureSpreadsheetStructure(integration, columns, form.form_kind);

    if (input.allowInbound) {
      await applyInboundSubmissions({
        form,
        integration,
        columns,
        stats
      });
    }

    if (input.allowOutbound) {
      const data = await loadSubmissionsWithEntries(input.orgId, input.formId);
      await writeCanonicalSheets({
        orgSlug,
        appOrigin: resolveAppOrigin(),
        form,
        integration,
        columns,
        submissions: data.submissions,
        entriesBySubmissionId: data.entriesBySubmissionId,
        stats
      });
    }

    await updateIntegrationState({
      orgId: input.orgId,
      formId: input.formId,
      status: "active",
      lastError: null,
      lastSyncedAt: toIsoNow()
    });

    const status = stats.errorCount > 0 || stats.conflictsCount > 0 ? "partial" : "ok";
    await finishSyncRun(runId, stats, status, stats.notes.length > 0 ? stats.notes.slice(0, 20).join("\n") : null);
    return stats;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sheets sync failed.";

    await updateIntegrationState({
      orgId: input.orgId,
      formId: input.formId,
      status: "error",
      lastError: message
    }).catch(() => {
      // Best effort state update.
    });

    stats.errorCount += 1;
    stats.notes.push(message);
    await finishSyncRun(runId, stats, "failed", message).catch(() => {
      // Best effort run closure.
    });
    throw error;
  }
}

export async function runGoogleSheetOutboxProcessor(options?: { batchSize?: number }): Promise<{ processedGroups: number; lockedEvents: number }> {
  if (!isGoogleSheetsConfigured()) {
    return {
      processedGroups: 0,
      lockedEvents: 0
    };
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data: lockedRows, error: lockError } = await supabase.rpc("lock_org_form_google_sheet_outbox", {
    input_limit: Math.min(Math.max(options?.batchSize ?? 100, 1), 500)
  });

  if (lockError) {
    throw new Error(`Failed to lock Google Sheets outbox rows: ${lockError.message}`);
  }

  const rows = (lockedRows ?? []) as Array<{
    id: number;
    org_id: string;
    form_id: string;
  }>;

  if (rows.length === 0) {
    return {
      processedGroups: 0,
      lockedEvents: 0
    };
  }

  const grouped = new Map<string, { orgId: string; formId: string; outboxIds: number[] }>();
  rows.forEach((row) => {
    const key = `${row.org_id}:${row.form_id}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.outboxIds.push(row.id);
      return;
    }

    grouped.set(key, {
      orgId: row.org_id,
      formId: row.form_id,
      outboxIds: [row.id]
    });
  });

  let processedGroups = 0;

  for (const group of grouped.values()) {
    try {
      const integration = await loadIntegration(group.orgId, group.formId);
      if (!integration || integration.status !== "active") {
        await supabase
          .from("org_form_google_sheet_outbox")
          .update({
            processed_at: toIsoNow(),
            locked_at: null,
            last_error: "Skipped: integration not active."
          })
          .in("id", group.outboxIds);
        continue;
      }

      await runGoogleSheetSyncForForm({
        orgId: group.orgId,
        formId: group.formId,
        trigger: "outbox",
        allowInbound: false,
        allowOutbound: true
      });

      await supabase
        .from("org_form_google_sheet_outbox")
        .update({
          processed_at: toIsoNow(),
          locked_at: null,
          last_error: null
        })
        .in("id", group.outboxIds);

      processedGroups += 1;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Outbox sync failed.";
      await supabase
        .from("org_form_google_sheet_outbox")
        .update({
          locked_at: null,
          last_error: message
        })
        .in("id", group.outboxIds);
    }
  }

  return {
    processedGroups,
    lockedEvents: rows.length
  };
}

export async function connectFormToGoogleSheet(input: {
  orgId: string;
  formId: string;
  formName: string;
  formKind: FormRow["form_kind"];
  createdByUserId: string;
  shareWithEmail?: string | null;
  ownerAccessToken?: string | null;
}): Promise<{ spreadsheetId: string; spreadsheetUrl: string }> {
  if (!isGoogleSheetsConfigured()) {
    throw new Error("Google Sheets integration is not configured on the server.");
  }

  const existing = await loadIntegration(input.orgId, input.formId);
  if (existing) {
    const supabase = createSupabaseServiceRoleClient();
    await supabase
      .from("org_form_google_sheet_integrations")
      .update({
        status: "active",
        last_error: null
      })
      .eq("org_id", input.orgId)
      .eq("form_id", input.formId);

    return {
      spreadsheetId: existing.spreadsheet_id,
      spreadsheetUrl: existing.spreadsheet_url
    };
  }

  const title = `${input.formName} - Submissions`;
  const created = input.ownerAccessToken
    ? await createSpreadsheetWithAccessToken(input.ownerAccessToken, {
        title,
        sheets: [
          {
            title: GOOGLE_SHEETS_TAB_SUBMISSIONS
          },
          {
            title: GOOGLE_SHEETS_TAB_ENTRIES,
            hidden: input.formKind === "generic"
          }
        ]
      })
    : await createSpreadsheet({
        title,
        sheets: [
          {
            title: GOOGLE_SHEETS_TAB_SUBMISSIONS
          },
          {
            title: GOOGLE_SHEETS_TAB_ENTRIES,
            hidden: input.formKind === "generic"
          }
        ]
      });

  if (input.ownerAccessToken) {
    const appServiceAccountEmail = resolveGoogleSheetsServiceAccountEmail();
    if (!appServiceAccountEmail) {
      throw new Error(
        "Google Sheets service account email is not configured. Set GCP_SERVICE_ACCOUNT_EMAIL or GOOGLE_SHEETS_SERVICE_ACCOUNT_EMAIL."
      );
    }

    await shareSpreadsheetWithUserAccessToken(input.ownerAccessToken, created.spreadsheetId, appServiceAccountEmail).catch(
      (error) => {
        const message = error instanceof Error ? error.message : "unknown_share_error";
        throw new Error(`Google Sheets created as user, but failed to grant app sync access: ${message}`);
      }
    );
  }

  if (input.shareWithEmail && input.shareWithEmail.trim()) {
    await shareSpreadsheetWithUser(created.spreadsheetId, input.shareWithEmail.trim().toLowerCase()).catch(() => {
      // Non-blocking convenience share.
    });
  }

  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("org_form_google_sheet_integrations")
    .insert({
      org_id: input.orgId,
      form_id: input.formId,
      spreadsheet_id: created.spreadsheetId,
      spreadsheet_url: created.spreadsheetUrl,
      status: "active",
      created_by_user_id: input.createdByUserId
    });

  if (error) {
    throw new Error(`Failed to persist Sheets integration: ${error.message}`);
  }

  return {
    spreadsheetId: created.spreadsheetId,
    spreadsheetUrl: created.spreadsheetUrl
  };
}

export async function disableFormGoogleSheetIntegration(input: { orgId: string; formId: string }): Promise<void> {
  const supabase = createSupabaseServiceRoleClient();
  const { error } = await supabase
    .from("org_form_google_sheet_integrations")
    .update({
      status: "disabled",
      last_error: null
    })
    .eq("org_id", input.orgId)
    .eq("form_id", input.formId);

  if (error) {
    throw new Error(`Failed to disable Sheets integration: ${error.message}`);
  }
}

export async function queueGoogleSheetSyncForForm(input: { orgId: string; formId: string }): Promise<void> {
  if (!isGoogleSheetsConfigured()) {
    return;
  }

  await runGoogleSheetSyncForForm({
    orgId: input.orgId,
    formId: input.formId,
    trigger: "manual",
    allowInbound: false,
    allowOutbound: true
  });
}

export async function reconcileGoogleSheetBySpreadsheetId(spreadsheetId: string): Promise<number> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("org_form_google_sheet_integrations")
    .select("org_id, form_id, status")
    .eq("spreadsheet_id", spreadsheetId)
    .eq("status", "active");

  if (error) {
    throw new Error(`Failed to resolve spreadsheet integration: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ org_id: string; form_id: string; status: "active" }>;
  for (const row of rows) {
    await runGoogleSheetSyncForForm({
      orgId: row.org_id,
      formId: row.form_id,
      trigger: "webhook",
      allowInbound: true,
      allowOutbound: true
    });
  }

  return rows.length;
}

export async function reconcileAllActiveGoogleSheets(limit = 100): Promise<number> {
  if (!isGoogleSheetsConfigured()) {
    return 0;
  }

  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .from("org_form_google_sheet_integrations")
    .select("org_id, form_id")
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 500));

  if (error) {
    throw new Error(`Failed to list active Sheets integrations: ${error.message}`);
  }

  const rows = (data ?? []) as Array<{ org_id: string; form_id: string }>;
  for (const row of rows) {
    await runGoogleSheetSyncForForm({
      orgId: row.org_id,
      formId: row.form_id,
      trigger: "cron",
      allowInbound: true,
      allowOutbound: true
    });
  }

  return rows.length;
}

export function verifyGoogleSheetWebhookSignature(input: {
  rawBody: string;
  timestamp: string;
  signature: string;
  maxSkewSeconds?: number;
}): boolean {
  const secret = (process.env.GOOGLE_SHEETS_WEBHOOK_HMAC_SECRET ?? "").trim();
  if (!secret) {
    return false;
  }

  const timestampMs = Number.parseInt(input.timestamp, 10);
  if (!Number.isFinite(timestampMs)) {
    return false;
  }
  const normalizedTimestampMs = timestampMs < 1_000_000_000_000 ? timestampMs * 1000 : timestampMs;

  const maxSkewSeconds = input.maxSkewSeconds ?? 300;
  const skewMs = Math.abs(Date.now() - normalizedTimestampMs);
  if (skewMs > maxSkewSeconds * 1000) {
    return false;
  }

  const payload = `${input.timestamp}.${input.rawBody}`;
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  const provided = input.signature.trim().toLowerCase();

  if (expected.length !== provided.length) {
    return false;
  }

  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
