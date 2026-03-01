"use client";

import { Plus, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable, type DataTableColumn, type DataTableViewConfig } from "@/components/ui/data-table";
import { SortableCanvas } from "@/components/editor/SortableCanvas";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Chip } from "@/components/ui/chip";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import {
  createFormSubmissionViewAction,
  deleteFormSubmissionAction,
  deleteFormSubmissionViewAction,
  reorderFormSubmissionViewsAction,
  setSubmissionStatusAction,
  updateFormSubmissionViewLayoutAction,
  updateFormSubmissionViewSettingsAction,
  updateSubmissionAnswerAction,
  type FormSubmissionViewAdminAccount
} from "@/modules/forms/actions";
import { FormBuilderNavItem } from "@/modules/forms/components/FormBuilderNavItem";
import type {
  FormField as FormFieldDefinition,
  FormKind,
  FormSchema,
  FormSubmissionViewVisibilityScope,
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
  canWrite = true
}: FormSubmissionsPanelProps) {
  const { toast } = useToast();
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
  const [editingCellKey, setEditingCellKey] = useState<string | null>(null);
  const [savedViews, setSavedViews] = useState<LocalFormSubmissionView[]>(views);
  const [activeViewId, setActiveViewId] = useState<string | null>(views[0]?.id ?? null);
  const [tableConfigDraft, setTableConfigDraft] = useState<DataTableViewConfig | null>(null);
  const tableConfigDraftRef = useRef<DataTableViewConfig | null>(null);
  const [isCreateViewPanelOpen, setIsCreateViewPanelOpen] = useState(false);
  const [isEditViewPanelOpen, setIsEditViewPanelOpen] = useState(false);
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
  const handleTableConfigChange = useCallback((nextConfig: DataTableViewConfig) => {
    tableConfigDraftRef.current = nextConfig;
    setTableConfigDraft(nextConfig);
  }, []);
  const autoSaveTimerRef = useRef<number | null>(null);
  const autoSaveRequestIdRef = useRef(0);

  useEffect(() => {
    setSubmissionRows(submissions);
  }, [submissions]);

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
    setActiveSaveSubmissionId(submissionId);

    startSaving(async () => {
      try {
        const result = await setSubmissionStatusAction({
          orgSlug,
          formId,
          submissionId,
          status
        });

        if (!result.ok) {
          toast({
            title: "Unable to update submission",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        setSavedStatusById((current) => ({
          ...current,
          [submissionId]: status
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
      canWrite,
      editingCellKey,
      formKind,
      handleSelectSubmission,
      isEditableMode,
      responseColumns,
      savingInlineStatusId,
      statusById
    ]
  );

  const selectedSubmission = selectedSubmissionId ? submissionRows.find((submission) => submission.id === selectedSubmissionId) ?? null : null;
  const selectedSubmissionAnswers = selectedSubmission ? (submissionAnswersById[selectedSubmission.id] ?? selectedSubmission.answersJson) : {};
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

  const activeSavedView = useMemo(
    () => (activeViewId ? savedViews.find((view) => view.id === activeViewId) ?? null : null),
    [activeViewId, savedViews]
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

  useEffect(() => {
    if (!canWrite) {
      return;
    }

    if (!activeSavedView || !tableConfigDraft || !hasUnsavedLayoutChanges) {
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
            columnWidthsByKey
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
  }, [activeSavedView, canWrite, formId, hasUnsavedLayoutChanges, orgSlug, tableConfigDraft, toast]);

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
          searchQuery: latestConfig.searchQuery
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

  const handleTableCellClick = useCallback(
    (context: { item: FormSubmissionWithEntries; columnKey: string; isActiveCell: boolean }) => {
      if (!isEditableMode || !canWrite || !context.isActiveCell) {
        return;
      }

      if (context.columnKey === "status") {
        setEditingCellKey(`status:${context.item.id}`);
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

  return (
    <Card>
      <CardHeader>
        <CardTitle>Submissions</CardTitle>
        <CardDescription>Review and move registrations through your workflow.</CardDescription>
      </CardHeader>
      <CardContent className="p-6 pt-4">
        <div className="mb-3 space-y-2 rounded-control border bg-surface p-3">
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
        <DataTable
          ariaLabel="Form submissions"
          columns={submissionTableColumns}
          data={submissionRows}
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
                Save status
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
                  <Card className="shadow-none" key={entry.id}>
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
              disabled={!isEditableMode || !canWrite || isDeletingSubmissions}
              loading={isDeletingSubmissions}
              onClick={handleDeleteSelectedSubmissions}
              size="sm"
              variant="destructive"
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
