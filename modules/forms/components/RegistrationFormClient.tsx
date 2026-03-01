"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button, buttonVariants } from "@/components/ui/button";
import { CalendarPicker } from "@/components/ui/calendar-picker";
import { Checkbox } from "@/components/ui/checkbox";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { submitFormResponseAction } from "@/modules/forms/actions";
import { REGISTRATION_PAGE_KEYS } from "@/modules/forms/types";
import { createPlayerAction } from "@/modules/players/actions";
import { resolveButtonHref } from "@/lib/links";
import type { FormField as FormFieldDefinition, FormPage, OrgForm } from "@/modules/forms/types";
import type { PlayerPickerItem } from "@/modules/players/types";
import type { ProgramNode } from "@/modules/programs/types";

type RegistrationFormClientProps = {
  orgSlug: string;
  formSlug: string;
  form: OrgForm;
  players: PlayerPickerItem[];
  programNodes: ProgramNode[];
};

const FORM_PROGRESS_STORAGE_VERSION = 1;
const FORM_PROGRESS_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type StoredFormProgress = {
  version: number;
  savedAt: number;
  expiresAt: number;
  formUpdatedAt: string;
  currentPageIndex: number;
  genericAnswers: Record<string, unknown>;
  answersByPlayerId: Record<string, Record<string, unknown>>;
  selectedPlayerIds: string[];
  selectedNodeByPlayerId: Record<string, string>;
};

type RuleState = {
  hiddenFieldNames: Set<string>;
  requiredFieldNames: Set<string>;
};

function asString(value: unknown) {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number") {
    return String(value);
  }

  return "";
}

function hasMeaningfulInput(value: unknown): boolean {
  if (value === undefined || value === null) {
    return false;
  }

  if (typeof value === "string") {
    return value.trim().length > 0;
  }

  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return Number.isFinite(value);
  }

  if (Array.isArray(value)) {
    return value.length > 0;
  }

  if (typeof value === "object") {
    return Object.values(value as Record<string, unknown>).some((item) => hasMeaningfulInput(item));
  }

  return false;
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

function isPhoneNumberValid(value: unknown) {
  return digitsOnly(asString(value)).length === 10;
}

function evaluateRule(sourceValue: unknown, operator: string, expectedValue: unknown) {
  if (operator === "is_true") {
    return sourceValue === true || sourceValue === "true" || sourceValue === "on";
  }

  if (operator === "is_false") {
    return !sourceValue || sourceValue === "false" || sourceValue === "off";
  }

  if (operator === "equals") {
    return String(sourceValue ?? "") === String(expectedValue ?? "");
  }

  if (operator === "not_equals") {
    return String(sourceValue ?? "") !== String(expectedValue ?? "");
  }

  return false;
}

function isValueMissing(field: FormFieldDefinition, value: unknown) {
  if (field.type === "checkbox") {
    return value !== true;
  }

  return value === undefined || value === null || value === "";
}

function getFieldValidationError(field: FormFieldDefinition, value: unknown) {
  if (field.type === "phone" && !isValueMissing(field, value) && !isPhoneNumberValid(value)) {
    return `${field.label} must be a valid phone number.`;
  }

  return null;
}

function computeRuleState(fields: FormFieldDefinition[], rules: OrgForm["schemaJson"]["rules"], answers: Record<string, unknown>): RuleState {
  const visibleFieldNameSet = new Set(fields.map((field) => field.name));
  const requiredFieldNames = new Set(fields.filter((field) => field.required).map((field) => field.name));
  const hiddenFieldNames = new Set<string>();

  for (const rule of rules) {
    if (!visibleFieldNameSet.has(rule.sourceFieldName) || !visibleFieldNameSet.has(rule.targetFieldName)) {
      continue;
    }

    const sourceValue = answers[rule.sourceFieldName];
    const ruleMatched = evaluateRule(sourceValue, rule.operator, rule.value);

    if (rule.effect === "show" && !ruleMatched) {
      hiddenFieldNames.add(rule.targetFieldName);
      continue;
    }

    if (rule.effect === "require" && ruleMatched) {
      requiredFieldNames.add(rule.targetFieldName);
    }
  }

  return {
    hiddenFieldNames,
    requiredFieldNames
  };
}

function nodeMatchesFieldTarget(field: FormFieldDefinition, selectedNodeId: string | null, nodeById: Map<string, ProgramNode>) {
  if (field.targetNodeIds.length === 0) {
    return true;
  }

  if (!selectedNodeId) {
    return false;
  }

  if (field.targetNodeIds.includes(selectedNodeId)) {
    return true;
  }

  if (!field.includeDescendants) {
    return false;
  }

  let cursor = nodeById.get(selectedNodeId);

  while (cursor?.parentId) {
    if (field.targetNodeIds.includes(cursor.parentId)) {
      return true;
    }

    cursor = nodeById.get(cursor.parentId);
  }

  return false;
}

function getFieldTargetDescription(field: FormFieldDefinition, programNodes: ProgramNode[]) {
  if (field.targetNodeIds.length === 0) {
    return "Program-wide";
  }

  const labels = field.targetNodeIds
    .map((targetId) => programNodes.find((node) => node.id === targetId)?.name)
    .filter((name): name is string => Boolean(name));

  if (labels.length === 0) {
    return "Specific structure nodes";
  }

  return field.includeDescendants ? `${labels.join(", ")} (+ child nodes)` : labels.join(", ");
}

function getPageTitle(page: FormPage | undefined, fallback: string) {
  if (!page) {
    return fallback;
  }

  return page.title || fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseStoredFormProgress(raw: string): StoredFormProgress | null {
  try {
    const parsed = JSON.parse(raw) as unknown;

    if (!isRecord(parsed)) {
      return null;
    }

    if (parsed.version !== FORM_PROGRESS_STORAGE_VERSION) {
      return null;
    }

    if (typeof parsed.savedAt !== "number" || typeof parsed.expiresAt !== "number" || typeof parsed.formUpdatedAt !== "string") {
      return null;
    }

    if (typeof parsed.currentPageIndex !== "number" || !Number.isFinite(parsed.currentPageIndex) || parsed.currentPageIndex < 0) {
      return null;
    }

    if (!isRecord(parsed.genericAnswers) || !isRecord(parsed.answersByPlayerId) || !isRecord(parsed.selectedNodeByPlayerId)) {
      return null;
    }

    if (!Array.isArray(parsed.selectedPlayerIds) || parsed.selectedPlayerIds.some((item) => typeof item !== "string")) {
      return null;
    }

    const answersByPlayerId = Object.fromEntries(
      Object.entries(parsed.answersByPlayerId).filter((entry): entry is [string, Record<string, unknown>] => {
        const [playerId, answers] = entry;
        return typeof playerId === "string" && isRecord(answers);
      })
    );

    const selectedNodeByPlayerId = Object.fromEntries(
      Object.entries(parsed.selectedNodeByPlayerId).filter(
        (entry): entry is [string, string] => typeof entry[0] === "string" && typeof entry[1] === "string"
      )
    );

    return {
      version: FORM_PROGRESS_STORAGE_VERSION,
      savedAt: parsed.savedAt,
      expiresAt: parsed.expiresAt,
      formUpdatedAt: parsed.formUpdatedAt,
      currentPageIndex: parsed.currentPageIndex,
      genericAnswers: parsed.genericAnswers,
      answersByPlayerId,
      selectedPlayerIds: parsed.selectedPlayerIds,
      selectedNodeByPlayerId
    };
  } catch {
    return null;
  }
}

export function RegistrationFormClient({ orgSlug, formSlug, form, players, programNodes }: RegistrationFormClientProps) {
  const { toast } = useToast();

  const allowMultiplePlayers = Boolean(form.settingsJson.allowMultiplePlayers);
  const requiresPlayers = form.formKind === "program_registration";
  const schemaPages = form.schemaJson.pages;
  const successPage = schemaPages.find((page) => page.pageKey === "generic_success" || page.pageKey === REGISTRATION_PAGE_KEYS.success);
  const flowPages = schemaPages.filter((page) => page.pageKey !== "generic_success" && page.pageKey !== REGISTRATION_PAGE_KEYS.success);
  const nodeById = useMemo(() => new Map(programNodes.map((node) => [node.id, node])), [programNodes]);

  const [isSubmitting, startSubmitting] = useTransition();
  const [isCreatingPlayer, startCreatingPlayer] = useTransition();

  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [genericAnswers, setGenericAnswers] = useState<Record<string, unknown>>({});
  const [answersByPlayerId, setAnswersByPlayerId] = useState<Record<string, Record<string, unknown>>>({});
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<string[]>([]);
  const [selectedNodeByPlayerId, setSelectedNodeByPlayerId] = useState<Record<string, string>>({});
  const [successState, setSuccessState] = useState<{ submissionId: string; status: string } | null>(null);

  const [localPlayers, setLocalPlayers] = useState<PlayerPickerItem[]>(players);
  const [playerModalOpen, setPlayerModalOpen] = useState(false);
  const [newPlayerFirstName, setNewPlayerFirstName] = useState("");
  const [newPlayerLastName, setNewPlayerLastName] = useState("");
  const [newPlayerDob, setNewPlayerDob] = useState("");
  const [newPlayerGender, setNewPlayerGender] = useState("");
  const [newPlayerGenderMode, setNewPlayerGenderMode] = useState("");
  const [hasHydratedProgress, setHasHydratedProgress] = useState(false);

  const progressStorageKey = useMemo(() => `sports-saas:form-progress:${orgSlug}:${formSlug}`, [formSlug, orgSlug]);

  const currentPage = flowPages[currentPageIndex];
  const isLastPage = currentPageIndex === flowPages.length - 1;
  const hasStartedForm = useMemo(() => {
    if (selectedPlayerIds.length > 0) {
      return true;
    }

    if (Object.values(selectedNodeByPlayerId).some((value) => hasMeaningfulInput(value))) {
      return true;
    }

    if (Object.values(genericAnswers).some((value) => hasMeaningfulInput(value))) {
      return true;
    }

    return Object.values(answersByPlayerId).some((playerAnswers) =>
      Object.values(playerAnswers ?? {}).some((value) => hasMeaningfulInput(value))
    );
  }, [answersByPlayerId, genericAnswers, selectedNodeByPlayerId, selectedPlayerIds]);
  const progressPercent = hasStartedForm && flowPages.length > 0 ? ((currentPageIndex + 1) / (flowPages.length + 1)) * 100 : 0;

  const registrationPlayerPage = flowPages.find((page) => page.pageKey === REGISTRATION_PAGE_KEYS.player);
  const registrationDivisionPage = flowPages.find((page) => page.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions);
  const registrationPaymentPage = flowPages.find((page) => page.pageKey === REGISTRATION_PAGE_KEYS.payment);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const raw = window.localStorage.getItem(progressStorageKey);

    if (!raw) {
      setHasHydratedProgress(true);
      return;
    }

    const storedProgress = parseStoredFormProgress(raw);
    const now = Date.now();

    if (!storedProgress || storedProgress.expiresAt <= now || storedProgress.formUpdatedAt !== form.updatedAt) {
      window.localStorage.removeItem(progressStorageKey);
      setHasHydratedProgress(true);
      return;
    }

    const knownPlayerIds = new Set(players.map((player) => player.id));
    const restoredSelectedPlayerIds = storedProgress.selectedPlayerIds.filter((playerId) => knownPlayerIds.has(playerId));
    const restoredAnswersByPlayerId = Object.fromEntries(
      Object.entries(storedProgress.answersByPlayerId).filter(([playerId]) => knownPlayerIds.has(playerId))
    );
    const restoredSelectedNodeByPlayerId = Object.fromEntries(
      Object.entries(storedProgress.selectedNodeByPlayerId).filter(([playerId]) => knownPlayerIds.has(playerId))
    );

    setCurrentPageIndex(Math.min(storedProgress.currentPageIndex, Math.max(flowPages.length - 1, 0)));
    setGenericAnswers(storedProgress.genericAnswers);
    setAnswersByPlayerId(restoredAnswersByPlayerId);
    setSelectedPlayerIds(restoredSelectedPlayerIds);
    setSelectedNodeByPlayerId(restoredSelectedNodeByPlayerId);
    setHasHydratedProgress(true);
  }, [flowPages.length, form.updatedAt, players, progressStorageKey]);

  useEffect(() => {
    if (!hasHydratedProgress || successState || typeof window === "undefined") {
      return;
    }

    const now = Date.now();
    const payload: StoredFormProgress = {
      version: FORM_PROGRESS_STORAGE_VERSION,
      savedAt: now,
      expiresAt: now + FORM_PROGRESS_TTL_MS,
      formUpdatedAt: form.updatedAt,
      currentPageIndex,
      genericAnswers,
      answersByPlayerId,
      selectedPlayerIds,
      selectedNodeByPlayerId
    };

    window.localStorage.setItem(progressStorageKey, JSON.stringify(payload));
  }, [
    answersByPlayerId,
    currentPageIndex,
    form.updatedAt,
    genericAnswers,
    hasHydratedProgress,
    progressStorageKey,
    selectedNodeByPlayerId,
    selectedPlayerIds,
    successState
  ]);

  function clearSavedProgress() {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.removeItem(progressStorageKey);
  }

  function getEffectiveNodeIdForPlayer(playerId: string): string | null {
    if (form.targetMode === "locked") {
      return form.lockedProgramNodeId;
    }

    return selectedNodeByPlayerId[playerId] ?? null;
  }

  function updateGenericAnswer(fieldName: string, value: unknown) {
    setGenericAnswers((current) => ({
      ...current,
      [fieldName]: value
    }));
  }

  function updatePlayerAnswer(playerId: string, fieldName: string, value: unknown) {
    setAnswersByPlayerId((current) => ({
      ...current,
      [playerId]: {
        ...(current[playerId] ?? {}),
        [fieldName]: value
      }
    }));
  }

  function togglePlayer(playerId: string) {
    if (allowMultiplePlayers) {
      setSelectedPlayerIds((current) => (current.includes(playerId) ? current.filter((id) => id !== playerId) : [...current, playerId]));
      return;
    }

    setSelectedPlayerIds((current) => (current[0] === playerId ? [] : [playerId]));
  }

  function getPlayerFieldsForNode(playerId: string) {
    const allFields = registrationDivisionPage?.fields ?? [];
    const selectedNodeId = getEffectiveNodeIdForPlayer(playerId);

    return allFields.filter((field) => nodeMatchesFieldTarget(field, selectedNodeId, nodeById));
  }

  function validateGenericPage(page: FormPage) {
    const ruleState = computeRuleState(page.fields, form.schemaJson.rules, genericAnswers);

    for (const field of page.fields) {
      if (ruleState.hiddenFieldNames.has(field.name)) {
        continue;
      }

      if (!ruleState.requiredFieldNames.has(field.name)) {
        continue;
      }

      const value = genericAnswers[field.name];
      if (isValueMissing(field, value)) {
        return `${field.label} is required.`;
      }

      const validationError = getFieldValidationError(field, value);
      if (validationError) {
        return validationError;
      }
    }

    for (const field of page.fields) {
      if (ruleState.hiddenFieldNames.has(field.name) || ruleState.requiredFieldNames.has(field.name)) {
        continue;
      }

      const validationError = getFieldValidationError(field, genericAnswers[field.name]);
      if (validationError) {
        return validationError;
      }
    }

    return null;
  }

  function validateRegistrationPlayerPage() {
    if (selectedPlayerIds.length === 0) {
      return "Select at least one player to continue.";
    }

    return null;
  }

  function validateRegistrationDivisionPage() {
    if (selectedPlayerIds.length === 0) {
      return "Select at least one player before answering questions.";
    }

    if (form.targetMode === "choice") {
      for (const playerId of selectedPlayerIds) {
        if (!selectedNodeByPlayerId[playerId]) {
          return "Choose a division for each selected player.";
        }
      }
    }

    for (const playerId of selectedPlayerIds) {
      const player = localPlayers.find((item) => item.id === playerId);
      const playerLabel = player?.label ?? "Selected player";
      const fields = getPlayerFieldsForNode(playerId);
      const playerAnswers = answersByPlayerId[playerId] ?? {};
      const ruleState = computeRuleState(fields, form.schemaJson.rules, playerAnswers);

      for (const field of fields) {
        if (ruleState.hiddenFieldNames.has(field.name)) {
          continue;
        }

        if (!ruleState.requiredFieldNames.has(field.name)) {
          continue;
        }

        const value = playerAnswers[field.name];
        if (isValueMissing(field, value)) {
          return `${playerLabel}: ${field.label} is required.`;
        }

        const validationError = getFieldValidationError(field, value);
        if (validationError) {
          return `${playerLabel}: ${validationError}`;
        }
      }

      for (const field of fields) {
        if (ruleState.hiddenFieldNames.has(field.name) || ruleState.requiredFieldNames.has(field.name)) {
          continue;
        }

        const validationError = getFieldValidationError(field, playerAnswers[field.name]);
        if (validationError) {
          return `${playerLabel}: ${validationError}`;
        }
      }
    }

    return null;
  }

  function validateCurrentPage() {
    if (!currentPage) {
      return "Form page not found.";
    }

    if (!requiresPlayers) {
      return validateGenericPage(currentPage);
    }

    if (currentPage.pageKey === REGISTRATION_PAGE_KEYS.player) {
      return validateRegistrationPlayerPage();
    }

    if (currentPage.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions) {
      return validateRegistrationDivisionPage();
    }

    return null;
  }

  function validateBeforeSubmit() {
    if (!requiresPlayers) {
      for (const page of flowPages) {
        const error = validateGenericPage(page);
        if (error) {
          return error;
        }
      }

      return null;
    }

    const playerError = validateRegistrationPlayerPage();
    if (playerError) {
      return playerError;
    }

    const divisionError = validateRegistrationDivisionPage();
    if (divisionError) {
      return divisionError;
    }

    return null;
  }

  function moveToNextPage() {
    const validationError = validateCurrentPage();

    if (validationError) {
      toast({
        title: "Incomplete page",
        description: validationError,
        variant: "destructive"
      });
      return;
    }

    setCurrentPageIndex((index) => Math.min(index + 1, flowPages.length - 1));
  }

  function moveToPreviousPage() {
    setCurrentPageIndex((index) => Math.max(index - 1, 0));
  }

  function handleNextClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    moveToNextPage();
  }

  function handleBackClick(event: React.MouseEvent<HTMLButtonElement>) {
    event.preventDefault();
    event.stopPropagation();
    moveToPreviousPage();
  }

  function handleCreatePlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startCreatingPlayer(async () => {
      const result = await createPlayerAction({
        firstName: newPlayerFirstName,
        lastName: newPlayerLastName,
        dateOfBirth: newPlayerDob,
        gender: newPlayerGender
      });

      if (!result.ok) {
        toast({
          title: "Unable to create player",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      const newPlayer = {
        id: result.data.player.id,
        label: `${result.data.player.firstName} ${result.data.player.lastName}`,
        subtitle: result.data.player.dateOfBirth ? `DOB: ${result.data.player.dateOfBirth}` : null
      } satisfies PlayerPickerItem;

      setLocalPlayers((current) => [...current, newPlayer].sort((a, b) => a.label.localeCompare(b.label)));
      setSelectedPlayerIds((current) => (allowMultiplePlayers ? [...current, newPlayer.id] : [newPlayer.id]));
      setPlayerModalOpen(false);
      setNewPlayerFirstName("");
      setNewPlayerLastName("");
      setNewPlayerDob("");
      setNewPlayerGender("");
      setNewPlayerGenderMode("");

      toast({
        title: "Player added",
        variant: "success"
      });
    });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
    const isFinalSubmit = submitter?.getAttribute("data-form-submit") === "final";

    if (!isLastPage || !isFinalSubmit) {
      return;
    }

    const validationError = validateBeforeSubmit();
    if (validationError) {
      toast({
        title: "Incomplete form",
        description: validationError,
        variant: "destructive"
      });
      return;
    }

    startSubmitting(async () => {
      const result = await submitFormResponseAction({
        orgSlug,
        formSlug,
        answers: requiresPlayers ? {} : genericAnswers,
        playerEntries: requiresPlayers
          ? selectedPlayerIds.map((playerId) => ({
              playerId,
              programNodeId: getEffectiveNodeIdForPlayer(playerId),
              answers: answersByPlayerId[playerId] ?? {}
            }))
          : [],
        metadata: {
          source: requiresPlayers ? "registration_form" : "generic_form"
        }
      });

      if (!result.ok) {
        toast({
          title: requiresPlayers ? "Unable to submit registration" : "Unable to submit form",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setSuccessState({
        submissionId: result.data.submissionId,
        status: result.data.status
      });
      clearSavedProgress();
      toast({
        title: requiresPlayers ? "Registration submitted" : "Form submitted",
        variant: "success"
      });
    });
  }

  function handleSubmitAnotherResponse() {
    clearSavedProgress();
    setSuccessState(null);
    setCurrentPageIndex(0);
    setGenericAnswers({});
    setAnswersByPlayerId({});
    setSelectedPlayerIds([]);
    setSelectedNodeByPlayerId({});
  }

  function renderField(
    field: FormFieldDefinition,
    value: unknown,
    required: boolean,
    onChange: (fieldName: string, nextValue: unknown) => void,
    keyPrefix: string
  ) {
    const fieldLabel = required ? `${field.label} *` : field.label;

    if (field.type === "textarea") {
      return (
        <FormField key={`${keyPrefix}-${field.id}`} label={fieldLabel}>
          <Textarea
            className="min-h-[100px]"
            onChange={(event) => onChange(field.name, event.target.value)}
            placeholder={field.placeholder ?? undefined}
            value={asString(value)}
          />
        </FormField>
      );
    }

    if (field.type === "select") {
      return (
        <FormField key={`${keyPrefix}-${field.id}`} label={fieldLabel}>
          <Select
            onChange={(event) => onChange(field.name, event.target.value)}
            options={[
              { value: "", label: "Select" },
              ...field.options.map((option) => ({ value: option.value, label: option.label }))
            ]}
            value={asString(value)}
          />
        </FormField>
      );
    }

    if (field.type === "checkbox") {
      return (
        <label className="inline-flex items-center gap-2 rounded-control border bg-surface px-3 py-2 text-sm text-text" key={`${keyPrefix}-${field.id}`}>
          <Checkbox
            checked={value === true || value === "true" || value === "on"}
            onChange={(event) => onChange(field.name, event.target.checked)}
          />
          {fieldLabel}
        </label>
      );
    }

    if (field.type === "date") {
      return (
        <FormField key={`${keyPrefix}-${field.id}`} label={fieldLabel}>
          <CalendarPicker onChange={(nextValue) => onChange(field.name, nextValue)} value={asString(value)} />
        </FormField>
      );
    }

    const inputType = field.type === "number" ? "number" : field.type === "email" ? "email" : field.type === "phone" ? "tel" : "text";

    return (
      <FormField key={`${keyPrefix}-${field.id}`} label={fieldLabel}>
        <Input
          onChange={(event) =>
            onChange(
              field.name,
              inputType === "number" ? Number(event.target.value) : field.type === "phone" ? formatPhoneNumberInput(event.target.value) : event.target.value
            )
          }
          placeholder={field.placeholder ?? undefined}
          type={inputType}
          value={asString(value)}
        />
      </FormField>
    );
  }

  const genericCurrentRuleState = currentPage && !requiresPlayers ? computeRuleState(currentPage.fields, form.schemaJson.rules, genericAnswers) : null;

  if (successState) {
    const successTitle = successPage?.title || "Success";
    const successDescription = successPage?.description || "Thanks for submitting. We'll be in touch soon.";
    const successButtons = successPage?.successButtons ?? [];
    const showSubmitAnotherResponseButton = successPage?.showSubmitAnotherResponseButton ?? true;

    return (
      <div className="space-y-4">
        <div className="rounded-card border bg-surface p-5">
          <h3 className="text-xl font-semibold text-text">{successTitle}</h3>
          <p className="mt-1 text-sm text-text-muted">{successDescription}</p>
          <p className="mt-3 text-xs text-text-muted">
            Submission ID: {successState.submissionId} ({successState.status})
          </p>
          {showSubmitAnotherResponseButton || successButtons.length > 0 ? (
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {showSubmitAnotherResponseButton ? (
                <Button onClick={handleSubmitAnotherResponse} type="button" variant="secondary">
                  Submit another response
                </Button>
              ) : null}
              {successButtons.map((button) => (
                <Link
                  className={buttonVariants({ variant: button.variant })}
                  href={resolveButtonHref(orgSlug, button.href)}
                  key={button.id}
                  rel={button.newTab ? "noreferrer" : undefined}
                  target={button.newTab ? "_blank" : undefined}
                >
                  {button.label}
                </Link>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {flowPages.length > 1 ? (
        <div className="space-y-2 rounded-card border bg-surface px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-text">{currentPage?.title ?? "Form"}</p>
            <p className="text-xs font-semibold uppercase tracking-wide text-text-muted">
              Step {currentPageIndex + 1} of {flowPages.length}
            </p>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-muted">
            <div
              className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
              style={{
                width: `${progressPercent}%`
              }}
            />
          </div>
        </div>
      ) : null}

      <form className="space-y-4" onSubmit={handleSubmit}>
        {!requiresPlayers && currentPage ? (
          <div className="space-y-3 rounded-card border bg-surface p-4">
            <div>
              <h3 className="font-semibold text-text">{currentPage.title}</h3>
              {currentPage.description ? <p className="text-sm text-text-muted">{currentPage.description}</p> : null}
            </div>
            <div className="grid gap-3 md:grid-cols-3">
              {currentPage.fields
                .filter((field) => !genericCurrentRuleState?.hiddenFieldNames.has(field.name))
                .map((field) =>
                  renderField(
                    field,
                    genericAnswers[field.name],
                    Boolean(genericCurrentRuleState?.requiredFieldNames.has(field.name)),
                    updateGenericAnswer,
                    currentPage.id
                  )
                )}
            </div>
          </div>
        ) : null}

        {requiresPlayers && currentPage?.pageKey === REGISTRATION_PAGE_KEYS.player ? (
          <div className="space-y-3 rounded-card border bg-surface p-4">
            <div className="flex items-center justify-between gap-2">
              <div>
                <h3 className="font-semibold text-text">{getPageTitle(registrationPlayerPage, "Player")}</h3>
                {registrationPlayerPage?.description ? <p className="text-sm text-text-muted">{registrationPlayerPage.description}</p> : null}
              </div>
              <Button onClick={() => setPlayerModalOpen(true)} size="sm" type="button" variant="secondary">
                Add player
              </Button>
            </div>

            {localPlayers.length === 0 ? <Alert variant="warning">No players yet. Add a player to continue.</Alert> : null}

            <div className="space-y-2">
              {localPlayers.map((player) => {
                const checked = selectedPlayerIds.includes(player.id);
                return (
                  <div className="rounded-control border bg-surface-muted px-3 py-2" key={player.id}>
                    <label className="flex cursor-pointer items-center justify-between gap-2 text-sm text-text">
                      <span>
                        <span className="font-medium">{player.label}</span>
                        {player.subtitle ? <span className="ml-2 text-text-muted">{player.subtitle}</span> : null}
                      </span>
                      {allowMultiplePlayers ? (
                        <Checkbox checked={checked} onChange={() => togglePlayer(player.id)} />
                      ) : (
                        <input checked={checked} onChange={() => togglePlayer(player.id)} type="radio" />
                      )}
                    </label>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {requiresPlayers && currentPage?.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions ? (
          <div className="space-y-3 rounded-card border bg-surface p-4">
            <div>
              <h3 className="font-semibold text-text">{getPageTitle(registrationDivisionPage, "Division + Questions")}</h3>
              {registrationDivisionPage?.description ? <p className="text-sm text-text-muted">{registrationDivisionPage.description}</p> : null}
            </div>

            {selectedPlayerIds.length === 0 ? <Alert variant="info">Select at least one player on the previous step to continue.</Alert> : null}

            {selectedPlayerIds.map((playerId) => {
              const player = localPlayers.find((item) => item.id === playerId);
              const playerAnswers = answersByPlayerId[playerId] ?? {};
              const targetedFields = getPlayerFieldsForNode(playerId);
              const ruleState = computeRuleState(targetedFields, form.schemaJson.rules, playerAnswers);
              const selectedNodeId = getEffectiveNodeIdForPlayer(playerId);
              const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : null;

              return (
                <div className="space-y-3 rounded-control border bg-surface-muted p-3" key={playerId}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-semibold text-text">{player?.label ?? "Selected player"}</p>
                    {selectedNode ? <p className="text-xs text-text-muted">Node: {selectedNode.name}</p> : null}
                  </div>

                  {form.targetMode === "choice" ? (
                    <FormField label="Node">
                      <Select
                        onChange={(event) =>
                          setSelectedNodeByPlayerId((current) => ({
                            ...current,
                            [playerId]: event.target.value
                          }))
                        }
                        options={[
                          { value: "", label: "Select node" },
                          ...programNodes.map((node) => ({ value: node.id, label: `${node.name} (${node.nodeKind})` }))
                        ]}
                        value={selectedNodeByPlayerId[playerId] ?? ""}
                      />
                    </FormField>
                  ) : null}

                  {form.targetMode === "locked" ? (
                    <p className="text-xs text-text-muted">
                      Locked to: {selectedNode ? `${selectedNode.name} (${selectedNode.nodeKind})` : "No locked node configured."}
                    </p>
                  ) : null}

                  <div className="grid gap-3 md:grid-cols-3">
                    {targetedFields
                      .filter((field) => !ruleState.hiddenFieldNames.has(field.name))
                      .map((field) => (
                        <div className="space-y-1" key={`${playerId}-${field.id}`}>
                          {renderField(
                            field,
                            playerAnswers[field.name],
                            ruleState.requiredFieldNames.has(field.name),
                            (fieldName, nextValue) => updatePlayerAnswer(playerId, fieldName, nextValue),
                            playerId
                          )}
                          <p className="text-[11px] text-text-muted">Applies to: {getFieldTargetDescription(field, programNodes)}</p>
                        </div>
                      ))}
                  </div>

                  {targetedFields.filter((field) => !ruleState.hiddenFieldNames.has(field.name)).length === 0 ? (
                    <Alert variant="info">No questions apply to this player/node combination.</Alert>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}

        {requiresPlayers && currentPage?.pageKey === REGISTRATION_PAGE_KEYS.payment ? (
          <div className="space-y-3 rounded-card border bg-surface p-4">
            <div>
              <h3 className="font-semibold text-text">{getPageTitle(registrationPaymentPage, "Payment")}</h3>
              {registrationPaymentPage?.description ? <p className="text-sm text-text-muted">{registrationPaymentPage.description}</p> : null}
            </div>
            <Alert variant="info">Payment is a placeholder for now. Review your registration details and submit.</Alert>
            <div className="space-y-2">
              {selectedPlayerIds.map((playerId) => {
                const player = localPlayers.find((item) => item.id === playerId);
                const selectedNodeId = getEffectiveNodeIdForPlayer(playerId);
                const selectedNode = selectedNodeId ? nodeById.get(selectedNodeId) : null;

                return (
                  <div className="rounded-control border bg-surface-muted px-3 py-2 text-sm text-text" key={`summary-${playerId}`}>
                    <p className="font-medium">{player?.label ?? "Selected player"}</p>
                    <p className="text-xs text-text-muted">Node: {selectedNode ? `${selectedNode.name} (${selectedNode.nodeKind})` : "Not selected"}</p>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Button disabled={currentPageIndex === 0} onClick={handleBackClick} type="button" variant="secondary">
            Back
          </Button>

          {!isLastPage ? (
            <Button onClick={handleNextClick} type="button">
              Next
            </Button>
          ) : (
            <Button data-form-submit="final" disabled={isSubmitting} loading={isSubmitting} type="submit">
              {isSubmitting ? "Submitting..." : requiresPlayers ? "Submit registration" : "Submit"}
            </Button>
          )}
        </div>
      </form>

      <Panel
        footer={
          <>
            <Button onClick={() => setPlayerModalOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isCreatingPlayer} form="registration-create-player-form" loading={isCreatingPlayer} type="submit">
              {isCreatingPlayer ? "Saving..." : "Add player"}
            </Button>
          </>
        }
        onClose={() => setPlayerModalOpen(false)}
        open={playerModalOpen}
        subtitle="Create a player profile and continue registration."
        title="Add player"
      >
        <form className="space-y-3" id="registration-create-player-form" onSubmit={handleCreatePlayer}>
          <FormField label="First name">
            <Input onChange={(event) => setNewPlayerFirstName(event.target.value)} required value={newPlayerFirstName} />
          </FormField>
          <FormField label="Last name">
            <Input onChange={(event) => setNewPlayerLastName(event.target.value)} required value={newPlayerLastName} />
          </FormField>
          <FormField label="Date of birth">
            <CalendarPicker onChange={setNewPlayerDob} value={newPlayerDob} />
          </FormField>
          <FormField label="Gender">
            <Select
              onChange={(event) => {
                const mode = event.target.value;
                setNewPlayerGenderMode(mode);
                if (mode === "other" || mode === "") {
                  if (mode === "") {
                    setNewPlayerGender("");
                  }
                  return;
                }
                setNewPlayerGender(mode);
              }}
              options={[
                { value: "", label: "Select gender" },
                { value: "male", label: "Male" },
                { value: "female", label: "Female" },
                { value: "non-binary", label: "Non-binary" },
                { value: "other", label: "Other" }
              ]}
              value={newPlayerGenderMode}
            />
          </FormField>
          {newPlayerGenderMode === "other" ? (
            <FormField label="Gender (other)">
              <Input onChange={(event) => setNewPlayerGender(event.target.value)} value={newPlayerGender} />
            </FormField>
          ) : null}
        </form>
      </Panel>
    </div>
  );
}
