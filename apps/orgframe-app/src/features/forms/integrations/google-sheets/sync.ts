import { createHmac, timingSafeEqual } from "node:crypto";
import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { getPlatformOrigin } from "@/src/shared/domains/customDomains";
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
} from "@/src/features/forms/integrations/google-sheets/client";
import { parseFormSchema } from "@/src/features/forms/schema";
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
} from "@/src/features/forms/integrations/google-sheets/schema";
import type { SubmissionStatus } from "@/src/features/forms/types";

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
  selectOptionsByFieldName: Record<string, string[]>;
};

type EnsureResult = {
  spreadsheetId: string;
  spreadsheetUrl: string;
  submissionsSheetId: number;
  entriesSheetId: number;
};

const GOOGLE_SHEETS_PUBLIC_ORIGIN = "https://web.wskcorporation.com";

type OrgSheetBranding = {
  slug: string;
  accentHex: string | null;
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

function parseSelectOptionsByFieldName(schemaJson: unknown, formKind: FormRow["form_kind"]): Record<string, string[]> {
  const schema = parseFormSchema(schemaJson, "Form", formKind);
  const seen = new Set<string>();
  const selectOptionsByFieldName: Record<string, string[]> = {};

  schema.pages.forEach((page) => {
    page.fields.forEach((field) => {
      if (!field.name || seen.has(field.name)) {
        return;
      }

      seen.add(field.name);
      if (field.type !== "select") {
        return;
      }

      const options = Array.from(
        new Set(
          (field.options ?? [])
            .map((option) => option.value.trim())
            .filter((value) => value.length > 0)
        )
      );
      if (options.length > 0) {
        selectOptionsByFieldName[field.name] = options;
      }
    });
  });

  return selectOptionsByFieldName;
}

function toIsoNow() {
  return new Date().toISOString();
}

function toA1ColumnLabel(index: number): string {
  let value = index + 1;
  let label = "";

  while (value > 0) {
    const remainder = (value - 1) % 26;
    label = String.fromCharCode(65 + remainder) + label;
    value = Math.floor((value - 1) / 26);
  }

  return label;
}

function buildHyperlinkFormula(url: string, label: string): string {
  const safeUrl = url.replace(/"/g, "\"\"");
  const safeLabel = label.replace(/"/g, "\"\"");
  return `=HYPERLINK("${safeUrl}","${safeLabel}")`;
}

function buildImageFormula(url: string): string {
  const safeUrl = url.replace(/"/g, "\"\"");
  return `=IFERROR(IMAGE("${safeUrl}",1),"")`;
}

function resolveAppOrigin(): string {
  const configured = getPlatformOrigin();
  if (configured && !configured.includes("localhost") && !configured.includes("127.0.0.1")) {
    return configured;
  }

  return GOOGLE_SHEETS_PUBLIC_ORIGIN;
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

function parseHexColorToRgb(hex: string): { red: number; green: number; blue: number } | null {
  const normalized = hex.trim().replace(/^#/, "");
  if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
    return null;
  }

  const red = Number.parseInt(normalized.slice(0, 2), 16) / 255;
  const green = Number.parseInt(normalized.slice(2, 4), 16) / 255;
  const blue = Number.parseInt(normalized.slice(4, 6), 16) / 255;
  return { red, green, blue };
}

function deriveHeaderTextColor(accent: { red: number; green: number; blue: number }): { red: number; green: number; blue: number } {
  const luminance = (0.2126 * accent.red) + (0.7152 * accent.green) + (0.0722 * accent.blue);
  return luminance > 0.6 ? { red: 0.08, green: 0.12, blue: 0.18 } : { red: 1, green: 1, blue: 1 };
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

  const basePath = `/${input.orgSlug}/manage/forms/${input.formId}/submissions`;
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
    .schema("forms").from("org_form_google_sheet_sync_runs")
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
    .schema("forms").from("org_form_google_sheet_sync_runs")
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
    .schema("forms").from("org_forms")
    .select("id, org_id, name, form_kind, schema_json")
    .eq("org_id", orgId)
    .eq("id", formId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load form for Sheets sync: ${error.message}`);
  }

  return (data as FormRow | null) ?? null;
}

async function loadOrgSheetBranding(orgId: string): Promise<OrgSheetBranding | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase.schema("orgs").from("orgs").select("slug, brand_primary").eq("id", orgId).maybeSingle();

  if (error) {
    throw new Error(`Failed to load org branding for Sheets sync: ${error.message}`);
  }

  const slug = typeof data?.slug === "string" ? data.slug.trim() : "";
  if (!slug) {
    return null;
  }

  const accentHex = typeof data?.brand_primary === "string" ? data.brand_primary.trim() : "";
  return {
    slug,
    accentHex: accentHex.length > 0 ? accentHex : null
  };
}

async function loadIntegration(orgId: string, formId: string): Promise<IntegrationRow | null> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema("forms").from("org_form_google_sheet_integrations")
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
    .schema("forms").from("org_form_google_sheet_integrations")
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

  const managedProtectionPrefix = "orgframe:";
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

  const submissionsColumnCount = columns.submissionHeaders.length;
  const entriesColumnCount = columns.entryHeaders.length;
  const submissionHeaderIndex = new Map(columns.submissionHeaders.map((header, index) => [header, index]));
  const entryHeaderIndex = new Map(columns.entryHeaders.map((header, index) => [header, index]));
  const statusColumnIndex = submissionHeaderIndex.get("status") ?? -1;
  const adminNotesColumnIndex = submissionHeaderIndex.get("admin_notes") ?? -1;
  const submissionsAnswerStartIndex =
    columns.submissionAnswerFields.length > 0 ? (submissionHeaderIndex.get(columns.submissionAnswerFields[0]) ?? -1) : -1;
  const entriesAnswerStartIndex = columns.entryAnswerFields.length > 0 ? (entryHeaderIndex.get(columns.entryAnswerFields[0]) ?? -1) : -1;
  const submissionsSystemStartIndex = submissionsColumnCount - GOOGLE_SHEET_SYSTEM_COLUMNS.length;
  const entriesSystemStartIndex = entriesColumnCount - GOOGLE_SHEET_ENTRY_SYSTEM_COLUMNS.length;

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
          startIndex: submissionsSystemStartIndex,
          endIndex: submissionsColumnCount
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
          startIndex: entriesSystemStartIndex,
          endIndex: entriesColumnCount
        },
        properties: {
          hiddenByUser: true
        },
        fields: "hiddenByUser"
      }
    }
  );

  if (statusColumnIndex >= 0) {
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
  }

  requests.push(
    {
      repeatCell: {
        range: {
          sheetId: submissionsSheetId,
          startRowIndex: 2,
          startColumnIndex: submissionsAnswerStartIndex >= 0 ? submissionsAnswerStartIndex : submissionsColumnCount,
          endColumnIndex:
            submissionsAnswerStartIndex >= 0
              ? submissionsAnswerStartIndex + columns.submissionAnswerFields.length
              : submissionsColumnCount
        },
        cell: {
          dataValidation: null
        },
        fields: "dataValidation"
      }
    },
    {
      repeatCell: {
        range: {
          sheetId: entriesSheetId,
          startRowIndex: 2,
          startColumnIndex: entriesAnswerStartIndex >= 0 ? entriesAnswerStartIndex : entriesColumnCount,
          endColumnIndex: entriesAnswerStartIndex >= 0 ? entriesAnswerStartIndex + columns.entryAnswerFields.length : entriesColumnCount
        },
        cell: {
          dataValidation: null
        },
        fields: "dataValidation"
      }
    }
  );

  columns.submissionAnswerFields.forEach((fieldName) => {
    const options = columns.selectOptionsByFieldName[fieldName] ?? [];
    const submissionColumnIndex = submissionHeaderIndex.get(fieldName);
    const entryColumnIndex = entryHeaderIndex.get(fieldName);
    if (options.length === 0) {
      return;
    }
    if (typeof submissionColumnIndex !== "number" || typeof entryColumnIndex !== "number") {
      return;
    }

    requests.push(
      {
        setDataValidation: {
          range: {
            sheetId: submissionsSheetId,
            startRowIndex: 2,
            startColumnIndex: submissionColumnIndex,
            endColumnIndex: submissionColumnIndex + 1
          },
          rule: {
            condition: {
              type: "ONE_OF_LIST",
              values: options.map((value) => ({ userEnteredValue: value }))
            },
            strict: true,
            showCustomUi: true
          }
        }
      },
      {
        setDataValidation: {
          range: {
            sheetId: entriesSheetId,
            startRowIndex: 2,
            startColumnIndex: entryColumnIndex,
            endColumnIndex: entryColumnIndex + 1
          },
          rule: {
            condition: {
              type: "ONE_OF_LIST",
              values: options.map((value) => ({ userEnteredValue: value }))
            },
            strict: true,
            showCustomUi: true
          }
        }
      }
    );
  });

  requests.push(
    {
      repeatCell: {
        range: {
          sheetId: submissionsSheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: submissionsColumnCount
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: "WRAP",
            verticalAlignment: "MIDDLE",
            backgroundColor: {
              red: 0.94,
              green: 0.97,
              blue: 1
            },
            textFormat: {
              bold: true
            }
          }
        },
        fields: "userEnteredFormat(wrapStrategy,verticalAlignment,backgroundColor,textFormat)"
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: submissionsSheetId,
          dimension: "ROWS",
          startIndex: 0,
          endIndex: 1
        },
        properties: {
          pixelSize: 78
        },
        fields: "pixelSize"
      }
    },
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
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: entriesColumnCount
        },
        cell: {
          userEnteredFormat: {
            wrapStrategy: "WRAP",
            verticalAlignment: "MIDDLE",
            backgroundColor: {
              red: 0.94,
              green: 0.97,
              blue: 1
            },
            textFormat: {
              bold: true
            }
          }
        },
        fields: "userEnteredFormat(wrapStrategy,verticalAlignment,backgroundColor,textFormat)"
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: entriesSheetId,
          dimension: "ROWS",
          startIndex: 0,
          endIndex: 1
        },
        properties: {
          pixelSize: 78
        },
        fields: "pixelSize"
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
  playerLabelById: Map<string, string>;
}> {
  const supabase = createSupabaseServiceRoleClient();

  const { data: submissionRows, error: submissionError } = await supabase
    .schema("forms").from("org_form_submissions")
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
  const playerLabelById = new Map<string, string>();

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

    const playerIds = Array.from(
      new Set((entryRows ?? []).map((entry) => String(entry.player_id ?? "").trim()).filter((value) => value.length > 0))
    );
    if (playerIds.length > 0) {
      const { data: playerRows, error: playerError } = await supabase
        .schema("people").from("players")
        .select("id, first_name, last_name")
        .in("id", playerIds);

      if (playerError) {
        throw new Error(`Failed to load player names for Sheets sync: ${playerError.message}`);
      }

      (playerRows ?? []).forEach((row) => {
        const firstName = typeof row.first_name === "string" ? row.first_name.trim() : "";
        const lastName = typeof row.last_name === "string" ? row.last_name.trim() : "";
        const label = `${firstName} ${lastName}`.trim();
        playerLabelById.set(String(row.id), label.length > 0 ? label : `Player ${String(row.id).slice(0, 8)}`);
      });
    }
  }

  return {
    submissions,
    entriesBySubmissionId,
    playerLabelById
  };
}

function buildColumnSet(form: FormRow): SheetColumnSet {
  const answerFields = parseFieldNames(form.schema_json, form.form_kind);
  const selectOptionsByFieldName = parseSelectOptionsByFieldName(form.schema_json, form.form_kind);

  return {
    submissionHeaders: [
      ...GOOGLE_SHEET_MUTABLE_COLUMNS,
      ...GOOGLE_SHEET_LINK_COLUMNS,
      ...GOOGLE_SHEET_BASE_READ_COLUMNS,
      ...answerFields,
      ...GOOGLE_SHEET_SYSTEM_COLUMNS
    ],
    submissionAnswerFields: answerFields,
    entryHeaders: [
      ...GOOGLE_SHEET_ENTRY_BASE_COLUMNS,
      ...GOOGLE_SHEET_ENTRY_LINK_COLUMNS,
      ...answerFields,
      ...GOOGLE_SHEET_ENTRY_SYSTEM_COLUMNS
    ],
    entryAnswerFields: answerFields,
    selectOptionsByFieldName
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
    input.submission.status,
    input.submission.admin_notes ?? "",
    "View players",
    "Open submission",
    input.submission.created_at,
    input.submission.updated_at,
    ...input.answerFields.map((field) => normalizeSheetCell(answers[field])),
    input.submission.id,
    input.submission.sync_rev,
    rowHash,
    input.syncedAt,
    input.formId
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
    input.entry.player_id,
    input.entry.program_node_id ?? "",
    input.entry.created_at,
    "View player",
    "Open entry",
    ...input.answerFields.map((field) => normalizeSheetCell(answers[field])),
    input.entry.id,
    input.submission.id,
    input.submission.sync_rev,
    rowHash,
    input.syncedAt,
    input.formId
  ];
}

async function applyDefaultSheetSizing(input: {
  spreadsheetId: string;
  submissionsSheetId: number;
  entriesSheetId: number;
  submissionsColumnCount: number;
  entriesColumnCount: number;
  submissionsRowCount: number;
  entriesRowCount: number;
}): Promise<void> {
  const minimumSizedRows = 50;
  const defaultRowHeightPx = 32;

  const requests: Array<Record<string, unknown>> = [
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId: input.submissionsSheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: input.submissionsColumnCount
        }
      }
    },
    {
      autoResizeDimensions: {
        dimensions: {
          sheetId: input.entriesSheetId,
          dimension: "COLUMNS",
          startIndex: 0,
          endIndex: input.entriesColumnCount
        }
      }
    }
  ];

  const submissionRowsToSize = Math.max(input.submissionsRowCount + 2, minimumSizedRows);
  const entryRowsToSize = Math.max(input.entriesRowCount + 2, minimumSizedRows);

  requests.push(
    {
      updateDimensionProperties: {
        range: {
          sheetId: input.submissionsSheetId,
          dimension: "ROWS",
          startIndex: 1,
          endIndex: submissionRowsToSize
        },
        properties: {
          pixelSize: defaultRowHeightPx
        },
        fields: "pixelSize"
      }
    },
    {
      updateDimensionProperties: {
        range: {
          sheetId: input.entriesSheetId,
          dimension: "ROWS",
          startIndex: 1,
          endIndex: entryRowsToSize
        },
        properties: {
          pixelSize: defaultRowHeightPx
        },
        fields: "pixelSize"
      }
    }
  );

  await batchUpdateSpreadsheet(input.spreadsheetId, requests);
}

async function applyManagedLinkFormulas(input: {
  spreadsheetId: string;
  orgSlug: string;
  appOrigin: string;
  formId: string;
  columns: SheetColumnSet;
  submissions: SubmissionRow[];
  entriesBySubmissionId: Map<string, SubmissionEntryRow[]>;
  playerLabelById: Map<string, string>;
}): Promise<void> {
  const submissionsLinkStartIndex = input.columns.submissionHeaders.indexOf("players_linked");
  const entriesLinkStartIndex = input.columns.entryHeaders.indexOf("players_linked");
  if (submissionsLinkStartIndex < 0 || entriesLinkStartIndex < 0) {
    return;
  }
  const submissionsLinkStartColumn = toA1ColumnLabel(submissionsLinkStartIndex);
  const submissionsLinkEndColumn = toA1ColumnLabel(submissionsLinkStartIndex + GOOGLE_SHEET_LINK_COLUMNS.length - 1);
  const entriesLinkStartColumn = toA1ColumnLabel(entriesLinkStartIndex);
  const entriesLinkEndColumn = toA1ColumnLabel(entriesLinkStartIndex + GOOGLE_SHEET_ENTRY_LINK_COLUMNS.length - 1);

  const submissionLinkValues = input.submissions.map((submission) => {
    const submissionEntries = input.entriesBySubmissionId.get(submission.id) ?? [];
    const playerNames = Array.from(
      new Set(
        submissionEntries.map((entry) => input.playerLabelById.get(entry.player_id) ?? `Player ${entry.player_id.slice(0, 8)}`)
      )
    );
    const playersLabel = playerNames.length > 0 ? playerNames.join(", ") : "";

    const playersLinkedUrl = buildSubmissionManageUrl({
      appOrigin: input.appOrigin,
      orgSlug: input.orgSlug,
      formId: input.formId,
      submissionId: submission.id,
      section: "players"
    });
    const submissionUrl = buildSubmissionManageUrl({
      appOrigin: input.appOrigin,
      orgSlug: input.orgSlug,
      formId: input.formId,
      submissionId: submission.id
    });

    return [
      playersLabel.length > 0 ? buildHyperlinkFormula(playersLinkedUrl, playersLabel) : "",
      buildHyperlinkFormula(submissionUrl, "Open submission")
    ];
  });

  const entryLinkValues = input.submissions.flatMap((submission) => {
    const entries = input.entriesBySubmissionId.get(submission.id) ?? [];
    return entries.map((entry) => {
      const entryManageUrl = buildSubmissionManageUrl({
        appOrigin: input.appOrigin,
        orgSlug: input.orgSlug,
        formId: input.formId,
        submissionId: submission.id,
        entryId: entry.id,
        section: "players"
      });
      const entryActionsUrl = buildSubmissionManageUrl({
        appOrigin: input.appOrigin,
        orgSlug: input.orgSlug,
        formId: input.formId,
        submissionId: submission.id,
        entryId: entry.id
      });
      const playerLabel = input.playerLabelById.get(entry.player_id) ?? `Player ${entry.player_id.slice(0, 8)}`;

      return [buildHyperlinkFormula(entryManageUrl, playerLabel), buildHyperlinkFormula(entryActionsUrl, "Open entry")];
    });
  });

  if (submissionLinkValues.length > 0) {
    const submissionRowStart = 3;
    const submissionRowEnd = submissionRowStart + submissionLinkValues.length - 1;
    await updateSheetValues({
      spreadsheetId: input.spreadsheetId,
      range: `${GOOGLE_SHEETS_TAB_SUBMISSIONS}!${submissionsLinkStartColumn}${submissionRowStart}:${submissionsLinkEndColumn}${submissionRowEnd}`,
      valueInputOption: "USER_ENTERED",
      values: submissionLinkValues
    });
  }

  if (entryLinkValues.length > 0) {
    const entryRowStart = 3;
    const entryRowEnd = entryRowStart + entryLinkValues.length - 1;
    await updateSheetValues({
      spreadsheetId: input.spreadsheetId,
      range: `${GOOGLE_SHEETS_TAB_ENTRIES}!${entriesLinkStartColumn}${entryRowStart}:${entriesLinkEndColumn}${entryRowEnd}`,
      valueInputOption: "USER_ENTERED",
      values: entryLinkValues
    });
  }
}

async function applyBrandingHeaderFormulas(input: {
  spreadsheetId: string;
  appOrigin: string;
  orgSlug: string;
}): Promise<void> {
  const orgFrameLogoUrl = `${input.appOrigin}/brand/logo.svg`;
  const orgLogoUrl = `${input.appOrigin}/${input.orgSlug}/logo`;

  const submissionsLogoValues = [[buildImageFormula(orgFrameLogoUrl), buildImageFormula(orgLogoUrl)]];
  const entriesLogoValues = [[buildImageFormula(orgFrameLogoUrl), buildImageFormula(orgLogoUrl)]];

  await updateSheetValues({
    spreadsheetId: input.spreadsheetId,
    range: `${GOOGLE_SHEETS_TAB_SUBMISSIONS}!A1:B1`,
    valueInputOption: "USER_ENTERED",
    values: submissionsLogoValues
  });

  await updateSheetValues({
    spreadsheetId: input.spreadsheetId,
    range: `${GOOGLE_SHEETS_TAB_ENTRIES}!A1:B1`,
    valueInputOption: "USER_ENTERED",
    values: entriesLogoValues
  });
}

async function applyBrandingHeaderLayout(input: {
  spreadsheetId: string;
  submissionsSheetId: number;
  entriesSheetId: number;
  submissionsColumnCount: number;
  entriesColumnCount: number;
  accentHex: string | null;
}): Promise<void> {
  const accentRgb = input.accentHex ? parseHexColorToRgb(input.accentHex) : null;
  const headerTextRgb = accentRgb ? deriveHeaderTextColor(accentRgb) : { red: 0.08, green: 0.12, blue: 0.18 };

  const buildRequestsForSheet = (sheetId: number, columnCount: number): Array<Record<string, unknown>> => {
    const titleEnd = Math.min(6, columnCount);
    const instructionsStart = Math.min(6, columnCount - 1);
    const instructionsEnd = columnCount;
    const requests: Array<Record<string, unknown>> = [];

    requests.push({
      unmergeCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: columnCount
        }
      }
    });

    if (titleEnd > 2) {
      requests.push({
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 2,
            endColumnIndex: titleEnd
          },
          mergeType: "MERGE_ALL"
        }
      });
    }

    if (instructionsEnd > instructionsStart) {
      requests.push({
        mergeCells: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: instructionsStart,
            endColumnIndex: instructionsEnd
          },
          mergeType: "MERGE_ALL"
        }
      });
    }

    requests.push({
      mergeCells: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        mergeType: "MERGE_ALL"
      }
    });

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: columnCount
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: accentRgb ?? { red: 0.94, green: 0.97, blue: 1 },
            textFormat: {
              bold: true,
              foregroundColor: headerTextRgb
            },
            horizontalAlignment: "LEFT",
            wrapStrategy: "WRAP",
            verticalAlignment: "MIDDLE"
          }
        },
        fields: "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment,wrapStrategy,verticalAlignment)"
      }
    });

    requests.push({
      repeatCell: {
        range: {
          sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: 2
        },
        cell: {
          userEnteredFormat: {
            horizontalAlignment: "CENTER"
          }
        },
        fields: "userEnteredFormat(horizontalAlignment)"
      }
    });

    if (titleEnd > 2) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: 2,
            endColumnIndex: titleEnd
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: true,
                fontSize: 16,
                foregroundColor: headerTextRgb
              }
            }
          },
          fields: "userEnteredFormat(textFormat)"
        }
      });
    }

    if (instructionsEnd > instructionsStart) {
      requests.push({
        repeatCell: {
          range: {
            sheetId,
            startRowIndex: 0,
            endRowIndex: 1,
            startColumnIndex: instructionsStart,
            endColumnIndex: instructionsEnd
          },
          cell: {
            userEnteredFormat: {
              textFormat: {
                bold: false,
                fontSize: 10,
                foregroundColor: headerTextRgb
              }
            }
          },
          fields: "userEnteredFormat(textFormat)"
        }
      });
    }

    requests.push({
      updateDimensionProperties: {
        range: {
          sheetId,
          dimension: "ROWS",
          startIndex: 0,
          endIndex: 1
        },
        properties: {
          pixelSize: 96
        },
        fields: "pixelSize"
      }
    });

    return requests;
  };

  const requests: Array<Record<string, unknown>> = [
    ...buildRequestsForSheet(input.submissionsSheetId, input.submissionsColumnCount),
    ...buildRequestsForSheet(input.entriesSheetId, input.entriesColumnCount),
    {
      updateSheetProperties: {
        properties: {
          sheetId: input.submissionsSheetId,
          tabColorStyle: {
            rgbColor: accentRgb ?? { red: 0.25, green: 0.47, blue: 0.92 }
          }
        },
        fields: "tabColorStyle"
      }
    },
    {
      updateSheetProperties: {
        properties: {
          sheetId: input.entriesSheetId,
          tabColorStyle: {
            rgbColor: accentRgb ?? { red: 0.25, green: 0.47, blue: 0.92 }
          }
        },
        fields: "tabColorStyle"
      }
    }
  ];

  await batchUpdateSpreadsheet(input.spreadsheetId, requests);
}

async function writeCanonicalSheets(input: {
  orgSlug: string;
  appOrigin: string;
  form: FormRow;
  integration: IntegrationRow;
  structure: EnsureResult;
  columns: SheetColumnSet;
  submissions: SubmissionRow[];
  entriesBySubmissionId: Map<string, SubmissionEntryRow[]>;
  playerLabelById: Map<string, string>;
  orgAccentHex: string | null;
  stats: SyncStats;
}): Promise<void> {
  const syncedAt = toIsoNow();
  const instructions =
    "OrgFrame managed sync sheet.\nDo: use dropdowns, update status/admin notes, and use link columns for actions.\nDo NOT: delete columns/tabs, edit hidden app_* columns, or overwrite header rows.";
  const submissionsTitle = `${input.form.name} - Submissions`;
  const entriesTitle = `${input.form.name} - Player Entries`;

  const submissionsBrandRow = Array<string>(input.columns.submissionHeaders.length).fill("");
  submissionsBrandRow[2] = submissionsTitle;
  submissionsBrandRow[6] = instructions;

  const entriesBrandRow = Array<string>(input.columns.entryHeaders.length).fill("");
  entriesBrandRow[2] = entriesTitle;
  entriesBrandRow[6] = instructions;

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
    values: [submissionsBrandRow, input.columns.submissionHeaders, ...submissionRows]
  });

  await clearSheetRange(input.integration.spreadsheet_id, `${GOOGLE_SHEETS_TAB_ENTRIES}!A1:ZZ`);
  await updateSheetValues({
    spreadsheetId: input.integration.spreadsheet_id,
    range: `${GOOGLE_SHEETS_TAB_ENTRIES}!A1`,
    valueInputOption: "RAW",
    values: [entriesBrandRow, input.columns.entryHeaders, ...entryRows]
  });

  await applyBrandingHeaderFormulas({
    spreadsheetId: input.integration.spreadsheet_id,
    appOrigin: input.appOrigin,
    orgSlug: input.orgSlug
  });

  await applyBrandingHeaderLayout({
    spreadsheetId: input.integration.spreadsheet_id,
    submissionsSheetId: input.structure.submissionsSheetId,
    entriesSheetId: input.structure.entriesSheetId,
    submissionsColumnCount: input.columns.submissionHeaders.length,
    entriesColumnCount: input.columns.entryHeaders.length,
    accentHex: input.orgAccentHex
  });

  await applyManagedLinkFormulas({
    spreadsheetId: input.integration.spreadsheet_id,
    orgSlug: input.orgSlug,
    appOrigin: input.appOrigin,
    formId: input.form.id,
    columns: input.columns,
    submissions: input.submissions,
    entriesBySubmissionId: input.entriesBySubmissionId,
    playerLabelById: input.playerLabelById
  });

  if (!input.integration.last_synced_at) {
    await applyDefaultSheetSizing({
      spreadsheetId: input.integration.spreadsheet_id,
      submissionsSheetId: input.structure.submissionsSheetId,
      entriesSheetId: input.structure.entriesSheetId,
      submissionsColumnCount: input.columns.submissionHeaders.length,
      entriesColumnCount: input.columns.entryHeaders.length,
      submissionsRowCount: submissionRows.length,
      entriesRowCount: entryRows.length
    });
  }

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
    .schema("forms").from("org_form_submissions")
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
      .schema("forms").from("org_form_versions")
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
      const { error: insertError } = await supabase.schema("forms").from("org_form_submissions").insert({
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
      .schema("forms").from("org_form_submissions")
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
  const orgBranding = await loadOrgSheetBranding(form.org_id);
  if (!orgBranding) {
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
    const structure = await ensureSpreadsheetStructure(integration, columns, form.form_kind);

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
        orgSlug: orgBranding.slug,
        appOrigin: resolveAppOrigin(),
        form,
        integration,
        structure,
        columns,
        submissions: data.submissions,
        entriesBySubmissionId: data.entriesBySubmissionId,
        playerLabelById: data.playerLabelById,
        orgAccentHex: orgBranding.accentHex,
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
          .schema("forms").from("org_form_google_sheet_outbox")
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
        .schema("forms").from("org_form_google_sheet_outbox")
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
        .schema("forms").from("org_form_google_sheet_outbox")
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
      .schema("forms").from("org_form_google_sheet_integrations")
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
    .schema("forms").from("org_form_google_sheet_integrations")
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
    .schema("forms").from("org_form_google_sheet_integrations")
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
    .schema("forms").from("org_form_google_sheet_integrations")
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
    .schema("forms").from("org_form_google_sheet_integrations")
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
