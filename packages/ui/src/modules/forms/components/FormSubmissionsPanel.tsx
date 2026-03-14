"use client";

import { AlertCircle, CheckCircle2, Filter, GripVertical, Loader2, Plus, RefreshCw, Settings, Trash2, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/ui/alert";
import { CalendarPicker } from "@orgframe/ui/ui/calendar-picker";
import { Checkbox } from "@orgframe/ui/ui/checkbox";
import { DataTable, type DataTableColumn, type DataTableViewConfig } from "@orgframe/ui/ui/data-table";
import { SortableCanvas } from "@orgframe/ui/editor/SortableCanvas";
import { FormField } from "@orgframe/ui/ui/form-field";
import { IconButton } from "@orgframe/ui/ui/icon-button";
import { Input } from "@orgframe/ui/ui/input";
import { Panel } from "@orgframe/ui/ui/panel";
import { Textarea } from "@orgframe/ui/ui/textarea";
import { Button } from "@orgframe/ui/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/ui/card";
import { Chip } from "@orgframe/ui/ui/chip";
import { Select } from "@orgframe/ui/ui/select";
import { useToast } from "@orgframe/ui/ui/toast";
import {
  createFormSubmissionViewAction,
  deleteFormSubmissionAction,
  deleteFormSubmissionViewAction,
  disconnectFormGoogleSheetAction,
  getFormGoogleSheetIntegrationAction,
  reorderFormSubmissionViewsAction,
  setSubmissionStatusAction,
  syncFormGoogleSheetNowAction,
  updateSubmissionAdminNotesAction,
  updateFormSubmissionViewLayoutAction,
  updateFormSubmissionViewSettingsAction,
  updateSubmissionAnswerAction,
  type FormSubmissionViewAdminAccount
} from "@/modules/forms/actions";
import { FormBuilderNavItem } from "@orgframe/ui/modules/forms/components/FormBuilderNavItem";
import type {
  FormField as FormFieldDefinition,
  FormKind,
  FormSchema,
  FormSubmissionViewFilterLogic,
  FormSubmissionViewFilterOperator,
  FormSubmissionViewFilterRule,
  FormSubmissionViewFilters,
  FormSubmissionViewSummaryCard,
  FormSubmissionViewSummaryMetricKey,
  FormSubmissionViewVisibilityScope,
  OrgFormGoogleSheetIntegration,
  OrgFormGoogleSheetSyncRun,
  FormSubmissionWithEntries,
  OrgFormSubmissionView,
  SubmissionStatus
} from "@/modules/forms/types";

type FormSubmissionsPanelProps = {
  orgSlug: string;
  formId: string;
  formKind: FormKind;
  formSchema: FormSchema;
  submissions: FormSubmissionWithEntries[];
  views: OrgFormSubmissionView[];
  viewAdminAccounts: FormSubmissionViewAdminAccount[];
  googleSheetIntegration: OrgFormGoogleSheetIntegration | null;
  googleSheetRecentRuns: OrgFormGoogleSheetSyncRun[];
  googleSheetConfigured: boolean;
  canWrite?: boolean;
};

type LocalFormSubmissionView = OrgFormSubmissionView;

type SubmissionChangeLogEntry = {
  at: string;
  field: string;
  from: string;
  to: string;
  mode: "single" | "bulk" | "inline_answer";
};

function asStatusOptions() {
  return [
    { value: "submitted", label: "Submitted" },
    { value: "in_review", label: "In review" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "waitlisted", label: "Waitlisted" },
    { value: "cancelled", label: "Cancelled" }
  ];
}

function toStatusLabel(status: SubmissionStatus) {
  switch (status) {
    case "submitted":
      return "Submitted";
    case "in_review":
      return "In review";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "waitlisted":
      return "Waitlisted";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function toChipColor(status: SubmissionStatus): "neutral" | "green" | "yellow" | "red" {
  switch (status) {
    case "approved":
      return "green";
    case "waitlisted":
    case "in_review":
      return "yellow";
    case "rejected":
    case "cancelled":
      return "red";
    default:
      return "neutral";
  }
}

function getGoogleSheetStatusMeta(status: OrgFormGoogleSheetIntegration["status"] | null) {
  if (status === "active") {
    return {
      label: "Connected",
      icon: CheckCircle2,
      toneClassName: "text-success"
    };
  }

  if (status === "error") {
    return {
      label: "Issue",
      icon: AlertCircle,
      toneClassName: "text-danger"
    };
  }

  return {
    label: "Not connected",
    icon: AlertCircle,
    toneClassName: "text-text-muted"
  };
}

function toVisibilityLabel(scope: FormSubmissionViewVisibilityScope) {
  switch (scope) {
    case "private":
      return "Only me";
    case "forms_readers":
      return "Form data team";
    case "specific_admin":
      return "Specific admin";
    default:
      return scope;
  }
}

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "None";
  }

  if (typeof value === "string") {
    return value.trim().length > 0 ? value : "None";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "None";
    }

    const allPrimitive = value.every(
      (item) => item === null || ["string", "number", "boolean"].includes(typeof item)
    );

    if (allPrimitive) {
      return value.map((item) => (item === null ? "None" : String(item))).join(", ");
    }

    return `${value.length} items`;
  }

  if (typeof value === "object") {
    return `${Object.keys(value as Record<string, unknown>).length} nested fields`;
  }

  return String(value);
}

function digitsOnly(value: string) {
  return value.replace(/\D/g, "");
}

function formatPhoneNumberInput(value: string) {
  const digits = digitsOnly(value).slice(0, 10);

  if (digits.length === 0) {
    return "";
  }

  if (digits.length <= 3) {
    return `(${digits}`;
  }

  if (digits.length <= 6) {
    return `(${digits.slice(0, 3)})-${digits.slice(3)}`;
  }

  return `(${digits.slice(0, 3)})-${digits.slice(3, 6)}-${digits.slice(6)}`;
}

type EditableTarget = {
  submissionEntryId?: string;
  key: string;
  value: unknown;
};

type SubmissionFilterFieldType = "status" | "datetime" | "number" | "text" | "date" | "select" | "checkbox";

type SubmissionFilterFieldOption = {
  key: string;
  label: string;
  type: SubmissionFilterFieldType;
  options?: Array<{ value: string; label: string }>;
};

type SubmissionSummaryMetricOption = {
  value: FormSubmissionViewSummaryMetricKey;
  label: string;
  description: string;
};

type GoogleSheetsConnectedMessage = {
  type: "orgframe:google-sheets-connected";
  orgSlug: string;
  formId: string;
  spreadsheetUrl?: string;
};

type GoogleSheetsOauthErrorMessage = {
  type: "orgframe:google-sheets-oauth-error";
  error: string;
};

const DEFAULT_VIEW_FILTERS: FormSubmissionViewFilters = {
  logic: "all",
  rules: []
};

const DEFAULT_SUMMARY_CARDS: FormSubmissionViewSummaryCard[] = [
  {
    id: "total-submissions",
    label: "Total items",
    metricKey: "total_submissions"
  },
  {
    id: "approved-submissions",
    label: "Approved",
    metricKey: "status_approved"
  },
  {
    id: "in-review-submissions",
    label: "In review",
    metricKey: "status_in_review"
  }
];

const SUMMARY_METRIC_OPTIONS: SubmissionSummaryMetricOption[] = [
  { value: "total_submissions", label: "Total items", description: "Count of submissions in this view." },
  { value: "total_players", label: "Total players", description: "Sum of player entries across this view." },
  { value: "status_submitted", label: "Submitted", description: "Submissions currently marked Submitted." },
  { value: "status_in_review", label: "In review", description: "Submissions currently marked In review." },
  { value: "status_approved", label: "Approved", description: "Submissions currently marked Approved." },
  { value: "status_rejected", label: "Rejected", description: "Submissions currently marked Rejected." },
  { value: "status_waitlisted", label: "Waitlisted", description: "Submissions currently marked Waitlisted." },
  { value: "status_cancelled", label: "Cancelled", description: "Submissions currently marked Cancelled." }
];

const FILTER_OPERATORS = new Set<FormSubmissionViewFilterOperator>([
  "equals",
  "not_equals",
  "contains",
  "not_contains",
  "is_true",
  "is_false",
  "on_or_before",
  "on_or_after",
  "greater_or_equal",
  "less_or_equal",
  "is_empty",
  "is_not_empty"
]);

function createFilterRuleId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `rule-${Date.now()}-${Math.round(Math.random() * 1_000_000)}`;
}

function normalizeFilterValue(value: unknown) {
  if (value === null || value === undefined) {
    return "";
  }
  return String(value).trim().toLowerCase();
}

function parseNumberValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function parseDateValue(value: unknown) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }
  const parsed = new Date(value);
  const timestamp = parsed.getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

function normalizeViewFilters(rawValue: unknown): FormSubmissionViewFilters {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return DEFAULT_VIEW_FILTERS;
  }

  const candidate = rawValue as Partial<FormSubmissionViewFilters>;
  const logic: FormSubmissionViewFilterLogic = candidate.logic === "any" ? "any" : "all";
  const rules: FormSubmissionViewFilterRule[] = [];
  if (Array.isArray(candidate.rules)) {
    candidate.rules.forEach((rule) => {
      if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
        return;
      }

      const next = rule as Partial<FormSubmissionViewFilterRule>;
      if (typeof next.fieldKey !== "string" || next.fieldKey.trim().length === 0) {
        return;
      }
      if (typeof next.operator !== "string" || !FILTER_OPERATORS.has(next.operator as FormSubmissionViewFilterOperator)) {
        return;
      }

      rules.push({
        id: typeof next.id === "string" && next.id.trim().length > 0 ? next.id : createFilterRuleId(),
        fieldKey: next.fieldKey,
        operator: next.operator as FormSubmissionViewFilterOperator,
        value: typeof next.value === "string" ? next.value : ""
      });
    });
  }

  return {
    logic,
    rules
  };
}

function normalizeSummaryCards(rawValue: unknown): FormSubmissionViewSummaryCard[] {
  if (!Array.isArray(rawValue)) {
    return DEFAULT_SUMMARY_CARDS;
  }

  const metricKeys = new Set<FormSubmissionViewSummaryMetricKey>(SUMMARY_METRIC_OPTIONS.map((option) => option.value));
  const normalized: FormSubmissionViewSummaryCard[] = [];
  rawValue.forEach((item) => {
    if (normalized.length >= 5) {
      return;
    }
    if (!item || typeof item !== "object" || Array.isArray(item)) {
      return;
    }

    const candidate = item as Partial<FormSubmissionViewSummaryCard>;
    if (typeof candidate.metricKey !== "string" || !metricKeys.has(candidate.metricKey as FormSubmissionViewSummaryMetricKey)) {
      return;
    }

    const id = typeof candidate.id === "string" && candidate.id.trim().length > 0 ? candidate.id : createFilterRuleId();
    const label = typeof candidate.label === "string" && candidate.label.trim().length > 0
      ? candidate.label.trim()
      : SUMMARY_METRIC_OPTIONS.find((option) => option.value === candidate.metricKey)?.label ?? "Metric";

    normalized.push({
      id,
      label,
      metricKey: candidate.metricKey as FormSubmissionViewSummaryMetricKey
    });
  });

  return normalized.length > 0 ? normalized : DEFAULT_SUMMARY_CARDS;
}

function toSummaryCardsForSave(cards: FormSubmissionViewSummaryCard[]) {
  return cards.slice(0, 5).map((card) => {
    const fallbackLabel = SUMMARY_METRIC_OPTIONS.find((option) => option.value === card.metricKey)?.label ?? "Metric";
    return {
      ...card,
      label: card.label.trim().length > 0 ? card.label.trim() : fallbackLabel
    };
  });
}

function AnswersList({
  answers,
  emptyLabel,
  fieldLabelByKey
}: {
  answers: Record<string, unknown>;
  emptyLabel: string;
  fieldLabelByKey: Map<string, string>;
}) {
  const entries = Object.entries(answers);

  if (entries.length === 0) {
    return <Alert variant="info">{emptyLabel}</Alert>;
  }

  return (
    <div className="space-y-2">
      {entries.map(([key, value]) => (
        <div className="rounded-control border bg-surface-muted px-3 py-2" key={key}>
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">{fieldLabelByKey.get(key) ?? key}</p>
          <p className="mt-1 text-sm text-text">{formatAnswerValue(value)}</p>
        </div>
      ))}
    </div>
  );
}

function resolveEditableTarget(
  submission: FormSubmissionWithEntries,
  fieldKeys: string[],
  submissionAnswersById: Record<string, Record<string, unknown>>,
  entryAnswersById: Record<string, Record<string, unknown>>,
  defaultFieldKey: string
): EditableTarget | null {
  const submissionAnswers = submissionAnswersById[submission.id] ?? {};

  for (const key of fieldKeys) {
    if (key in submissionAnswers) {
      return {
        key,
        value: submissionAnswers[key]
      };
    }
  }

  const matchingEntries = submission.entries
    .map((entry) => {
      const answers = entryAnswersById[entry.id] ?? entry.answersJson;
      for (const key of fieldKeys) {
        if (key in answers) {
          return {
            submissionEntryId: entry.id,
            key,
            value: answers[key]
          } satisfies EditableTarget;
        }
      }

      return null;
    })
    .filter((value): value is { submissionEntryId: string; key: string; value: unknown } => Boolean(value));

  if (matchingEntries.length === 1) {
    return matchingEntries[0];
  }

  if (matchingEntries.length > 1) {
    return null;
  }

  if (submission.entries.length === 1) {
    return {
      submissionEntryId: submission.entries[0]?.id,
      key: defaultFieldKey,
      value: undefined
    };
  }

  return {
    key: defaultFieldKey,
    value: undefined
  };
}

function getSubmissionFieldResponse(
  submission: FormSubmissionWithEntries,
  fieldKeys: string[],
  submissionAnswersById: Record<string, Record<string, unknown>>,
  entryAnswersById: Record<string, Record<string, unknown>>
): unknown {
  const target = resolveEditableTarget(submission, fieldKeys, submissionAnswersById, entryAnswersById, fieldKeys[0] ?? "");
  return target?.value;
}

function getOperatorOptions(fieldType: SubmissionFilterFieldType) {
  switch (fieldType) {
    case "status":
    case "select":
      return [
        { value: "equals", label: "is" },
        { value: "not_equals", label: "is not" }
      ] satisfies Array<{ value: FormSubmissionViewFilterOperator; label: string }>;
    case "checkbox":
      return [
        { value: "is_true", label: "is checked" },
        { value: "is_false", label: "is not checked" }
      ] satisfies Array<{ value: FormSubmissionViewFilterOperator; label: string }>;
    case "datetime":
    case "date":
      return [
        { value: "on_or_after", label: "on or after" },
        { value: "on_or_before", label: "on or before" },
        { value: "equals", label: "on" }
      ] satisfies Array<{ value: FormSubmissionViewFilterOperator; label: string }>;
    case "number":
      return [
        { value: "equals", label: "equals" },
        { value: "greater_or_equal", label: "at least" },
        { value: "less_or_equal", label: "at most" }
      ] satisfies Array<{ value: FormSubmissionViewFilterOperator; label: string }>;
    default:
      return [
        { value: "contains", label: "contains" },
        { value: "not_contains", label: "does not contain" },
        { value: "equals", label: "equals" },
        { value: "not_equals", label: "does not equal" },
        { value: "is_empty", label: "is empty" },
        { value: "is_not_empty", label: "is not empty" }
      ] satisfies Array<{ value: FormSubmissionViewFilterOperator; label: string }>;
  }
}

function matchesFilterRule(rule: FormSubmissionViewFilterRule, value: unknown, fieldType: SubmissionFilterFieldType) {
  if (rule.operator === "is_empty") {
    return normalizeFilterValue(value).length === 0;
  }
  if (rule.operator === "is_not_empty") {
    return normalizeFilterValue(value).length > 0;
  }

  if (fieldType === "checkbox") {
    const boolValue = value === true || value === "true" || value === "on" || value === 1 || value === "1";
    if (rule.operator === "is_true") {
      return boolValue;
    }
    if (rule.operator === "is_false") {
      return !boolValue;
    }
  }

  if (fieldType === "number") {
    const left = parseNumberValue(value);
    const right = parseNumberValue(rule.value);
    if (left === null || right === null) {
      return false;
    }
    if (rule.operator === "greater_or_equal") {
      return left >= right;
    }
    if (rule.operator === "less_or_equal") {
      return left <= right;
    }
    if (rule.operator === "equals") {
      return left === right;
    }
    if (rule.operator === "not_equals") {
      return left !== right;
    }
    return false;
  }

  if (fieldType === "datetime" || fieldType === "date") {
    const left = parseDateValue(value);
    const right = parseDateValue(rule.value);
    if (left === null || right === null) {
      return false;
    }
    if (rule.operator === "on_or_after") {
      return left >= right;
    }
    if (rule.operator === "on_or_before") {
      return left <= right;
    }
    if (rule.operator === "equals") {
      const leftDate = new Date(left);
      const rightDate = new Date(right);
      return leftDate.toDateString() === rightDate.toDateString();
    }
    return false;
  }

  const left = normalizeFilterValue(value);
  const right = normalizeFilterValue(rule.value);
  if (rule.operator === "contains") {
    return left.includes(right);
  }
  if (rule.operator === "not_contains") {
    return !left.includes(right);
  }
  if (rule.operator === "equals") {
    return left === right;
  }
  if (rule.operator === "not_equals") {
    return left !== right;
  }
  return false;
}

function normalizeColumnOrderKeys(rawValue: unknown, allColumnKeys: string[]) {
  if (!Array.isArray(rawValue)) {
    return allColumnKeys;
  }

  const allColumnKeySet = new Set(allColumnKeys);
  const recognized: string[] = [];
  for (const rawKey of rawValue) {
    if (typeof rawKey !== "string") {
      continue;
    }
    if (!allColumnKeySet.has(rawKey) || recognized.includes(rawKey)) {
      continue;
    }
    recognized.push(rawKey);
  }
  const missing = allColumnKeys.filter((key) => !recognized.includes(key));
  return [...recognized, ...missing];
}

function normalizeVisibleColumnKeys(rawValue: unknown, allColumnKeys: string[], defaultVisibleColumnKeys: string[]) {
  if (!Array.isArray(rawValue)) {
    return defaultVisibleColumnKeys;
  }

  const allColumnKeySet = new Set(allColumnKeys);
  const normalized: string[] = [];
  for (const rawKey of rawValue) {
    if (typeof rawKey !== "string") {
      continue;
    }
    if (!allColumnKeySet.has(rawKey) || normalized.includes(rawKey)) {
      continue;
    }
    normalized.push(rawKey);
  }
  return normalized.length > 0 ? normalized : defaultVisibleColumnKeys;
}

function normalizePinnedColumnKeys(rawValue: unknown, allColumnKeys: string[], defaultPinnedColumnKeys: string[]) {
  if (!Array.isArray(rawValue)) {
    return defaultPinnedColumnKeys;
  }

  const allColumnKeySet = new Set(allColumnKeys);
  const normalized: string[] = [];
  for (const rawKey of rawValue) {
    if (typeof rawKey !== "string") {
      continue;
    }
    if (!allColumnKeySet.has(rawKey) || normalized.includes(rawKey)) {
      continue;
    }
    normalized.push(rawKey);
  }
  return normalized;
}

function normalizeColumnWidthsByKey(rawValue: unknown, allColumnKeys: string[]) {
  if (!rawValue || typeof rawValue !== "object" || Array.isArray(rawValue)) {
    return {} as Record<string, number>;
  }

  const allColumnKeySet = new Set(allColumnKeys);
  const next: Record<string, number> = {};
  for (const [key, value] of Object.entries(rawValue as Record<string, unknown>)) {
    if (!allColumnKeySet.has(key) || typeof value !== "number" || !Number.isFinite(value)) {
      continue;
    }
    next[key] = Math.max(64, Math.round(value));
  }
  return next;
}

export function FormSubmissionsPanel({
  orgSlug,
  formId,
  formKind,
  formSchema,
  submissions,
  views,
  viewAdminAccounts,
  googleSheetIntegration,
  googleSheetRecentRuns,
  googleSheetConfigured,
  canWrite = true
}: FormSubmissionsPanelProps) {
  const showGoogleSheetsUi = true;
  const router = useRouter();
  const searchParams = useSearchParams();
  const deepLinkedSubmissionId = useMemo(() => {
    const value = searchParams.get("submissionId");
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [searchParams]);
  const deepLinkedEntryId = useMemo(() => {
    const value = searchParams.get("entryId");
    if (!value) {
      return null;
    }

    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [searchParams]);
  const { toast } = useToast();
  const [isRefreshingSubmissions, startRefreshingSubmissions] = useTransition();
  const [isSaving, startSaving] = useTransition();
  const [isDeletingSubmissions, startDeletingSubmissions] = useTransition();
  const [submissionRows, setSubmissionRows] = useState<FormSubmissionWithEntries[]>(submissions);
  const [activeSaveSubmissionId, setActiveSaveSubmissionId] = useState<string | null>(null);
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null);
  const [isEditableMode, setIsEditableMode] = useState(false);
  const [selectedSubmissionIds, setSelectedSubmissionIds] = useState<string[]>([]);
  const [lastCheckedSubmissionId, setLastCheckedSubmissionId] = useState<string | null>(null);
  const [visibleSubmissionIds, setVisibleSubmissionIds] = useState<string[]>(submissionRows.map((submission) => submission.id));
  const [bulkStatus, setBulkStatus] = useState<SubmissionStatus>("in_review");
  const [statusById, setStatusById] = useState<Record<string, SubmissionStatus>>(
    submissions.reduce<Record<string, SubmissionStatus>>((draft, submission) => {
      draft[submission.id] = submission.status;
      return draft;
    }, {})
  );
  const [savedStatusById, setSavedStatusById] = useState<Record<string, SubmissionStatus>>(
    submissions.reduce<Record<string, SubmissionStatus>>((draft, submission) => {
      draft[submission.id] = submission.status;
      return draft;
    }, {})
  );
  const [adminNotesById, setAdminNotesById] = useState<Record<string, string>>(
    submissions.reduce<Record<string, string>>((draft, submission) => {
      draft[submission.id] = submission.adminNotes ?? "";
      return draft;
    }, {})
  );
  const [savedAdminNotesById, setSavedAdminNotesById] = useState<Record<string, string>>(
    submissions.reduce<Record<string, string>>((draft, submission) => {
      draft[submission.id] = submission.adminNotes ?? "";
      return draft;
    }, {})
  );
  const [changeLogBySubmissionId, setChangeLogBySubmissionId] = useState<Record<string, SubmissionChangeLogEntry[]>>({});
  const [submissionAnswersById, setSubmissionAnswersById] = useState<Record<string, Record<string, unknown>>>(
    submissions.reduce<Record<string, Record<string, unknown>>>((draft, submission) => {
      draft[submission.id] = submission.answersJson;
      return draft;
    }, {})
  );
  const [entryAnswersById, setEntryAnswersById] = useState<Record<string, Record<string, unknown>>>(
    submissions.reduce<Record<string, Record<string, unknown>>>((draft, submission) => {
      submission.entries.forEach((entry) => {
        draft[entry.id] = entry.answersJson;
      });
      return draft;
    }, {})
  );
  const [cellDraftByKey, setCellDraftByKey] = useState<Record<string, unknown>>({});
  const [savingCellKey, setSavingCellKey] = useState<string | null>(null);
  const [savingInlineStatusId, setSavingInlineStatusId] = useState<string | null>(null);
  const [savingInlineNotesId, setSavingInlineNotesId] = useState<string | null>(null);
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<LocalFormSubmissionView[]>(views);
  const [activeViewId, setActiveViewId] = useState<string | null>(views[0]?.id ?? null);
  const [tableConfigDraft, setTableConfigDraft] = useState<DataTableViewConfig | null>(null);
  const tableConfigDraftRef = useRef<DataTableViewConfig | null>(null);
  const [isCreateViewPanelOpen, setIsCreateViewPanelOpen] = useState(false);
  const [isEditViewPanelOpen, setIsEditViewPanelOpen] = useState(false);
  const [isDataControlsPanelOpen, setIsDataControlsPanelOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [newViewVisibility, setNewViewVisibility] = useState<FormSubmissionViewVisibilityScope>("private");
  const [newViewTargetUserId, setNewViewTargetUserId] = useState<string>("");
  const [editingViewId, setEditingViewId] = useState<string | null>(null);
  const [editViewName, setEditViewName] = useState("");
  const [editViewVisibility, setEditViewVisibility] = useState<FormSubmissionViewVisibilityScope>("private");
  const [editViewTargetUserId, setEditViewTargetUserId] = useState("");
  const [isSavingView, startSavingView] = useTransition();
  const [autoSavingViewId, setAutoSavingViewId] = useState<string | null>(null);
  const [saveStateByViewId, setSaveStateByViewId] = useState<Record<string, "saving" | "saved">>({});
  const [isFiltersPanelOpen, setIsFiltersPanelOpen] = useState(false);
  const [viewFiltersDraft, setViewFiltersDraft] = useState<FormSubmissionViewFilters>(
    normalizeViewFilters(views[0]?.configJson?.filters)
  );
  const [viewSummaryCardsDraft, setViewSummaryCardsDraft] = useState<FormSubmissionViewSummaryCard[]>(
    normalizeSummaryCards(views[0]?.configJson?.summaryCards)
  );
  const [editingSummaryCardId, setEditingSummaryCardId] = useState<string | null>(null);
  const [summaryCardLabelDraftById, setSummaryCardLabelDraftById] = useState<Record<string, string>>({});
  const [googleSheetState, setGoogleSheetState] = useState<OrgFormGoogleSheetIntegration | null>(googleSheetIntegration);
  const [googleSheetRunRows, setGoogleSheetRunRows] = useState<OrgFormGoogleSheetSyncRun[]>(googleSheetRecentRuns);
  const [isSavingGoogleSheet, startSavingGoogleSheet] = useTransition();
  const [isGoogleSheetsOauthInFlight, setIsGoogleSheetsOauthInFlight] = useState(false);
  const [isGoogleSheetsSettingsOpen, setIsGoogleSheetsSettingsOpen] = useState(false);
  const handleTableConfigChange = useCallback((nextConfig: DataTableViewConfig) => {
    tableConfigDraftRef.current = nextConfig;
    setTableConfigDraft(nextConfig);
  }, []);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveRequestIdRef = useRef(0);
  const appliedFiltersSignatureRef = useRef<string | null>(null);
  const appliedSummaryCardsSignatureRef = useRef<string | null>(null);
  const googleSheetsOauthWatchRef = useRef<number | null>(null);

  useEffect(() => {
    setSubmissionRows(submissions);
    setStatusById(
      submissions.reduce<Record<string, SubmissionStatus>>((draft, submission) => {
        draft[submission.id] = submission.status;
        return draft;
      }, {})
    );
    setSavedStatusById(
      submissions.reduce<Record<string, SubmissionStatus>>((draft, submission) => {
        draft[submission.id] = submission.status;
        return draft;
      }, {})
    );
    setAdminNotesById(
      submissions.reduce<Record<string, string>>((draft, submission) => {
        draft[submission.id] = submission.adminNotes ?? "";
        return draft;
      }, {})
    );
    setSavedAdminNotesById(
      submissions.reduce<Record<string, string>>((draft, submission) => {
        draft[submission.id] = submission.adminNotes ?? "";
        return draft;
      }, {})
    );
  }, [submissions]);

  useEffect(() => {
    setGoogleSheetState(googleSheetIntegration);
    setGoogleSheetRunRows(googleSheetRecentRuns);
  }, [googleSheetIntegration, googleSheetRecentRuns]);

  useEffect(() => {
    if (!deepLinkedSubmissionId) {
      return;
    }

    const exists = submissions.some((submission) => submission.id === deepLinkedSubmissionId);
    if (!exists) {
      return;
    }

    setSelectedSubmissionId((current) => current ?? deepLinkedSubmissionId);
  }, [deepLinkedSubmissionId, submissions]);

  const selectedSubmissionIdSet = useMemo(() => new Set(selectedSubmissionIds), [selectedSubmissionIds]);

  function appendChangeLog(submissionId: string, entry: SubmissionChangeLogEntry) {
    setChangeLogBySubmissionId((current) => ({
      ...current,
      [submissionId]: [entry, ...(current[submissionId] ?? [])]
    }));
  }

  function handleSave(submissionId: string) {
    if (!canWrite || !isEditableMode) {
      return;
    }

    const status = statusById[submissionId];
    const previousStatus = savedStatusById[submissionId] ?? status;
    const adminNotes = (adminNotesById[submissionId] ?? "").trim();
    const previousAdminNotes = (savedAdminNotesById[submissionId] ?? "").trim();
    setActiveSaveSubmissionId(submissionId);

    startSaving(async () => {
      try {
        if (status !== previousStatus) {
          const statusResult = await setSubmissionStatusAction({
            orgSlug,
            formId,
            submissionId,
            status
          });

          if (!statusResult.ok) {
            toast({
              title: "Unable to update submission",
              description: statusResult.error,
              variant: "destructive"
            });
            return;
          }
        }

        if (adminNotes !== previousAdminNotes) {
          const notesResult = await updateSubmissionAdminNotesAction({
            orgSlug,
            formId,
            submissionId,
            adminNotes: adminNotes.length > 0 ? adminNotes : null
          });

          if (!notesResult.ok) {
            toast({
              title: "Unable to update notes",
              description: notesResult.error,
              variant: "destructive"
            });
            return;
          }
        }

        setSavedStatusById((current) => ({
          ...current,
          [submissionId]: status
        }));
        setSavedAdminNotesById((current) => ({
          ...current,
          [submissionId]: adminNotes
        }));
        if (previousStatus !== status) {
          appendChangeLog(submissionId, {
            at: new Date().toISOString(),
            field: "Status",
            from: toStatusLabel(previousStatus),
            to: toStatusLabel(status),
            mode: "single"
          });
        }
        if (previousAdminNotes !== adminNotes) {
          appendChangeLog(submissionId, {
            at: new Date().toISOString(),
            field: "Admin notes",
            from: previousAdminNotes.length > 0 ? previousAdminNotes : "None",
            to: adminNotes.length > 0 ? adminNotes : "None",
            mode: "single"
          });
        }

        toast({
          title: "Submission updated",
          variant: "success"
        });
      } finally {
        setActiveSaveSubmissionId(null);
      }
    });
  }

  const handleSelectSubmission = useCallback((submissionId: string, checked: boolean, isShiftSelection: boolean) => {
    setSelectedSubmissionIds((current) => {
      if (isShiftSelection && lastCheckedSubmissionId) {
        const startIndex = visibleSubmissionIds.indexOf(lastCheckedSubmissionId);
        const endIndex = visibleSubmissionIds.indexOf(submissionId);

        if (startIndex >= 0 && endIndex >= 0) {
          const [min, max] = startIndex <= endIndex ? [startIndex, endIndex] : [endIndex, startIndex];
          const rangeIds = visibleSubmissionIds.slice(min, max + 1);
          const next = new Set(current);

          if (checked) {
            rangeIds.forEach((id) => next.add(id));
          } else {
            rangeIds.forEach((id) => next.delete(id));
          }

          return Array.from(next);
        }
      }

      if (checked) {
        if (current.includes(submissionId)) {
          return current;
        }

        return [...current, submissionId];
      }

      return current.filter((id) => id !== submissionId);
    });

    setLastCheckedSubmissionId(submissionId);
  }, [lastCheckedSubmissionId, visibleSubmissionIds]);

  function handleApplyBulkStatus() {
    if (!canWrite || !isEditableMode || selectedSubmissionIds.length === 0) {
      return;
    }

    startSaving(async () => {
      const outcomes = await Promise.all(
        selectedSubmissionIds.map(async (submissionId) => {
          const from = savedStatusById[submissionId] ?? statusById[submissionId];
          const result = await setSubmissionStatusAction({
            orgSlug,
            formId,
            submissionId,
            status: bulkStatus
          });

          return {
            submissionId,
            from,
            ok: result.ok,
            error: result.ok ? null : result.error
          };
        })
      );

      const successes = outcomes.filter((outcome) => outcome.ok);
      const failures = outcomes.filter((outcome) => !outcome.ok);

      if (successes.length > 0) {
        setStatusById((current) => {
          const next = { ...current };
          successes.forEach((outcome) => {
            next[outcome.submissionId] = bulkStatus;
          });
          return next;
        });
        setSavedStatusById((current) => {
          const next = { ...current };
          successes.forEach((outcome) => {
            next[outcome.submissionId] = bulkStatus;
          });
          return next;
        });
        successes.forEach((outcome) => {
          if (outcome.from !== bulkStatus) {
            appendChangeLog(outcome.submissionId, {
              at: new Date().toISOString(),
              field: "Status",
              from: toStatusLabel(outcome.from),
              to: toStatusLabel(bulkStatus),
              mode: "bulk"
            });
          }
        });
      }

      if (failures.length === 0) {
        toast({
          title: `Updated ${successes.length} submissions`,
          variant: "success"
        });
        return;
      }

      toast({
        title: `Updated ${successes.length}, failed ${failures.length}`,
        description: failures[0]?.error ?? "Some updates failed.",
        variant: "warning"
      });
    });
  }

  function handleDeleteSelectedSubmissions() {
    if (!canWrite || !isEditableMode || selectedSubmissionIds.length === 0) {
      return;
    }

    const toDelete = [...selectedSubmissionIds];
    const confirmed = window.confirm(
      `Delete ${toDelete.length} selected submission${toDelete.length === 1 ? "" : "s"}? This cannot be undone.`
    );
    if (!confirmed) {
      return;
    }

    startDeletingSubmissions(async () => {
      const outcomes = await Promise.all(
        toDelete.map(async (submissionId) => {
          const result = await deleteFormSubmissionAction({
            orgSlug,
            formId,
            submissionId
          });

          return {
            submissionId,
            ok: result.ok,
            error: result.ok ? null : result.error
          };
        })
      );

      const successes = outcomes.filter((outcome) => outcome.ok).map((outcome) => outcome.submissionId);
      const failures = outcomes.filter((outcome) => !outcome.ok);

      if (successes.length > 0) {
        const successSet = new Set(successes);
        const deletedEntryIds = submissionRows
          .filter((submission) => successSet.has(submission.id))
          .flatMap((submission) => submission.entries.map((entry) => entry.id));
        const deletedEntryIdSet = new Set(deletedEntryIds);

        setSubmissionRows((current) => current.filter((submission) => !successSet.has(submission.id)));
        setSelectedSubmissionIds((current) => current.filter((id) => !successSet.has(id)));
        setVisibleSubmissionIds((current) => current.filter((id) => !successSet.has(id)));
        setStatusById((current) => {
          const next = { ...current };
          successes.forEach((id) => delete next[id]);
          return next;
        });
        setSavedStatusById((current) => {
          const next = { ...current };
          successes.forEach((id) => delete next[id]);
          return next;
        });
        setAdminNotesById((current) => {
          const next = { ...current };
          successes.forEach((id) => delete next[id]);
          return next;
        });
        setSavedAdminNotesById((current) => {
          const next = { ...current };
          successes.forEach((id) => delete next[id]);
          return next;
        });
        setSubmissionAnswersById((current) => {
          const next = { ...current };
          successes.forEach((id) => delete next[id]);
          return next;
        });
        setChangeLogBySubmissionId((current) => {
          const next = { ...current };
          successes.forEach((id) => delete next[id]);
          return next;
        });
        setEntryAnswersById((current) => {
          if (deletedEntryIdSet.size === 0) {
            return current;
          }
          const next = { ...current };
          deletedEntryIdSet.forEach((entryId) => delete next[entryId]);
          return next;
        });
        setCellDraftByKey((current) => {
          const nextEntries = Object.entries(current).filter(([key]) => {
            for (const submissionId of successSet) {
              if (key.startsWith(`${submissionId}:`)) {
                return false;
              }
            }
            return true;
          });
          return Object.fromEntries(nextEntries);
        });

        if (selectedSubmissionId && successSet.has(selectedSubmissionId)) {
          setSelectedSubmissionId(null);
        }
      }

      if (failures.length === 0) {
        toast({
          title: `Deleted ${successes.length} submission${successes.length === 1 ? "" : "s"}`,
          variant: "success"
        });
        return;
      }

      toast({
        title: `Deleted ${successes.length}, failed ${failures.length}`,
        description: failures[0]?.error ?? "Some deletions failed.",
        variant: "warning"
      });
    });
  }

  function handleRefreshSubmissions() {
    startRefreshingSubmissions(async () => {
      if (canWrite && googleSheetState && googleSheetConfigured) {
        const syncResult = await syncFormGoogleSheetNowAction({
          orgSlug,
          formId
        });

        if (!syncResult.ok) {
          toast({
            title: "Google Sheets refresh sync failed",
            description: syncResult.error,
            variant: "warning"
          });
        }

        await refreshGoogleSheetState(false);
      }

      router.refresh();
    });
  }

  async function refreshGoogleSheetState(showErrorToast = true) {
    const result = await getFormGoogleSheetIntegrationAction({
      orgSlug,
      formId
    });

    if (!result.ok) {
      if (showErrorToast) {
        toast({
          title: "Unable to refresh Google Sheets status",
          description: result.error,
          variant: "warning"
        });
      }
      return;
    }

    setGoogleSheetState(result.data.integration);
    setGoogleSheetRunRows(result.data.recentRuns);
  }

  function handleConnectGoogleSheet() {
    if (!canWrite) {
      return;
    }

    const width = 620;
    const height = 760;
    const left = Math.max(0, Math.floor(window.screenX + (window.outerWidth - width) / 2));
    const top = Math.max(0, Math.floor(window.screenY + (window.outerHeight - height) / 2));

    const popup = window.open(
      `/api/integrations/google-sheets/oauth/start?orgSlug=${encodeURIComponent(orgSlug)}&formId=${encodeURIComponent(formId)}`,
      "orgframe-google-sheets-oauth",
      `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes`
    );

    if (!popup) {
      toast({
        title: "Popup blocked",
        description: "Allow popups for this site to connect Google Sheets.",
        variant: "destructive"
      });
      return;
    }

    setIsGoogleSheetsOauthInFlight(true);
    if (googleSheetsOauthWatchRef.current !== null) {
      window.clearInterval(googleSheetsOauthWatchRef.current);
    }
    googleSheetsOauthWatchRef.current = window.setInterval(() => {
      if (popup.closed) {
        if (googleSheetsOauthWatchRef.current !== null) {
          window.clearInterval(googleSheetsOauthWatchRef.current);
          googleSheetsOauthWatchRef.current = null;
        }
        setIsGoogleSheetsOauthInFlight(false);
      }
    }, 500);
    popup.focus();
  }

  function handleDisconnectGoogleSheet() {
    if (!canWrite || !googleSheetState) {
      return;
    }

    const confirmed = window.confirm("Disconnect this Google Sheet from form submissions?");
    if (!confirmed) {
      return;
    }

    startSavingGoogleSheet(async () => {
      const result = await disconnectFormGoogleSheetAction({
        orgSlug,
        formId
      });

      if (!result.ok) {
        toast({
          title: "Unable to disconnect Google Sheets",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      await refreshGoogleSheetState(false);
      toast({
        title: "Google Sheets disconnected",
        variant: "success"
      });
    });
  }

  function handleSyncGoogleSheetNow() {
    if (!canWrite || !googleSheetState) {
      return;
    }

    startSavingGoogleSheet(async () => {
      const result = await syncFormGoogleSheetNowAction({
        orgSlug,
        formId
      });

      if (!result.ok) {
        toast({
          title: "Unable to sync Google Sheets",
          description: result.error,
          variant: "destructive"
        });
        await refreshGoogleSheetState(false);
        return;
      }

      await refreshGoogleSheetState(false);
      toast({
        title: "Google Sheets synced",
        variant: "success"
      });
    });
  }

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin) {
        return;
      }

      const payload = event.data as GoogleSheetsConnectedMessage | GoogleSheetsOauthErrorMessage | null;
      if (!payload || typeof payload !== "object" || typeof payload.type !== "string") {
        return;
      }

      if (payload.type === "orgframe:google-sheets-oauth-error") {
        if (googleSheetsOauthWatchRef.current !== null) {
          window.clearInterval(googleSheetsOauthWatchRef.current);
          googleSheetsOauthWatchRef.current = null;
        }
        setIsGoogleSheetsOauthInFlight(false);
        toast({
          title: "Unable to connect Google Sheets",
          description: payload.error,
          variant: "destructive"
        });
        return;
      }

      if (payload.type !== "orgframe:google-sheets-connected") {
        return;
      }

      if (payload.orgSlug !== orgSlug || payload.formId !== formId) {
        return;
      }

      if (googleSheetsOauthWatchRef.current !== null) {
        window.clearInterval(googleSheetsOauthWatchRef.current);
        googleSheetsOauthWatchRef.current = null;
      }
      setIsGoogleSheetsOauthInFlight(false);
      startSavingGoogleSheet(async () => {
        await refreshGoogleSheetState(false);
        toast({
          title: "Google Sheets connected",
          variant: "success"
        });
      });
    }

    window.addEventListener("message", onMessage);
    return () => {
      if (googleSheetsOauthWatchRef.current !== null) {
        window.clearInterval(googleSheetsOauthWatchRef.current);
        googleSheetsOauthWatchRef.current = null;
      }
      window.removeEventListener("message", onMessage);
    };
  }, [formId, orgSlug, startSavingGoogleSheet, toast]);

  function toCellKey(submissionId: string, fieldName: string, submissionEntryId?: string) {
    return `${submissionId}:${submissionEntryId ?? "submission"}:${fieldName}`;
  }

  async function saveInlineFieldValue(
    submission: FormSubmissionWithEntries,
    field: FormFieldDefinition,
    target: EditableTarget,
    nextValue: unknown
  ) {
    if (!canWrite || !isEditableMode) {
      return;
    }

    const cellKey = toCellKey(submission.id, field.name, target.submissionEntryId);
    setSavingCellKey(cellKey);

    const previousValue = target.value;
    const result = await updateSubmissionAnswerAction({
      orgSlug,
      formId,
      submissionId: submission.id,
      submissionEntryId: target.submissionEntryId,
      fieldName: field.name,
      value: nextValue
    });

    if (!result.ok) {
      toast({
        title: "Unable to update value",
        description: result.error,
        variant: "destructive"
      });
      setSavingCellKey(null);
      return;
    }

    if (target.submissionEntryId) {
      setEntryAnswersById((current) => {
        const next = { ...current };
        const existing = { ...(next[target.submissionEntryId ?? ""] ?? {}) };
        if (result.data.value === "" || result.data.value === null || result.data.value === undefined) {
          delete existing[result.data.fieldName];
        } else {
          existing[result.data.fieldName] = result.data.value;
        }
        next[target.submissionEntryId ?? ""] = existing;
        return next;
      });
    } else {
      setSubmissionAnswersById((current) => {
        const next = { ...current };
        const existing = { ...(next[submission.id] ?? {}) };
        if (result.data.value === "" || result.data.value === null || result.data.value === undefined) {
          delete existing[result.data.fieldName];
        } else {
          existing[result.data.fieldName] = result.data.value;
        }
        next[submission.id] = existing;
        return next;
      });
    }

    setCellDraftByKey((current) => {
      const next = { ...current };
      delete next[cellKey];
      return next;
    });
    if (formatAnswerValue(previousValue) !== formatAnswerValue(result.data.value)) {
      appendChangeLog(submission.id, {
        at: new Date().toISOString(),
        field: field.label,
        from: formatAnswerValue(previousValue),
        to: formatAnswerValue(result.data.value),
        mode: "inline_answer"
      });
    }
    setEditingCellKey((current) => (current === `field:${cellKey}` ? null : current));
    setSavingCellKey(null);
  }

  async function saveInlineStatus(submissionId: string, nextStatus: SubmissionStatus) {
    if (!canWrite || !isEditableMode) {
      return;
    }

    const previousStatus = savedStatusById[submissionId] ?? statusById[submissionId] ?? nextStatus;
    setSavingInlineStatusId(submissionId);

    const result = await setSubmissionStatusAction({
      orgSlug,
      formId,
      submissionId,
      status: nextStatus
    });

    if (!result.ok) {
      toast({
        title: "Unable to update submission",
        description: result.error,
        variant: "destructive"
      });
      setSavingInlineStatusId(null);
      return;
    }

    setSavedStatusById((current) => ({
      ...current,
      [submissionId]: nextStatus
    }));
    if (previousStatus !== nextStatus) {
      appendChangeLog(submissionId, {
        at: new Date().toISOString(),
        field: "Status",
        from: toStatusLabel(previousStatus),
        to: toStatusLabel(nextStatus),
        mode: "inline_answer"
      });
    }
    setEditingCellKey((current) => (current === `status:${submissionId}` ? null : current));
    setSavingInlineStatusId(null);
  }

  async function saveInlineAdminNotes(submissionId: string, nextAdminNotes: string) {
    if (!canWrite || !isEditableMode) {
      return;
    }

    const trimmed = nextAdminNotes.trim();
    const previous = (savedAdminNotesById[submissionId] ?? adminNotesById[submissionId] ?? "").trim();
    if (trimmed === previous) {
      setEditingCellKey((current) => (current === `adminNotes:${submissionId}` ? null : current));
      return;
    }

    setSavingInlineNotesId(submissionId);
    const result = await updateSubmissionAdminNotesAction({
      orgSlug,
      formId,
      submissionId,
      adminNotes: trimmed.length > 0 ? trimmed : null
    });

    if (!result.ok) {
      toast({
        title: "Unable to update notes",
        description: result.error,
        variant: "destructive"
      });
      setSavingInlineNotesId(null);
      return;
    }

    setSavedAdminNotesById((current) => ({
      ...current,
      [submissionId]: trimmed
    }));
    setAdminNotesById((current) => ({
      ...current,
      [submissionId]: trimmed
    }));

    appendChangeLog(submissionId, {
      at: new Date().toISOString(),
      field: "Admin notes",
      from: previous.length > 0 ? previous : "None",
      to: trimmed.length > 0 ? trimmed : "None",
      mode: "inline_answer"
    });

    setEditingCellKey((current) => (current === `adminNotes:${submissionId}` ? null : current));
    setSavingInlineNotesId(null);
  }

  const handleVisibleRowsChange = useCallback((rows: FormSubmissionWithEntries[]) => {
    const nextIds = rows.map((row) => row.id);
    setVisibleSubmissionIds((current) => {
      if (current.length === nextIds.length && current.every((id, index) => id === nextIds[index])) {
        return current;
      }

      return nextIds;
    });
  }, []);

  const responseColumns = useMemo<DataTableColumn<FormSubmissionWithEntries>[]>(() => {
    const seenFieldKeys = new Set<string>();

    return formSchema.pages.flatMap((page) =>
      page.fields
        .filter((field) => {
          if (seenFieldKeys.has(field.name)) {
            return false;
          }

          seenFieldKeys.add(field.name);
          return true;
        })
        .map((field) => {
          const fieldKeys = [field.name, field.id];

          return {
            key: `field:${field.name}`,
            label: field.label,
            group: "Form responses",
            defaultVisible: false,
            sortable: true,
            searchable: true,
            renderCell: (submission: FormSubmissionWithEntries) => {
              const target = resolveEditableTarget(submission, fieldKeys, submissionAnswersById, entryAnswersById, field.name);
              const value = target?.value;

              if (!isEditableMode || !canWrite || !target) {
                return <span className="line-clamp-2">{formatAnswerValue(value)}</span>;
              }

              const cellKey = toCellKey(submission.id, field.name, target.submissionEntryId);
              const draftValue = cellDraftByKey[cellKey];
              const effectiveValue = draftValue !== undefined ? draftValue : value;
              const isSavingCell = savingCellKey === cellKey;
              const editorKey = `field:${cellKey}`;
              const isEditingThisCell = editingCellKey === editorKey;

              if (!isEditingThisCell) {
                return (
                  <div className="cursor-default" title={canWrite && isEditableMode ? "Click selected cell again to edit" : undefined}>
                    {formatAnswerValue(effectiveValue)}
                  </div>
                );
              }

              if (field.type === "checkbox") {
                return (
                  <div
                    data-inline-editor="true"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <Checkbox
                      checked={effectiveValue === true || effectiveValue === "true" || effectiveValue === "on"}
                      disabled={isSavingCell}
                      onChange={(event) => {
                        const next = event.target.checked;
                        setCellDraftByKey((current) => ({
                          ...current,
                          [cellKey]: next
                        }));
                        void saveInlineFieldValue(submission, field, target, next);
                      }}
                    />
                  </div>
                );
              }

              if (field.type === "select") {
                return (
                  <div
                    data-inline-editor="true"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <Select
                      className="!h-auto !border-0 !bg-transparent !px-0 !py-0 !text-sm !shadow-none focus:!ring-0 focus:!ring-offset-0 focus-visible:!ring-0 focus-visible:!ring-offset-0"
                      disabled={isSavingCell}
                      onChange={(event) => {
                        const next = event.target.value;
                        setCellDraftByKey((current) => ({
                          ...current,
                          [cellKey]: next
                        }));
                        void saveInlineFieldValue(submission, field, target, next);
                      }}
                      options={[
                        { value: "", label: "Select" },
                        ...field.options.map((option) => ({ value: option.value, label: option.label }))
                      ]}
                      value={typeof effectiveValue === "string" ? effectiveValue : ""}
                    />
                  </div>
                );
              }

              if (field.type === "date") {
                return (
                  <div
                    data-inline-editor="true"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <CalendarPicker
                      className="[&_>div]:!h-auto [&_>div]:!border-0 [&_>div]:!bg-transparent [&_>div]:!px-0 [&_>div]:!py-0 [&_>div]:!ring-0 [&_input]:!px-0 [&_input]:!text-sm [&_input]:!leading-tight [&_button]:!border-0 [&_button]:!bg-transparent [&_button]:hover:!bg-transparent"
                      disabled={isSavingCell}
                      onChange={(nextValue) => {
                        setCellDraftByKey((current) => ({
                          ...current,
                          [cellKey]: nextValue
                        }));
                        void saveInlineFieldValue(submission, field, target, nextValue);
                      }}
                      value={typeof effectiveValue === "string" ? effectiveValue : ""}
                    />
                  </div>
                );
              }

              const inputType = field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";
              const inputValue =
                typeof effectiveValue === "string" || typeof effectiveValue === "number" ? String(effectiveValue) : "";

              return (
                <div
                  data-inline-editor="true"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <Input
                    autoFocus={isEditingThisCell}
                    className="!h-auto !border-0 !bg-transparent !px-0 !py-0 !text-sm !shadow-none focus:!ring-0 focus:!ring-offset-0 focus-visible:!ring-0 focus-visible:!ring-offset-0"
                    disabled={isSavingCell}
                    onBlur={(event) => {
                      let next: string | number = event.target.value;
                      if (field.type === "phone") {
                        next = formatPhoneNumberInput(next);
                      }

                      if (field.type === "number") {
                        next = next.trim().length === 0 ? 0 : Number(next);
                      }

                      void saveInlineFieldValue(submission, field, target, next);
                    }}
                    onChange={(event) => {
                      const next = field.type === "phone" ? formatPhoneNumberInput(event.target.value) : event.target.value;
                      setCellDraftByKey((current) => ({
                        ...current,
                        [cellKey]: next
                      }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setCellDraftByKey((current) => {
                          const next = { ...current };
                          delete next[cellKey];
                          return next;
                        });
                        setEditingCellKey(null);
                      }
                    }}
                    type={inputType}
                    value={inputValue}
                  />
                </div>
              );
            },
            renderCopyValue: (submission: FormSubmissionWithEntries) => {
              const value = getSubmissionFieldResponse(submission, fieldKeys, submissionAnswersById, entryAnswersById);
              return formatAnswerValue(value);
            },
            renderSearchValue: (submission: FormSubmissionWithEntries) => {
              const value = getSubmissionFieldResponse(submission, fieldKeys, submissionAnswersById, entryAnswersById);
              return formatAnswerValue(value);
            },
            renderSortValue: (submission: FormSubmissionWithEntries) => {
              const value = getSubmissionFieldResponse(submission, fieldKeys, submissionAnswersById, entryAnswersById);
              return formatAnswerValue(value);
            }
          } satisfies DataTableColumn<FormSubmissionWithEntries>;
        })
    );
  }, [canWrite, cellDraftByKey, editingCellKey, entryAnswersById, formSchema.pages, isEditableMode, savingCellKey, submissionAnswersById]);

  const submissionTableColumns = useMemo<DataTableColumn<FormSubmissionWithEntries>[]>(
    () => [
      {
        key: "__selected",
        label: "",
        group: "Selection",
        pinDefault: "left",
        sortable: false,
        searchable: false,
        className: "w-10 text-center",
        headerClassName: "w-10 text-center",
        renderCell: (submission) => (
          <Checkbox
            checked={selectedSubmissionIdSet.has(submission.id)}
            onChange={(event) => {
              const nativeEvent = event.nativeEvent;
              const isShiftSelection = nativeEvent instanceof MouseEvent && nativeEvent.shiftKey;
              handleSelectSubmission(submission.id, event.target.checked, isShiftSelection);
            }}
          />
        ),
        renderCopyValue: () => ""
      },
      {
        key: "submittedAt",
        label: "Submitted",
        group: "Submission",
        sortable: true,
        renderCell: (submission) => <span className="bg-surface">{new Date(submission.createdAt).toLocaleString()}</span>,
        renderCopyValue: (submission) => new Date(submission.createdAt).toLocaleString(),
        renderSortValue: (submission) => new Date(submission.createdAt).getTime()
      },
      {
        key: "status",
        label: "Status",
        group: "Submission",
        sortable: true,
        renderCell: (submission) => {
          const status = statusById[submission.id] ?? submission.status;
          if (isEditableMode && canWrite) {
            return (
              <div>
                {editingCellKey === `status:${submission.id}` ? (
                  <div
                    data-inline-editor="true"
                    onClick={(event) => {
                      event.stopPropagation();
                    }}
                  >
                    <Select
                      className="!h-auto !border-0 !bg-transparent !px-0 !py-0 !text-sm !shadow-none focus:!ring-0 focus:!ring-offset-0 focus-visible:!ring-0 focus-visible:!ring-offset-0"
                      disabled={savingInlineStatusId === submission.id}
                      onChange={(event) => {
                        const nextStatus = event.target.value as SubmissionStatus;
                        setStatusById((current) => ({
                          ...current,
                          [submission.id]: nextStatus
                        }));
                        void saveInlineStatus(submission.id, nextStatus);
                      }}
                      options={asStatusOptions()}
                      value={status}
                    />
                  </div>
                ) : (
                  <div title="Click selected cell again to edit">
                    <Chip className="normal-case tracking-normal !bg-surface" color={toChipColor(status)}>
                      {toStatusLabel(status)}
                    </Chip>
                  </div>
                )}
              </div>
            );
          }

          return (
            <Chip className="normal-case tracking-normal !bg-surface" color={toChipColor(status)}>
              {toStatusLabel(status)}
            </Chip>
          );
        },
        renderCopyValue: (submission) => toStatusLabel(statusById[submission.id] ?? submission.status),
        renderSearchValue: (submission) => toStatusLabel(statusById[submission.id] ?? submission.status),
        renderSortValue: (submission) => toStatusLabel(statusById[submission.id] ?? submission.status)
      },
      {
        key: "adminNotes",
        label: "Admin notes",
        group: "Submission",
        sortable: true,
        renderCell: (submission) => {
          const value = adminNotesById[submission.id] ?? submission.adminNotes ?? "";
          if (isEditableMode && canWrite) {
            const isEditing = editingCellKey === `adminNotes:${submission.id}`;
            if (isEditing) {
              return (
                <div
                  data-inline-editor="true"
                  onClick={(event) => {
                    event.stopPropagation();
                  }}
                >
                  <Input
                    autoFocus
                    className="!h-auto !border-0 !bg-transparent !px-0 !py-0 !text-sm !shadow-none focus:!ring-0 focus:!ring-offset-0 focus-visible:!ring-0 focus-visible:!ring-offset-0"
                    disabled={savingInlineNotesId === submission.id}
                    onBlur={(event) => {
                      void saveInlineAdminNotes(submission.id, event.target.value);
                    }}
                    onChange={(event) => {
                      setAdminNotesById((current) => ({
                        ...current,
                        [submission.id]: event.target.value
                      }));
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.currentTarget.blur();
                      }
                      if (event.key === "Escape") {
                        setAdminNotesById((current) => ({
                          ...current,
                          [submission.id]: savedAdminNotesById[submission.id] ?? ""
                        }));
                        setEditingCellKey(null);
                      }
                    }}
                    value={value}
                  />
                </div>
              );
            }
          }

          return <span className="line-clamp-2">{value.length > 0 ? value : "-"}</span>;
        },
        renderCopyValue: (submission) => adminNotesById[submission.id] ?? submission.adminNotes ?? "",
        renderSearchValue: (submission) => adminNotesById[submission.id] ?? submission.adminNotes ?? "",
        renderSortValue: (submission) => adminNotesById[submission.id] ?? submission.adminNotes ?? ""
      },
      {
        key: "players",
        label: "Players",
        group: "Submission",
        sortable: true,
        searchable: false,
        renderCell: (submission) => (
          <span className="bg-surface">{formKind === "program_registration" ? String(submission.entries.length) : "N/A"}</span>
        ),
        renderCopyValue: (submission) => (formKind === "program_registration" ? String(submission.entries.length) : "N/A"),
        renderSortValue: (submission) => (formKind === "program_registration" ? submission.entries.length : 0)
      },
      {
        key: "submissionId",
        label: "Submission ID",
        group: "Submission",
        defaultVisible: false,
        sortable: true,
        className: "font-mono text-xs",
        renderCell: (submission) => submission.id,
        renderSearchValue: (submission) => submission.id,
        renderSortValue: (submission) => submission.id
      },
      ...responseColumns
    ],
    [
      adminNotesById,
      canWrite,
      editingCellKey,
      formKind,
      handleSelectSubmission,
      isEditableMode,
      responseColumns,
      savedAdminNotesById,
      savingInlineNotesId,
      savingInlineStatusId,
      statusById
    ]
  );

  const selectedSubmission = selectedSubmissionId ? submissionRows.find((submission) => submission.id === selectedSubmissionId) ?? null : null;
  const selectedSubmissionAnswers = selectedSubmission ? (submissionAnswersById[selectedSubmission.id] ?? selectedSubmission.answersJson) : {};
  const selectedSubmissionAdminNotes = selectedSubmission ? (adminNotesById[selectedSubmission.id] ?? selectedSubmission.adminNotes ?? "") : "";
  const selectedSubmissionEntries = selectedSubmission
    ? selectedSubmission.entries.map((entry) => ({
        ...entry,
        answersJson: entryAnswersById[entry.id] ?? entry.answersJson
      }))
    : [];
  const fieldLabelByKey = useMemo(() => {
    const fieldMap = new Map<string, string>();
    formSchema.pages.forEach((page) => {
      page.fields.forEach((field) => {
        fieldMap.set(field.name, field.label);
        fieldMap.set(field.id, field.label);
      });
    });
    return fieldMap;
  }, [formSchema.pages]);

  const fieldKeysByColumnKey = useMemo(() => {
    const map = new Map<string, string[]>();
    const seenFieldKeys = new Set<string>();

    formSchema.pages.forEach((page) => {
      page.fields.forEach((field) => {
        if (seenFieldKeys.has(field.name)) {
          return;
        }
        seenFieldKeys.add(field.name);
        map.set(`field:${field.name}`, [field.name, field.id]);
      });
    });

    return map;
  }, [formSchema.pages]);

  const filterFieldOptions = useMemo<SubmissionFilterFieldOption[]>(() => {
    const options: SubmissionFilterFieldOption[] = [
      {
        key: "status",
        label: "Status",
        type: "status",
        options: asStatusOptions().map((option) => ({ value: option.value, label: option.label }))
      },
      {
        key: "adminNotes",
        label: "Admin notes",
        type: "text"
      },
      {
        key: "submittedAt",
        label: "Submitted at",
        type: "datetime"
      }
    ];

    if (formKind === "program_registration") {
      options.push({
        key: "players",
        label: "Players",
        type: "number"
      });
    }

    const seenFieldKeys = new Set<string>();
    formSchema.pages.forEach((page) => {
      page.fields.forEach((field) => {
        if (seenFieldKeys.has(field.name)) {
          return;
        }

        seenFieldKeys.add(field.name);
        options.push({
          key: `field:${field.name}`,
          label: field.label,
          type:
            field.type === "checkbox"
              ? "checkbox"
              : field.type === "select"
                ? "select"
                : field.type === "number"
                  ? "number"
                  : field.type === "date"
                    ? "date"
                    : "text",
          options: field.type === "select" ? field.options : undefined
        });
      });
    });

    return options;
  }, [formKind, formSchema.pages]);

  const filterFieldByKey = useMemo(() => new Map(filterFieldOptions.map((option) => [option.key, option])), [filterFieldOptions]);

  const activeSavedView = useMemo(
    () => (activeViewId ? savedViews.find((view) => view.id === activeViewId) ?? null : null),
    [activeViewId, savedViews]
  );

  const activeSavedViewFiltersSignature = useMemo(
    () => JSON.stringify(normalizeViewFilters(activeSavedView?.configJson?.filters)),
    [activeSavedView]
  );
  const activeSavedViewSummaryCardsSignature = useMemo(
    () => JSON.stringify(normalizeSummaryCards(activeSavedView?.configJson?.summaryCards)),
    [activeSavedView]
  );

  const allTableColumnKeys = useMemo(() => submissionTableColumns.map((column) => column.key), [submissionTableColumns]);
  const defaultVisibleTableColumnKeys = useMemo(() => {
    const visible = submissionTableColumns.filter((column) => column.defaultVisible !== false).map((column) => column.key);
    return visible.length > 0 ? visible : allTableColumnKeys;
  }, [allTableColumnKeys, submissionTableColumns]);
  const defaultPinnedLeftTableColumnKeys = useMemo(
    () => submissionTableColumns.filter((column) => column.pinDefault === "left").map((column) => column.key),
    [submissionTableColumns]
  );
  const defaultPinnedRightTableColumnKeys = useMemo(
    () => submissionTableColumns.filter((column) => column.pinDefault === "right").map((column) => column.key),
    [submissionTableColumns]
  );

  useEffect(() => {
    if (savedViews.length === 0) {
      setActiveViewId(null);
      return;
    }

    if (!activeViewId || !savedViews.some((view) => view.id === activeViewId)) {
      setActiveViewId(savedViews[0]?.id ?? null);
    }
  }, [activeViewId, savedViews]);

  useEffect(() => {
    if (appliedFiltersSignatureRef.current === activeSavedViewFiltersSignature) {
      return;
    }
    appliedFiltersSignatureRef.current = activeSavedViewFiltersSignature;
    setViewFiltersDraft(normalizeViewFilters(activeSavedView?.configJson?.filters));
  }, [activeSavedView?.configJson?.filters, activeSavedViewFiltersSignature]);

  useEffect(() => {
    if (appliedSummaryCardsSignatureRef.current === activeSavedViewSummaryCardsSignature) {
      return;
    }
    appliedSummaryCardsSignatureRef.current = activeSavedViewSummaryCardsSignature;
    setViewSummaryCardsDraft(normalizeSummaryCards(activeSavedView?.configJson?.summaryCards));
  }, [activeSavedView?.configJson?.summaryCards, activeSavedViewSummaryCardsSignature]);

  const activeTableViewConfig = useMemo<Partial<DataTableViewConfig> | null>(() => {
    if (!activeSavedView) {
      return null;
    }

    const config = activeSavedView.configJson ?? {};
    const sortValue = config.sort ?? null;
    const sort =
      sortValue && typeof sortValue === "object"
        ? {
            columnKey: typeof sortValue.columnKey === "string" ? sortValue.columnKey : null,
            direction: sortValue.direction === "desc" ? ("desc" as const) : ("asc" as const)
          }
        : undefined;

    return {
      visibleColumnKeys: Array.isArray(config.visibleColumnKeys) ? config.visibleColumnKeys : undefined,
      columnOrderKeys: Array.isArray(config.columnOrderKeys) ? config.columnOrderKeys : undefined,
      pinnedLeftColumnKeys: Array.isArray(config.pinnedLeftColumnKeys) ? config.pinnedLeftColumnKeys : undefined,
      pinnedRightColumnKeys: Array.isArray(config.pinnedRightColumnKeys) ? config.pinnedRightColumnKeys : undefined,
      columnWidthsByKey:
        config.columnWidthsByKey && typeof config.columnWidthsByKey === "object" && !Array.isArray(config.columnWidthsByKey)
          ? (config.columnWidthsByKey as Record<string, number>)
          : undefined,
      sort,
      searchQuery: typeof config.searchQuery === "string" ? config.searchQuery : ""
    };
  }, [activeSavedView]);

  const hasUnsavedLayoutChanges = useMemo(() => {
    if (!activeSavedView || !tableConfigDraft) {
      return false;
    }

    const currentVisible = normalizeVisibleColumnKeys(
      tableConfigDraft.visibleColumnKeys,
      allTableColumnKeys,
      defaultVisibleTableColumnKeys
    );
    const currentOrder = normalizeColumnOrderKeys(tableConfigDraft.columnOrderKeys, allTableColumnKeys);
    const savedVisible = normalizeVisibleColumnKeys(
      activeSavedView.configJson?.visibleColumnKeys,
      allTableColumnKeys,
      defaultVisibleTableColumnKeys
    );
    const savedOrder = normalizeColumnOrderKeys(activeSavedView.configJson?.columnOrderKeys, allTableColumnKeys);
    const currentPinnedLeft = normalizePinnedColumnKeys(
      tableConfigDraft.pinnedLeftColumnKeys,
      allTableColumnKeys,
      defaultPinnedLeftTableColumnKeys
    );
    const currentPinnedRight = normalizePinnedColumnKeys(
      tableConfigDraft.pinnedRightColumnKeys,
      allTableColumnKeys,
      defaultPinnedRightTableColumnKeys
    );
    const savedPinnedLeft = normalizePinnedColumnKeys(
      activeSavedView.configJson?.pinnedLeftColumnKeys,
      allTableColumnKeys,
      defaultPinnedLeftTableColumnKeys
    );
    const savedPinnedRight = normalizePinnedColumnKeys(
      activeSavedView.configJson?.pinnedRightColumnKeys,
      allTableColumnKeys,
      defaultPinnedRightTableColumnKeys
    );
    const currentColumnWidthsByKey = normalizeColumnWidthsByKey(tableConfigDraft.columnWidthsByKey, allTableColumnKeys);
    const savedColumnWidthsByKey = normalizeColumnWidthsByKey(activeSavedView.configJson?.columnWidthsByKey, allTableColumnKeys);

    return (
      JSON.stringify(currentVisible) !== JSON.stringify(savedVisible) ||
      JSON.stringify(currentOrder) !== JSON.stringify(savedOrder) ||
      JSON.stringify(currentPinnedLeft) !== JSON.stringify(savedPinnedLeft) ||
      JSON.stringify(currentPinnedRight) !== JSON.stringify(savedPinnedRight) ||
      JSON.stringify(currentColumnWidthsByKey) !== JSON.stringify(savedColumnWidthsByKey)
    );
  }, [
    activeSavedView,
    allTableColumnKeys,
    defaultPinnedLeftTableColumnKeys,
    defaultPinnedRightTableColumnKeys,
    defaultVisibleTableColumnKeys,
    tableConfigDraft
  ]);

  const hasUnsavedFilterChanges = useMemo(() => {
    if (!activeSavedView) {
      return false;
    }

    const savedFilters = normalizeViewFilters(activeSavedView.configJson?.filters);
    return JSON.stringify(savedFilters) !== JSON.stringify(viewFiltersDraft);
  }, [activeSavedView, viewFiltersDraft]);

  const hasUnsavedSummaryCardChanges = useMemo(() => {
    if (!activeSavedView) {
      return false;
    }

    const savedSummaryCards = toSummaryCardsForSave(normalizeSummaryCards(activeSavedView.configJson?.summaryCards));
    return JSON.stringify(savedSummaryCards) !== JSON.stringify(toSummaryCardsForSave(viewSummaryCardsDraft));
  }, [activeSavedView, viewSummaryCardsDraft]);

  useEffect(() => {
    if (!canWrite) {
      return;
    }

    if (!activeSavedView || !tableConfigDraft || (!hasUnsavedLayoutChanges && !hasUnsavedFilterChanges && !hasUnsavedSummaryCardChanges)) {
      return;
    }

    if (autoSaveTimerRef.current) {
      window.clearTimeout(autoSaveTimerRef.current);
    }

    const viewId = activeSavedView.id;
    const visibleColumnKeys = Array.isArray(tableConfigDraft.visibleColumnKeys) ? tableConfigDraft.visibleColumnKeys : [];
    const columnOrderKeys = Array.isArray(tableConfigDraft.columnOrderKeys) ? tableConfigDraft.columnOrderKeys : [];
    const pinnedLeftColumnKeys = Array.isArray(tableConfigDraft.pinnedLeftColumnKeys) ? tableConfigDraft.pinnedLeftColumnKeys : [];
    const pinnedRightColumnKeys = Array.isArray(tableConfigDraft.pinnedRightColumnKeys) ? tableConfigDraft.pinnedRightColumnKeys : [];
    const columnWidthsByKey = normalizeColumnWidthsByKey(tableConfigDraft.columnWidthsByKey, allTableColumnKeys);

    autoSaveTimerRef.current = window.setTimeout(() => {
      const requestId = autoSaveRequestIdRef.current + 1;
      autoSaveRequestIdRef.current = requestId;
      setAutoSavingViewId(viewId);
      setSaveStateByViewId((current) => ({
        ...current,
        [viewId]: "saving"
      }));

      void (async () => {
        try {
          const result = await updateFormSubmissionViewLayoutAction({
            orgSlug,
            formId,
            viewId,
            visibleColumnKeys,
            columnOrderKeys,
            pinnedLeftColumnKeys,
            pinnedRightColumnKeys,
            columnWidthsByKey,
            filters: viewFiltersDraft,
            summaryCards: toSummaryCardsForSave(viewSummaryCardsDraft)
          });

          if (autoSaveRequestIdRef.current !== requestId) {
            return;
          }

          if (!result.ok) {
            setSaveStateByViewId((current) => {
              const next = { ...current };
              delete next[viewId];
              return next;
            });
            toast({
              title: "Unable to save view",
              description: result.error,
              variant: "destructive"
            });
            return;
          }

          setSavedViews((current) => current.map((view) => (view.id === result.data.view.id ? result.data.view : view)));
          setSaveStateByViewId((current) => ({
            ...current,
            [viewId]: "saved"
          }));
        } finally {
          if (autoSaveRequestIdRef.current === requestId) {
            setAutoSavingViewId((current) => (current === viewId ? null : current));
          }
        }
      })();
    }, 450);

    return () => {
      if (autoSaveTimerRef.current) {
        window.clearTimeout(autoSaveTimerRef.current);
        autoSaveTimerRef.current = null;
      }
    };
  }, [
    activeSavedView,
    canWrite,
    formId,
    hasUnsavedFilterChanges,
    hasUnsavedLayoutChanges,
    hasUnsavedSummaryCardChanges,
    orgSlug,
    tableConfigDraft,
    toast,
    viewFiltersDraft,
    viewSummaryCardsDraft
  ]);

  useEffect(() => {
    if (!autoSavingViewId) {
      return;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "Changes are still saving.";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [autoSavingViewId]);

  const visibilityOptions = useMemo(
    () => [
      { value: "private", label: "Just you" },
      { value: "forms_readers", label: "Everyone with form data access" },
      { value: "specific_admin", label: "Specific admin account" }
    ],
    []
  );

  const adminTargetOptions = useMemo(
    () =>
      viewAdminAccounts.map((admin) => ({
        value: admin.userId,
        label: admin.email ? `${admin.label} (${admin.email})` : admin.label
      })),
    [viewAdminAccounts]
  );

  function handleCreateView() {
    const trimmedName = newViewName.trim();
    if (trimmedName.length === 0) {
      toast({
        title: "View name is required",
        variant: "warning"
      });
      return;
    }

    const latestConfig = tableConfigDraftRef.current ?? tableConfigDraft;
    if (!latestConfig) {
      toast({
        title: "Table config not ready yet",
        variant: "warning"
      });
      return;
    }

    if (newViewVisibility === "specific_admin" && newViewTargetUserId.trim().length === 0) {
      toast({
        title: "Select an admin account",
        variant: "warning"
      });
      return;
    }

    startSavingView(async () => {
      const result = await createFormSubmissionViewAction({
        orgSlug,
        formId,
        name: trimmedName,
        visibilityScope: newViewVisibility,
        targetUserId: newViewVisibility === "specific_admin" ? newViewTargetUserId : null,
        config: {
          visibleColumnKeys: latestConfig.visibleColumnKeys,
          columnOrderKeys: latestConfig.columnOrderKeys,
          pinnedLeftColumnKeys: latestConfig.pinnedLeftColumnKeys,
          pinnedRightColumnKeys: latestConfig.pinnedRightColumnKeys,
          columnWidthsByKey: latestConfig.columnWidthsByKey,
          sort: latestConfig.sort,
          searchQuery: latestConfig.searchQuery,
          filters: viewFiltersDraft,
          summaryCards: toSummaryCardsForSave(viewSummaryCardsDraft)
        }
      });

      if (!result.ok) {
        toast({
          title: "Unable to create view",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setSavedViews((current) => [...current, result.data.view]);
      setActiveViewId(result.data.view.id);
      setIsCreateViewPanelOpen(false);
      setNewViewName("");
      setNewViewVisibility("private");
      setNewViewTargetUserId("");
      toast({
        title: "View saved",
        variant: "success"
      });
    });
  }

  function openEditViewPanel(view: LocalFormSubmissionView) {
    setEditingViewId(view.id);
    setEditViewName(view.name);
    setEditViewVisibility(view.visibilityScope);
    setEditViewTargetUserId(view.targetUserId ?? "");
    setIsEditViewPanelOpen(true);
  }

  function handleUpdateViewSettings() {
    if (!editingViewId) {
      return;
    }

    const trimmedName = editViewName.trim();
    if (trimmedName.length === 0) {
      toast({
        title: "View name is required",
        variant: "warning"
      });
      return;
    }

    if (editViewVisibility === "specific_admin" && editViewTargetUserId.trim().length === 0) {
      toast({
        title: "Select an admin account",
        variant: "warning"
      });
      return;
    }

    startSavingView(async () => {
      const result = await updateFormSubmissionViewSettingsAction({
        orgSlug,
        formId,
        viewId: editingViewId,
        name: trimmedName,
        visibilityScope: editViewVisibility,
        targetUserId: editViewVisibility === "specific_admin" ? editViewTargetUserId : null
      });

      if (!result.ok) {
        toast({
          title: "Unable to update view",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setSavedViews((current) => current.map((view) => (view.id === result.data.view.id ? result.data.view : view)));
      setIsEditViewPanelOpen(false);
      toast({
        title: "View updated",
        variant: "success"
      });
    });
  }

  function handleDeleteView(viewId: string) {
    if (savedViews.length <= 1) {
      toast({
        title: "At least one view is required",
        variant: "warning"
      });
      return;
    }

    startSavingView(async () => {
      const result = await deleteFormSubmissionViewAction({
        orgSlug,
        formId,
        viewId
      });

      if (!result.ok) {
        toast({
          title: "Unable to delete view",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setSavedViews((current) => {
        const next = current.filter((view) => view.id !== result.data.viewId);
        if (activeViewId === result.data.viewId) {
          setActiveViewId(next[0]?.id ?? null);
        }
        return next;
      });
      setIsEditViewPanelOpen(false);
      toast({
        title: "View deleted",
        variant: "success"
      });
    });
  }

  function handleReorderViews(nextViews: LocalFormSubmissionView[]) {
    const previousViews = savedViews;
    const nextOrder = nextViews.map((view) => view.id);
    setSavedViews(nextViews);

    startSavingView(async () => {
      const result = await reorderFormSubmissionViewsAction({
        orgSlug,
        formId,
        viewOrder: nextOrder
      });

      if (!result.ok) {
        setSavedViews(previousViews);
        toast({
          title: "Unable to reorder views",
          description: result.error,
          variant: "destructive"
        });
      }
    });
  }

  function addFilterRule() {
    const defaultField = filterFieldOptions[0];
    if (!defaultField) {
      return;
    }

    const defaultOperator = getOperatorOptions(defaultField.type)[0]?.value ?? "contains";
    setViewFiltersDraft((current) => ({
      ...current,
      rules: [
        ...current.rules,
        {
          id: createFilterRuleId(),
          fieldKey: defaultField.key,
          operator: defaultOperator,
          value: ""
        }
      ]
    }));
  }

  function updateFilterLogic(logic: FormSubmissionViewFilterLogic) {
    setViewFiltersDraft((current) => ({
      ...current,
      logic
    }));
  }

  function updateFilterRule(ruleId: string, updater: (current: FormSubmissionViewFilterRule) => FormSubmissionViewFilterRule) {
    setViewFiltersDraft((current) => ({
      ...current,
      rules: current.rules.map((rule) => (rule.id === ruleId ? updater(rule) : rule))
    }));
  }

  function removeFilterRule(ruleId: string) {
    setViewFiltersDraft((current) => ({
      ...current,
      rules: current.rules.filter((rule) => rule.id !== ruleId)
    }));
  }

function addSummaryCard() {
    if (viewSummaryCardsDraft.length >= 5) {
      return;
    }
    const defaultMetric = SUMMARY_METRIC_OPTIONS[0]?.value ?? "total_submissions";
    const defaultLabel = SUMMARY_METRIC_OPTIONS[0]?.label ?? "Total items";
    setViewSummaryCardsDraft((current) => [
      ...current,
      {
        id: createFilterRuleId(),
        label: defaultLabel,
        metricKey: defaultMetric
      }
    ]);
  }

  function removeSummaryCard(cardId: string) {
    cancelSummaryCardLabelEdit(cardId);
    setViewSummaryCardsDraft((current) => {
      const next = current.filter((card) => card.id !== cardId);
      return next.length > 0 ? next : DEFAULT_SUMMARY_CARDS;
    });
  }

  function updateSummaryCard(cardId: string, updater: (current: FormSubmissionViewSummaryCard) => FormSubmissionViewSummaryCard) {
    setViewSummaryCardsDraft((current) => current.map((card) => (card.id === cardId ? updater(card) : card)));
  }

  function reorderSummaryCards(nextCards: FormSubmissionViewSummaryCard[]) {
    setViewSummaryCardsDraft(nextCards);
  }

  function startSummaryCardLabelEdit(card: FormSubmissionViewSummaryCard) {
    setSummaryCardLabelDraftById((current) => ({
      ...current,
      [card.id]: card.label
    }));
    setEditingSummaryCardId(card.id);
  }

  function commitSummaryCardLabelEdit(card: FormSubmissionViewSummaryCard) {
    const rawDraft = summaryCardLabelDraftById[card.id] ?? card.label;
    const trimmed = rawDraft.trim();
    const fallbackLabel = SUMMARY_METRIC_OPTIONS.find((option) => option.value === card.metricKey)?.label ?? "Metric";
    updateSummaryCard(card.id, (current) => ({
      ...current,
      label: trimmed.length > 0 ? trimmed : fallbackLabel
    }));
    setSummaryCardLabelDraftById((current) => {
      const next = { ...current };
      delete next[card.id];
      return next;
    });
    setEditingSummaryCardId((current) => (current === card.id ? null : current));
  }

  function cancelSummaryCardLabelEdit(cardId: string) {
    setSummaryCardLabelDraftById((current) => {
      const next = { ...current };
      delete next[cardId];
      return next;
    });
    setEditingSummaryCardId((current) => (current === cardId ? null : current));
  }

  const handleTableCellClick = useCallback(
    (context: { item: FormSubmissionWithEntries; columnKey: string; isActiveCell: boolean }) => {
      if (!isEditableMode || !canWrite || !context.isActiveCell) {
        return;
      }

      if (context.columnKey === "status") {
        setEditingCellKey(`status:${context.item.id}`);
        return;
      }

      if (context.columnKey === "adminNotes") {
        setEditingCellKey(`adminNotes:${context.item.id}`);
        return;
      }

      if (!context.columnKey.startsWith("field:")) {
        return;
      }

      const fieldKeys = fieldKeysByColumnKey.get(context.columnKey);
      if (!fieldKeys || fieldKeys.length === 0) {
        return;
      }

      const primaryFieldKey = fieldKeys[0] ?? "";
      const target = resolveEditableTarget(context.item, fieldKeys, submissionAnswersById, entryAnswersById, primaryFieldKey);
      if (!target) {
        return;
      }

      const cellKey = toCellKey(context.item.id, primaryFieldKey, target.submissionEntryId);
      setEditingCellKey(`field:${cellKey}`);
    },
    [canWrite, entryAnswersById, fieldKeysByColumnKey, isEditableMode, submissionAnswersById]
  );

  const filteredSubmissionRows = useMemo(() => {
    const validRules = viewFiltersDraft.rules.filter((rule) => filterFieldByKey.has(rule.fieldKey));
    if (validRules.length === 0) {
      return submissionRows;
    }

    return submissionRows.filter((submission) => {
      const outcomes = validRules.map((rule) => {
        const field = filterFieldByKey.get(rule.fieldKey);
        if (!field) {
          return true;
        }

        let candidateValue: unknown;
        if (rule.fieldKey === "status") {
          candidateValue = statusById[submission.id] ?? submission.status;
        } else if (rule.fieldKey === "adminNotes") {
          candidateValue = adminNotesById[submission.id] ?? submission.adminNotes ?? "";
        } else if (rule.fieldKey === "submittedAt") {
          candidateValue = submission.createdAt;
        } else if (rule.fieldKey === "players") {
          candidateValue = submission.entries.length;
        } else if (rule.fieldKey.startsWith("field:")) {
          const fieldKey = rule.fieldKey.replace(/^field:/, "");
          candidateValue = getSubmissionFieldResponse(
            submission,
            [fieldKey],
            submissionAnswersById,
            entryAnswersById
          );
        }

        return matchesFilterRule(rule, candidateValue, field.type);
      });

      if (viewFiltersDraft.logic === "any") {
        return outcomes.some(Boolean);
      }
      return outcomes.every(Boolean);
    });
  }, [adminNotesById, entryAnswersById, filterFieldByKey, statusById, submissionAnswersById, submissionRows, viewFiltersDraft.logic, viewFiltersDraft.rules]);

  const hasActiveFilters = viewFiltersDraft.rules.length > 0;
  const summaryMetricValueByKey = useMemo(() => {
    const byStatus = filteredSubmissionRows.reduce<Record<SubmissionStatus, number>>(
      (draft, submission) => {
        const status = statusById[submission.id] ?? submission.status;
        draft[status] = (draft[status] ?? 0) + 1;
        return draft;
      },
      {
        submitted: 0,
        in_review: 0,
        approved: 0,
        rejected: 0,
        waitlisted: 0,
        cancelled: 0
      }
    );

    return {
      total_submissions: filteredSubmissionRows.length,
      total_players: filteredSubmissionRows.reduce((count, submission) => count + submission.entries.length, 0),
      status_submitted: byStatus.submitted,
      status_in_review: byStatus.in_review,
      status_approved: byStatus.approved,
      status_rejected: byStatus.rejected,
      status_waitlisted: byStatus.waitlisted,
      status_cancelled: byStatus.cancelled
    } satisfies Record<FormSubmissionViewSummaryMetricKey, number>;
  }, [filteredSubmissionRows, statusById]);
  const summaryMetricOptionByValue = useMemo(
    () => new Map(SUMMARY_METRIC_OPTIONS.map((option) => [option.value, option])),
    []
  );
  const googleSheetStatusMeta = getGoogleSheetStatusMeta(googleSheetState?.status ?? null);
  const GoogleSheetStatusIcon = googleSheetStatusMeta.icon;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle>Submissions</CardTitle>
            <CardDescription>Review and move registrations through your workflow.</CardDescription>
          </div>
          <Button
            className="shrink-0"
            loading={isRefreshingSubmissions}
            onClick={handleRefreshSubmissions}
            size="sm"
            variant="secondary"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="app-section-stack px-5 pb-5 pt-2 md:px-6 md:pb-6">
        {showGoogleSheetsUi && canWrite ? (
          <div className="ui-surface-block">
            <div className="flex items-center justify-between gap-2 rounded-control border bg-surface px-2 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <GoogleSheetStatusIcon className={`h-4 w-4 shrink-0 ${googleSheetStatusMeta.toneClassName}`} />
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-text">Google Sheets</p>
                  <p className="truncate text-[11px] text-text-muted">
                    {googleSheetStatusMeta.label}
                    {googleSheetState?.lastSyncedAt ? ` · Synced ${new Date(googleSheetState.lastSyncedAt).toLocaleString()}` : ""}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <IconButton
                  disabled={!googleSheetState || isSavingGoogleSheet || isGoogleSheetsOauthInFlight}
                  icon={isSavingGoogleSheet || isRefreshingSubmissions ? <Loader2 className="animate-spin" /> : <RefreshCw />}
                  label="Sync Google Sheets now"
                  onClick={handleSyncGoogleSheetNow}
                />
                <IconButton
                  icon={<Settings />}
                  label="Google Sheets settings"
                  onClick={() => setIsGoogleSheetsSettingsOpen(true)}
                />
              </div>
            </div>
          {!googleSheetConfigured ? (
            <Alert className="mt-3" variant="warning">
              Google Sheets is not configured on the server. Missing auth and/or OAuth environment variables.
            </Alert>
          ) : null}
          </div>
        ) : null}
        <div className="ui-surface-block space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Views</p>
          <div className="flex min-w-0 items-center gap-2 overflow-x-auto pb-1">
            <SortableCanvas
              className="flex min-w-0 items-center gap-2"
              getId={(view) => view.id}
              items={savedViews}
              onReorder={handleReorderViews}
              renderItem={(view, meta) => (
                <div className={meta.isDragging ? "shadow-card" : undefined}>
                  <FormBuilderNavItem
                    canDelete={savedViews.length > 1}
                    canMove
                    disabled={isSavingView}
                    dragAriaLabel={`Drag ${view.name} view`}
                    dragHandleProps={{
                      ...meta.handleProps.attributes,
                      ...meta.handleProps.listeners
                    }}
                    isActive={activeViewId === view.id}
                    label={view.name}
                    saveState={activeViewId === view.id ? saveStateByViewId[view.id] : undefined}
                    onDelete={() => handleDeleteView(view.id)}
                    onEdit={() => openEditViewPanel(view)}
                    onSelect={() => setActiveViewId(view.id)}
                  />
                </div>
              )}
              sortingStrategy="horizontal"
            />
            <Button className="h-[38px] shrink-0 px-2" onClick={() => setIsCreateViewPanelOpen(true)} size="sm" variant="secondary">
              <Plus className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="ui-surface-block space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Overview</p>
            <div className="flex items-center gap-2">
              <Button disabled={viewSummaryCardsDraft.length >= 5} onClick={addSummaryCard} size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Add card
              </Button>
              <Button onClick={() => setIsDataControlsPanelOpen(true)} size="sm" variant="ghost">
                Data controls
              </Button>
            </div>
          </div>
          <SortableCanvas
            className="flex w-full gap-2"
            getId={(card) => card.id}
            itemClassName="min-w-0 basis-0 flex-1"
            items={viewSummaryCardsDraft.slice(0, 5)}
            onReorder={reorderSummaryCards}
            sortingStrategy="horizontal"
            renderItem={(card, meta) => {
              const isEditingLabel = editingSummaryCardId === card.id;
              const labelDraft = summaryCardLabelDraftById[card.id] ?? card.label;

              return (
                <div
                  className="group relative min-w-0 rounded-control border bg-surface-muted px-4 py-3 pr-11"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <button
                      aria-label={`Drag ${card.label} card`}
                      className="inline-flex shrink-0 items-center justify-center p-0 text-text-muted hover:text-text"
                      type="button"
                      {...meta.handleProps.attributes}
                      {...meta.handleProps.listeners}
                    >
                      <GripVertical className="h-4 w-4" />
                    </button>
                    {isEditingLabel ? (
                      <Input
                        autoFocus
                        className="h-7 min-w-0 border-0 bg-transparent px-0 py-0 text-[11px] font-semibold uppercase tracking-wide text-text-muted shadow-none focus-visible:ring-0"
                        onBlur={() => commitSummaryCardLabelEdit(card)}
                        onChange={(event) => {
                          const nextLabel = event.target.value;
                          setSummaryCardLabelDraftById((current) => ({
                            ...current,
                            [card.id]: nextLabel
                          }));
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.currentTarget.blur();
                          }
                          if (event.key === "Escape") {
                            cancelSummaryCardLabelEdit(card.id);
                          }
                        }}
                        value={labelDraft}
                      />
                    ) : (
                      <button
                        className="min-w-0 truncate text-left text-[11px] font-semibold uppercase tracking-wide text-text-muted"
                        onClick={() => startSummaryCardLabelEdit(card)}
                        type="button"
                      >
                        {card.label}
                      </button>
                    )}
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="text-xl font-semibold text-text">{summaryMetricValueByKey[card.metricKey]}</p>
                  </div>
                </div>
              );
            }}
          />
        </div>
        <DataTable
          ariaLabel="Form submissions"
          columns={submissionTableColumns}
          data={filteredSubmissionRows}
          defaultSort={{
            columnKey: "submittedAt",
            direction: "desc"
          }}
          emptyState="No submissions yet."
          onRowClick={
            isEditableMode
              ? undefined
              : (submission) => {
                  setSelectedSubmissionId(submission.id);
                }
          }
          renderRowActions={(submission) => (
            <Button
              className="h-7 px-2 text-[11px]"
              onClick={() => setSelectedSubmissionId(submission.id)}
              size="sm"
              variant="secondary"
            >
              Open
            </Button>
          )}
          getRowClassName={(submission) => (selectedSubmissionIdSet.has(submission.id) ? "bg-accent/10" : undefined)}
          onVisibleRowsChange={handleVisibleRowsChange}
          rowKey={(submission) => submission.id}
          searchPlaceholder="Search"
          selectedRowKey={selectedSubmissionId}
          enableCellSelection
          showReadOnlyToggle
          readOnlyMode={!isEditableMode}
          onReadOnlyModeChange={(nextReadOnlyMode) => {
            setIsEditableMode(!nextReadOnlyMode);
          }}
          readOnlyToggleDisabled={!canWrite}
          readOnlyDisabledLabel="Read only (no edit permission)"
          renderToolbarActions={
            <Button onClick={() => setIsFiltersPanelOpen(true)} size="sm" variant={hasActiveFilters ? "secondary" : "ghost"}>
              <Filter className="h-3.5 w-3.5" />
              Filters{hasActiveFilters ? ` (${viewFiltersDraft.rules.length})` : ""}
            </Button>
          }
          onConfigChange={handleTableConfigChange}
          onCellClick={({ item, columnKey, isActiveCell }) => {
            handleTableCellClick({
              item,
              columnKey,
              isActiveCell
            });
          }}
          showCellGrid
          storageKey={`form-submissions-table:v2:${orgSlug}:${formId}`}
          viewConfig={activeTableViewConfig}
        />
      </CardContent>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsFiltersPanelOpen(false)} variant="ghost">
              Close
            </Button>
            <Button
              onClick={() => {
                setViewFiltersDraft(DEFAULT_VIEW_FILTERS);
              }}
              variant="secondary"
            >
              Clear filters
            </Button>
          </>
        }
        onClose={() => setIsFiltersPanelOpen(false)}
        open={isFiltersPanelOpen}
        subtitle="Filters are scoped to the active submissions view."
        title="Submission filters"
      >
        <div className="space-y-4">
          <FormField label="Match mode">
            <Select
              onChange={(event) => updateFilterLogic(event.target.value as FormSubmissionViewFilterLogic)}
              options={[
                { value: "all", label: "All rules (AND)" },
                { value: "any", label: "Any rule (OR)" }
              ]}
              value={viewFiltersDraft.logic}
            />
          </FormField>

          {viewFiltersDraft.rules.length === 0 ? <Alert variant="info">No filters configured for this view yet.</Alert> : null}

          <div className="space-y-3">
            {viewFiltersDraft.rules.map((rule, index) => {
              const field = filterFieldByKey.get(rule.fieldKey) ?? filterFieldOptions[0];
              if (!field) {
                return null;
              }

              const operatorOptions = getOperatorOptions(field.type);
              const selectedOperator = operatorOptions.some((option) => option.value === rule.operator)
                ? rule.operator
                : (operatorOptions[0]?.value ?? "contains");
              const hidesValueInput = ["is_true", "is_false", "is_empty", "is_not_empty"].includes(selectedOperator);

              return (
                <div className="space-y-2 rounded-control border bg-surface-muted p-3" key={rule.id}>
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Rule {index + 1}</p>
                  <div className="grid gap-2 md:grid-cols-[1.4fr_1fr_auto]">
                    <Select
                      onChange={(event) => {
                        const nextFieldKey = event.target.value;
                        const nextField = filterFieldByKey.get(nextFieldKey) ?? filterFieldOptions[0];
                        const nextOperator = nextField ? (getOperatorOptions(nextField.type)[0]?.value ?? "contains") : "contains";
                        updateFilterRule(rule.id, () => ({
                          ...rule,
                          fieldKey: nextFieldKey,
                          operator: nextOperator,
                          value: ""
                        }));
                      }}
                      options={filterFieldOptions.map((option) => ({ value: option.key, label: option.label }))}
                      value={field.key}
                    />
                    <Select
                      onChange={(event) => {
                        updateFilterRule(rule.id, (current) => ({
                          ...current,
                          operator: event.target.value as FormSubmissionViewFilterOperator
                        }));
                      }}
                      options={operatorOptions}
                      value={selectedOperator}
                    />
                    <Button onClick={() => removeFilterRule(rule.id)} size="sm" variant="ghost">
                      <X className="h-4 w-4" />
                      Remove
                    </Button>
                  </div>

                  {!hidesValueInput ? (
                    field.type === "status" || field.type === "select" ? (
                      <Select
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          updateFilterRule(rule.id, (current) => ({
                            ...current,
                            value: nextValue
                          }));
                        }}
                        options={[
                          { value: "", label: "Select a value" },
                          ...(field.options ?? [])
                        ]}
                        value={typeof rule.value === "string" ? rule.value : ""}
                      />
                    ) : (
                      <Input
                        onChange={(event) => {
                          const nextValue = event.target.value;
                          updateFilterRule(rule.id, (current) => ({
                            ...current,
                            value: nextValue
                          }));
                        }}
                        placeholder={
                          field.type === "datetime" || field.type === "date"
                            ? "YYYY-MM-DD"
                            : field.type === "number"
                              ? "Enter a number"
                              : "Enter a value"
                        }
                        type={field.type === "number" ? "number" : field.type === "datetime" || field.type === "date" ? "date" : "text"}
                        value={typeof rule.value === "string" ? rule.value : ""}
                      />
                    )
                  ) : null}
                </div>
              );
            })}
          </div>

          <Button onClick={addFilterRule} variant="secondary">
            <Plus className="h-4 w-4" />
            Add rule
          </Button>
        </div>
      </Panel>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsDataControlsPanelOpen(false)} variant="ghost">
              Close
            </Button>
            <Button disabled={viewSummaryCardsDraft.length >= 5} onClick={addSummaryCard} variant="secondary">
              <Plus className="h-4 w-4" />
              Add card
            </Button>
          </>
        }
        onClose={() => setIsDataControlsPanelOpen(false)}
        open={isDataControlsPanelOpen}
        subtitle="Configure where each card gets its value. Changes are scoped to this view."
        title="Data controls"
      >
        <div className="space-y-3">
          <p className="text-xs text-text-muted">{viewSummaryCardsDraft.length}/5 cards</p>
          <SortableCanvas
            className="space-y-2"
            getId={(card) => card.id}
            items={viewSummaryCardsDraft}
            onReorder={reorderSummaryCards}
            renderItem={(card, meta) => {
              const selectedMetric = summaryMetricOptionByValue.get(card.metricKey);

              return (
                <div className="rounded-control border bg-surface-muted p-3">
                  <div className="grid gap-2 md:grid-cols-[auto_1fr_320px_auto] md:items-start">
                    <IconButton
                      icon={<GripVertical className="h-4 w-4" />}
                      label={`Drag ${card.label} card`}
                      type="button"
                      {...meta.handleProps.attributes}
                      {...meta.handleProps.listeners}
                    />
                    <FormField label="Card title">
                      <Input
                        onChange={(event) => {
                          const nextLabel = event.target.value;
                          updateSummaryCard(card.id, (current) => ({
                            ...current,
                            label: nextLabel
                          }));
                        }}
                        value={card.label}
                      />
                    </FormField>
                    <FormField label="Data source">
                      <Select
                        className="w-[320px] max-w-full"
                        onChange={(event) => {
                          const nextMetricKey = event.target.value as FormSubmissionViewSummaryMetricKey;
                          const fallbackLabel = SUMMARY_METRIC_OPTIONS.find((option) => option.value === nextMetricKey)?.label ?? "Metric";
                          updateSummaryCard(card.id, (current) => ({
                            ...current,
                            metricKey: nextMetricKey,
                            label: current.label.trim().length > 0 ? current.label : fallbackLabel
                          }));
                        }}
                        options={SUMMARY_METRIC_OPTIONS}
                        value={card.metricKey}
                      />
                    </FormField>
                    <div className="pt-7">
                      <Button onClick={() => removeSummaryCard(card.id)} size="sm" variant="ghost">
                        <X className="h-4 w-4" />
                        Remove
                      </Button>
                    </div>
                  </div>
                  <div className="mt-2 flex items-center justify-between rounded-control border bg-surface px-3 py-2">
                    <p className="text-xs text-text-muted">{selectedMetric?.description ?? "Select a metric source."}</p>
                    <p className="text-sm font-semibold text-text">Preview: {summaryMetricValueByKey[card.metricKey]}</p>
                  </div>
                </div>
              );
            }}
          />
        </div>
      </Panel>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsCreateViewPanelOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSavingView} loading={isSavingView} onClick={handleCreateView} variant="secondary">
              Save view
            </Button>
          </>
        }
        onClose={() => setIsCreateViewPanelOpen(false)}
        open={isCreateViewPanelOpen}
        subtitle="Name this view and control who can use it."
        title="Create view"
      >
        <div className="space-y-4">
          <FormField label="View name">
            <Input onChange={(event) => setNewViewName(event.target.value)} placeholder="Admissions pipeline" value={newViewName} />
          </FormField>

          <FormField label="Visibility">
            <Select
              onChange={(event) => {
                const next = event.target.value as FormSubmissionViewVisibilityScope;
                setNewViewVisibility(next);
                if (next !== "specific_admin") {
                  setNewViewTargetUserId("");
                }
              }}
              options={visibilityOptions}
              value={newViewVisibility}
            />
          </FormField>

          {newViewVisibility === "specific_admin" ? (
            <FormField label="Admin account">
              <Select
                onChange={(event) => setNewViewTargetUserId(event.target.value)}
                options={
                  adminTargetOptions.length > 0 ? adminTargetOptions : [{ value: "", label: "No admin accounts available" }]
                }
                value={newViewTargetUserId}
              />
            </FormField>
          ) : null}
        </div>
      </Panel>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsGoogleSheetsSettingsOpen(false)} variant="ghost">
              Close
            </Button>
            {googleSheetState ? (
              <Button disabled={!canWrite || isSavingGoogleSheet} loading={isSavingGoogleSheet} onClick={handleSyncGoogleSheetNow} variant="secondary">
                Sync now
              </Button>
            ) : (
              <Button
                disabled={!canWrite || !googleSheetConfigured || isSavingGoogleSheet || isGoogleSheetsOauthInFlight}
                loading={isSavingGoogleSheet || isGoogleSheetsOauthInFlight}
                onClick={handleConnectGoogleSheet}
                variant="secondary"
              >
                Connect Google Sheets
              </Button>
            )}
          </>
        }
        onClose={() => setIsGoogleSheetsSettingsOpen(false)}
        open={isGoogleSheetsSettingsOpen}
        subtitle="Manage Google Sheets connection details and review recent sync activity."
        title="Google Sheets integration"
      >
        <div className="space-y-4">
          <div className="rounded-control border bg-surface-muted p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Connection</p>
            <div className="mt-2 flex items-center gap-2 text-sm text-text">
              <GoogleSheetStatusIcon className={`h-4 w-4 ${googleSheetStatusMeta.toneClassName}`} />
              <span>{googleSheetStatusMeta.label}</span>
              {googleSheetState ? (
                <Chip className="normal-case tracking-normal" color={googleSheetState.status === "active" ? "green" : "yellow"}>
                  {googleSheetState.status}
                </Chip>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Last sync: {googleSheetState?.lastSyncedAt ? new Date(googleSheetState.lastSyncedAt).toLocaleString() : "Never"}
            </p>
            {googleSheetState?.lastError ? <p className="mt-1 text-xs text-danger">Last error: {googleSheetState.lastError}</p> : null}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {googleSheetState?.spreadsheetUrl ? (
                <Button
                  onClick={() => {
                    window.open(googleSheetState.spreadsheetUrl, "_blank", "noopener,noreferrer");
                  }}
                  size="sm"
                  variant="secondary"
                >
                  Open sheet
                </Button>
              ) : null}
              {googleSheetState ? (
                <Button disabled={!canWrite || isSavingGoogleSheet} onClick={handleDisconnectGoogleSheet} size="sm" variant="ghost">
                  Disconnect
                </Button>
              ) : null}
            </div>
          </div>

          {!googleSheetConfigured ? (
            <Alert variant="warning">
              Google Sheets is not configured on the server. Missing auth and/or OAuth environment variables.
            </Alert>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Sync log</p>
            {googleSheetRunRows.length === 0 ? (
              <Alert variant="info">No sync runs yet.</Alert>
            ) : (
              <div className="space-y-2">
                {googleSheetRunRows.slice(0, 12).map((run) => (
                  <div className="rounded-control border bg-surface-muted px-3 py-2" key={run.id}>
                    <p className="text-xs font-semibold text-text">{new Date(run.startedAt).toLocaleString()}</p>
                    <p className="text-xs text-text-muted">
                      {run.triggerSource} - {run.status}
                    </p>
                    <p className="text-xs text-text-muted">
                      Updates {run.inboundUpdatesCount} · Creates {run.inboundCreatesCount} · Rows {run.outboundRowsCount} · Conflicts {run.conflictsCount} · Errors {run.errorCount}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        footer={
          <>
            <Button onClick={() => setIsEditViewPanelOpen(false)} variant="ghost">
              Cancel
            </Button>
            <Button disabled={isSavingView || !editingViewId} loading={isSavingView} onClick={handleUpdateViewSettings} variant="secondary">
              Save view
            </Button>
          </>
        }
        onClose={() => setIsEditViewPanelOpen(false)}
        open={isEditViewPanelOpen}
        subtitle="Rename this view and update who can access it."
        title="Edit view"
      >
        <div className="space-y-4">
          <FormField label="View name">
            <Input onChange={(event) => setEditViewName(event.target.value)} placeholder="Admissions pipeline" value={editViewName} />
          </FormField>

          <FormField label="Visibility">
            <Select
              onChange={(event) => {
                const next = event.target.value as FormSubmissionViewVisibilityScope;
                setEditViewVisibility(next);
                if (next !== "specific_admin") {
                  setEditViewTargetUserId("");
                }
              }}
              options={visibilityOptions}
              value={editViewVisibility}
            />
          </FormField>

          {editViewVisibility === "specific_admin" ? (
            <FormField label="Admin account">
              <Select
                onChange={(event) => setEditViewTargetUserId(event.target.value)}
                options={
                  adminTargetOptions.length > 0 ? adminTargetOptions : [{ value: "", label: "No admin accounts available" }]
                }
                value={editViewTargetUserId}
              />
            </FormField>
          ) : null}
        </div>
      </Panel>

      <Panel
        footer={
          selectedSubmission ? (
            <>
              <Button onClick={() => setSelectedSubmissionId(null)} variant="ghost">
                Close
              </Button>
              <Button
                disabled={!canWrite || !isEditableMode || isSaving}
                loading={activeSaveSubmissionId === selectedSubmission.id}
                onClick={() => handleSave(selectedSubmission.id)}
                variant="secondary"
              >
                Save changes
              </Button>
            </>
          ) : null
        }
        onClose={() => setSelectedSubmissionId(null)}
        open={Boolean(selectedSubmission)}
        subtitle="Review submitted answers and update workflow status."
        title={selectedSubmission ? "Submission details" : "Submission"}
      >
        {selectedSubmission ? (
          <div className="space-y-4">
            <Card className="shadow-none">
              <CardContent className="space-y-3 py-6">
                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Submission ID</p>
                  <p className="break-all font-mono text-xs text-text-muted">{selectedSubmission.id}</p>
                </div>

                <div className="space-y-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Submitted</p>
                  <p className="text-sm text-text">{new Date(selectedSubmission.createdAt).toLocaleString()}</p>
                </div>

                <FormField label="Status">
                  <Select
                    disabled={!canWrite || !isEditableMode}
                    onChange={(event) => setStatusById((current) => ({ ...current, [selectedSubmission.id]: event.target.value as SubmissionStatus }))}
                    options={asStatusOptions()}
                    value={statusById[selectedSubmission.id] ?? selectedSubmission.status}
                  />
                </FormField>

                <FormField label="Admin notes">
                  <Textarea
                    disabled={!canWrite || !isEditableMode}
                    onChange={(event) =>
                      setAdminNotesById((current) => ({
                        ...current,
                        [selectedSubmission.id]: event.target.value
                      }))
                    }
                    placeholder="Internal notes visible to staff."
                    rows={4}
                    value={selectedSubmissionAdminNotes}
                  />
                </FormField>
              </CardContent>
            </Card>

            <section className="space-y-2">
              <p className="text-sm font-semibold text-text">Change log</p>
              {(changeLogBySubmissionId[selectedSubmission.id] ?? []).length === 0 ? (
                <Alert variant="info">No local changes recorded yet for this submission.</Alert>
              ) : (
                <div className="space-y-2">
                  {(changeLogBySubmissionId[selectedSubmission.id] ?? []).map((entry, index) => (
                    <div className="rounded-control border bg-surface-muted px-3 py-2" key={`${entry.at}:${index}`}>
                      <p className="text-xs text-text-muted">{new Date(entry.at).toLocaleString()}</p>
                      <p className="text-sm text-text">
                        {entry.field}: {entry.from} {"->"} {entry.to} ({entry.mode})
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="space-y-2">
              <p className="text-sm font-semibold text-text">Submission answers</p>
              <AnswersList
                answers={selectedSubmissionAnswers}
                emptyLabel="No answers were captured on this submission."
                fieldLabelByKey={fieldLabelByKey}
              />
            </section>

            {formKind === "program_registration" ? (
              <section className="space-y-2">
                <p className="text-sm font-semibold text-text">Per-player entries</p>
                {selectedSubmissionEntries.length === 0 ? <Alert variant="warning">No player entries on this registration.</Alert> : null}
                {selectedSubmissionEntries.map((entry) => (
                  <Card
                    className={entry.id === deepLinkedEntryId ? "border-primary/60 shadow-none" : "shadow-none"}
                    key={entry.id}
                  >
                    <CardContent className="space-y-3 py-4">
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Player ID</p>
                        <p className="break-all font-mono text-xs text-text-muted">{entry.playerId}</p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">Program node ID</p>
                        <p className="break-all font-mono text-xs text-text-muted">{entry.programNodeId ?? "(none)"}</p>
                      </div>
                      <AnswersList
                        answers={entry.answersJson}
                        emptyLabel="No per-player answers were submitted."
                        fieldLabelByKey={fieldLabelByKey}
                      />
                    </CardContent>
                  </Card>
                ))}
              </section>
            ) : null}
          </div>
        ) : null}
      </Panel>

      {selectedSubmissionIds.length > 0 ? (
        <div className="fixed bottom-4 left-1/2 z-[70] w-[min(94vw,760px)] -translate-x-1/2 rounded-card border bg-surface p-3 shadow-floating">
          <div className="flex flex-wrap items-center gap-3">
            <p className="text-sm font-semibold text-text">{selectedSubmissionIds.length} selected</p>
            <div className="min-w-[220px]">
              <Select
                disabled={!isEditableMode || !canWrite || isSaving}
                onChange={(event) => setBulkStatus(event.target.value as SubmissionStatus)}
                options={asStatusOptions()}
                value={bulkStatus}
              />
            </div>
            <Button disabled={!isEditableMode || !canWrite || isSaving} loading={isSaving} onClick={handleApplyBulkStatus} size="sm" variant="secondary">
              Apply status to selected
            </Button>
            <Button
              className="ui-button-danger"
              disabled={!isEditableMode || !canWrite || isDeletingSubmissions}
              loading={isDeletingSubmissions}
              onClick={handleDeleteSelectedSubmissions}
              size="sm"
              variant="secondary"
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete selected
            </Button>
            <Button
              onClick={() => {
                setSelectedSubmissionIds([]);
              }}
              size="sm"
              variant="ghost"
            >
              Clear selection
            </Button>
            <p className="ml-auto text-xs text-text-muted">Use Shift+click for ranges. Cmd/Ctrl+C copies selected table cells.</p>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
