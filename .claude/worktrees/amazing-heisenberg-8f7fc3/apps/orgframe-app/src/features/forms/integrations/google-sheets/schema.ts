import { createHash } from "node:crypto";
import type { SubmissionStatus } from "@/src/features/forms/types";

export const GOOGLE_SHEETS_TAB_SUBMISSIONS = "Submissions";
export const GOOGLE_SHEETS_TAB_ENTRIES = "Entries";

export const GOOGLE_SHEET_SUBMISSION_STATUS_VALUES: SubmissionStatus[] = [
  "submitted",
  "in_review",
  "approved",
  "rejected",
  "waitlisted",
  "cancelled"
];

export const GOOGLE_SHEET_SYSTEM_COLUMNS = [
  "app_submission_id",
  "app_sync_rev",
  "app_row_hash",
  "app_last_synced_at",
  "app_form_id"
] as const;

export const GOOGLE_SHEET_MUTABLE_COLUMNS = ["status", "admin_notes"] as const;

export const GOOGLE_SHEET_LINK_COLUMNS = ["players_linked", "actions"] as const;

export const GOOGLE_SHEET_BASE_READ_COLUMNS = ["submitted_at", "updated_at"] as const;

export const GOOGLE_SHEET_ENTRY_SYSTEM_COLUMNS = [
  "app_entry_id",
  "app_submission_id",
  "app_sync_rev",
  "app_row_hash",
  "app_last_synced_at",
  "app_form_id"
] as const;

export const GOOGLE_SHEET_ENTRY_BASE_COLUMNS = ["player_id", "program_node_id", "created_at"] as const;

export const GOOGLE_SHEET_ENTRY_LINK_COLUMNS = ["players_linked", "actions"] as const;

export type ParsedSubmissionSheetRow = {
  sheetRowNumber: number;
  submissionId: string | null;
  syncRev: number | null;
  status: SubmissionStatus | null;
  adminNotes: string | null;
};

export function normalizeSubmissionStatus(value: unknown): SubmissionStatus | null {
  const raw = String(value ?? "")
    .trim()
    .toLowerCase();

  if (!raw) {
    return null;
  }

  return GOOGLE_SHEET_SUBMISSION_STATUS_VALUES.includes(raw as SubmissionStatus) ? (raw as SubmissionStatus) : null;
}

export function normalizeAdminNotes(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  const next = String(value).trim();
  if (!next) {
    return null;
  }

  return next.slice(0, 4000);
}

export function parseSheetSyncRev(value: unknown): number | null {
  const parsed = Number.parseInt(String(value ?? "").trim(), 10);
  if (!Number.isFinite(parsed)) {
    return null;
  }

  return parsed;
}

export function buildRowHash(parts: Array<string | number | null | undefined>): string {
  const raw = parts.map((part) => (part === null || part === undefined ? "" : String(part))).join("\u001f");
  return createHash("sha256").update(raw).digest("hex");
}

export function normalizeSheetCell(value: unknown): string {
  if (value === null || value === undefined) {
    return "";
  }

  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}
