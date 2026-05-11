"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight, RotateCcw, Save } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Popup } from "@orgframe/ui/primitives/popup";
import { useConfirmDialog } from "@orgframe/ui/primitives/confirm-dialog";

export type WizardStepRenderContext<TState> = {
  state: TState;
  setState: (updater: (current: TState) => TState) => void;
  setField: <K extends keyof TState>(key: K, value: TState[K]) => void;
  fieldErrors: Record<string, string>;
};

export type WizardStep<TState> = {
  id: string;
  label: string;
  description?: string;
  skipWhen?: (state: TState) => boolean;
  validate?: (state: TState) => Promise<Record<string, string> | null> | Record<string, string> | null;
  render: (ctx: WizardStepRenderContext<TState>) => React.ReactNode;
};

export type CreateWizardSubmitResult =
  | { ok: true }
  | {
      ok: false;
      fieldErrors?: Record<string, string>;
      message?: string;
      stepId?: string;
    };

export type WizardPersistenceAdapter<TState> = {
  load: () => Promise<TState | null> | TState | null;
  save: (state: TState) => Promise<void> | void;
  clear: () => Promise<void> | void;
};

export type CreateLocalStoragePersistenceOptions<TState> = {
  /** Skip restore if the persisted blob is older than this many ms. Default: 7 days. */
  maxAgeMs?: number;
  /** Optional schema version. Stored alongside the state — mismatches discard the draft. */
  version?: string;
  /** Hook called after a successful restore (e.g. analytics). */
  onRestore?: (state: TState) => void;
};

type StoredDraft<TState> = {
  v?: string;
  t: number;
  s: TState;
};

/**
 * Create a localStorage-backed persistence adapter for a wizard. Pass to
 * `CreateWizard` via `persistence` (or use the `draftId` shorthand).
 */
export function createLocalStoragePersistence<TState>(
  storageKey: string,
  options: CreateLocalStoragePersistenceOptions<TState> = {}
): WizardPersistenceAdapter<TState> {
  const { maxAgeMs = 7 * 24 * 60 * 60 * 1000, version, onRestore } = options;
  return {
    load() {
      if (typeof window === "undefined") {
        return null;
      }
      try {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) {
          return null;
        }
        const parsed = JSON.parse(raw) as StoredDraft<TState>;
        if (!parsed || typeof parsed.t !== "number" || !("s" in parsed)) {
          return null;
        }
        if (version !== undefined && parsed.v !== version) {
          return null;
        }
        if (Date.now() - parsed.t > maxAgeMs) {
          return null;
        }
        if (onRestore) {
          onRestore(parsed.s);
        }
        return parsed.s;
      } catch {
        return null;
      }
    },
    save(state) {
      if (typeof window === "undefined") {
        return;
      }
      try {
        const payload: StoredDraft<TState> = { v: version, t: Date.now(), s: state };
        window.localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch {
        // ignore quota / serialization failures — drafts are best-effort
      }
    },
    clear() {
      if (typeof window === "undefined") {
        return;
      }
      try {
        window.localStorage.removeItem(storageKey);
      } catch {
        // ignore
      }
    }
  };
}

function shallowEqual<T>(a: T, b: T) {
  if (Object.is(a, b)) {
    return true;
  }
  if (typeof a !== "object" || a === null || typeof b !== "object" || b === null) {
    return false;
  }
  const keysA = Object.keys(a as Record<string, unknown>);
  const keysB = Object.keys(b as Record<string, unknown>);
  if (keysA.length !== keysB.length) {
    return false;
  }
  for (const key of keysA) {
    if (!Object.is((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key])) {
      return false;
    }
  }
  return true;
}

export type UseCreateFlowOptions<TState> = {
  open: boolean;
  onClose: () => void;
  initialState: TState;
  steps: WizardStep<TState>[];
  onSubmit: (state: TState) => Promise<CreateWizardSubmitResult>;
  persistence?: WizardPersistenceAdapter<TState>;
  /**
   * When true, `submit()` runs validate() on every visible step (not just the
   * current one) and jumps to the first step with errors. Used by the
   * wizard's edit mode where any field could be dirty.
   */
  validateAllOnSubmit?: boolean;
};

export type UseCreateFlowResult<TState> = {
  state: TState;
  setState: (updater: (current: TState) => TState) => void;
  setField: <K extends keyof TState>(key: K, value: TState[K]) => void;
  fieldErrors: Record<string, string>;
  visibleSteps: WizardStep<TState>[];
  currentStep: WizardStep<TState> | undefined;
  currentIndex: number;
  totalVisible: number;
  isFirstStep: boolean;
  isLastStep: boolean;
  isDirty: boolean;
  submitting: boolean;
  restoredFromDraft: boolean;
  goToIndex: (index: number) => void;
  next: () => Promise<void>;
  back: () => void;
  submit: () => Promise<void>;
  resetDraft: () => void;
};

/**
 * Headless wizard state machine. Drives validation, navigation, submission,
 * dirty tracking, and (optional) draft persistence. Render with whichever
 * frame you like.
 */
export function useCreateFlow<TState>(options: UseCreateFlowOptions<TState>): UseCreateFlowResult<TState> {
  const { open, onClose, initialState, steps, onSubmit, persistence, validateAllOnSubmit = false } = options;

  const [state, setState] = React.useState<TState>(initialState);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [currentIndex, setCurrentIndex] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const [restoredFromDraft, setRestoredFromDraft] = React.useState(false);

  const persistenceRef = React.useRef(persistence);
  React.useEffect(() => {
    persistenceRef.current = persistence;
  }, [persistence]);

  // Reset / restore on open
  React.useEffect(() => {
    if (!open) {
      return;
    }
    setFieldErrors({});
    setCurrentIndex(0);
    setSubmitting(false);

    let cancelled = false;
    const adapter = persistenceRef.current;
    if (!adapter) {
      setState(initialState);
      setRestoredFromDraft(false);
      return;
    }

    Promise.resolve(adapter.load())
      .then((loaded) => {
        if (cancelled) {
          return;
        }
        if (loaded) {
          setState(loaded);
          setRestoredFromDraft(true);
        } else {
          setState(initialState);
          setRestoredFromDraft(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setState(initialState);
          setRestoredFromDraft(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [open, initialState]);

  // Persist on change (only while open and only when dirty)
  const isDirty = !shallowEqual(state, initialState);
  React.useEffect(() => {
    if (!open) {
      return;
    }
    const adapter = persistenceRef.current;
    if (!adapter) {
      return;
    }
    if (!isDirty) {
      return;
    }
    Promise.resolve(adapter.save(state)).catch(() => {
      // ignore
    });
  }, [open, isDirty, state]);

  const visibleSteps = React.useMemo(
    () => steps.filter((step) => !step.skipWhen || !step.skipWhen(state)),
    [steps, state]
  );
  const totalVisible = visibleSteps.length;
  const safeIndex = Math.min(currentIndex, Math.max(0, totalVisible - 1));
  const currentStep = visibleSteps[safeIndex];
  const isLastStep = safeIndex >= totalVisible - 1;
  const isFirstStep = safeIndex === 0;

  const setField = React.useCallback(<K extends keyof TState>(key: K, value: TState[K]) => {
    setState((current) => ({ ...current, [key]: value }));
    setFieldErrors((current) => {
      const stringKey = String(key);
      if (!(stringKey in current)) {
        return current;
      }
      const next = { ...current };
      delete next[stringKey];
      return next;
    });
  }, []);

  const wrappedSetState = React.useCallback((updater: (current: TState) => TState) => {
    setState(updater);
  }, []);

  const runValidation = React.useCallback(
    async (step: WizardStep<TState>) => {
      if (!step.validate) {
        return true;
      }
      const result = await step.validate(state);
      if (result && Object.keys(result).length > 0) {
        setFieldErrors(result);
        return false;
      }
      setFieldErrors({});
      return true;
    },
    [state]
  );

  const findStepIndexById = React.useCallback(
    (stepId: string | undefined) => {
      if (!stepId) {
        return -1;
      }
      return visibleSteps.findIndex((step) => step.id === stepId);
    },
    [visibleSteps]
  );

  const goToIndex = React.useCallback(
    (index: number) => {
      setFieldErrors({});
      setCurrentIndex(Math.max(0, Math.min(index, totalVisible - 1)));
    },
    [totalVisible]
  );

  const next = React.useCallback(async () => {
    if (!currentStep) {
      return;
    }
    const ok = await runValidation(currentStep);
    if (!ok) {
      return;
    }
    setCurrentIndex((idx) => Math.min(idx + 1, totalVisible - 1));
  }, [currentStep, runValidation, totalVisible]);

  const back = React.useCallback(() => {
    setFieldErrors({});
    setCurrentIndex((idx) => Math.max(idx - 1, 0));
  }, []);

  const submit = React.useCallback(async () => {
    if (!currentStep) {
      return;
    }
    if (validateAllOnSubmit) {
      const allErrors: Record<string, string> = {};
      let firstFailingIndex = -1;
      for (let i = 0; i < visibleSteps.length; i += 1) {
        const step = visibleSteps[i];
        if (!step.validate) continue;
        const result = await step.validate(state);
        if (result && Object.keys(result).length > 0) {
          Object.assign(allErrors, result);
          if (firstFailingIndex === -1) firstFailingIndex = i;
        }
      }
      if (firstFailingIndex >= 0) {
        setFieldErrors(allErrors);
        setCurrentIndex(firstFailingIndex);
        return;
      }
      setFieldErrors({});
    } else {
      const ok = await runValidation(currentStep);
      if (!ok) {
        return;
      }
    }
    setSubmitting(true);
    try {
      const result = await onSubmit(state);
      if (result.ok) {
        const adapter = persistenceRef.current;
        if (adapter) {
          await Promise.resolve(adapter.clear()).catch(() => undefined);
        }
        onClose();
        return;
      }
      if (result.fieldErrors) {
        setFieldErrors(result.fieldErrors);
      }
      const targetIndex = findStepIndexById(result.stepId);
      if (targetIndex >= 0) {
        setCurrentIndex(targetIndex);
      }
    } finally {
      setSubmitting(false);
    }
  }, [currentStep, findStepIndexById, onClose, onSubmit, runValidation, state, validateAllOnSubmit, visibleSteps]);

  const resetDraft = React.useCallback(() => {
    const adapter = persistenceRef.current;
    if (adapter) {
      Promise.resolve(adapter.clear()).catch(() => undefined);
    }
    setState(initialState);
    setFieldErrors({});
    setCurrentIndex(0);
    setRestoredFromDraft(false);
  }, [initialState]);

  return {
    state,
    setState: wrappedSetState,
    setField,
    fieldErrors,
    visibleSteps,
    currentStep,
    currentIndex: safeIndex,
    totalVisible,
    isFirstStep,
    isLastStep,
    isDirty,
    submitting,
    restoredFromDraft,
    goToIndex,
    next,
    back,
    submit,
    resetDraft
  };
}

/**
 * Helper to wrap a server action that returns `{ ok, fieldErrors? }` into a
 * step `validate` result. Use inside `validate` for slug/email/uniqueness
 * checks that need to hit the backend.
 *
 * @example
 * validate: async (state) => {
 *   const local = validateLocally(state);
 *   if (local) return local;
 *   return validateWithServerAction(checkSlugAvailableAction, { slug: state.slug });
 * }
 */
export async function validateWithServerAction<TInput>(
  action: (input: TInput) => Promise<{ ok: true } | { ok: false; fieldErrors?: Record<string, string>; message?: string }>,
  input: TInput,
  fallbackField = "_root"
): Promise<Record<string, string> | null> {
  try {
    const result = await action(input);
    if (result.ok) {
      return null;
    }
    if (result.fieldErrors && Object.keys(result.fieldErrors).length > 0) {
      return result.fieldErrors;
    }
    return { [fallbackField]: result.message ?? "Validation failed." };
  } catch (error) {
    return { [fallbackField]: error instanceof Error ? error.message : "Validation failed." };
  }
}

export type CreateWizardFrame = "sidebar" | "popup";

export type WizardChromeStep = {
  id: string;
  label: string;
  description?: string;
};

export type WizardChromeProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  steps: WizardChromeStep[];
  currentStepId: string;
  onStepChange: (stepId: string) => void;
  onBack: () => void;
  onNext: () => void;
  onSubmit: () => void;
  submitLabel?: string;
  submitting?: boolean;
  /** When true, disables Next/Create. Use to gate on local validation. */
  canAdvance?: boolean;
  children: React.ReactNode;
  frame?: CreateWizardFrame;
  popupSize?: "sm" | "md" | "lg" | "xl" | "full";
  sidebarPushMode?: "content" | "app";
  /** Optional: replace the default footer entirely. */
  customFooter?: React.ReactNode;
  /** "create" (default) shows linear Back/Next/Submit and gates the stepper. "edit" lets the user jump freely between steps. */
  mode?: "create" | "edit";
  /** Inline status accessory rendered next to the title — typically a `<Chip>`. */
  headerTitleAccessory?: React.ReactNode;
};

/**
 * Controlled wizard chrome. Renders the sidebar/popup frame, stepper, and
 * footer — but the parent owns all step state and validation. Use this when
 * the wizard's body needs to interact with state that lives outside the
 * wizard (e.g. opens a dialog that mutates parent state).
 *
 * For the common case where the wizard owns its own state, prefer
 * `<CreateWizard>` (which uses `useCreateFlow` under the hood).
 */
export function WizardChrome({
  open,
  onClose,
  title,
  subtitle,
  steps,
  currentStepId,
  onStepChange,
  onBack,
  onNext,
  onSubmit,
  submitLabel = "Create",
  submitting = false,
  canAdvance = true,
  children,
  frame = "sidebar",
  popupSize = "lg",
  sidebarPushMode = "content",
  customFooter,
  mode = "create",
  headerTitleAccessory
}: WizardChromeProps) {
  const isEdit = mode === "edit";
  const currentIndex = Math.max(0, steps.findIndex((step) => step.id === currentStepId));
  const isFirstStep = currentIndex <= 0;
  const isLastStep = currentIndex >= steps.length - 1;
  const currentStep = steps[currentIndex];
  const resolvedSubtitle = subtitle ?? currentStep?.description;

  const stepper =
    steps.length > 1 ? (
      <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-text-muted">
        {steps.map((step, index) => {
          const isComplete = index < currentIndex;
          const isCurrent = index === currentIndex;
          const reachable = isEdit ? true : index <= currentIndex;
          return (
            <React.Fragment key={step.id}>
              <button
                className={
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                  (isCurrent
                    ? "border-accent/40 bg-accent/10 text-text"
                    : isComplete && !isEdit
                      ? "border-success/40 bg-success/5 text-success"
                      : "border-border bg-surface text-text-muted hover:bg-surface-muted/60")
                }
                disabled={!reachable || submitting}
                onClick={() => onStepChange(step.id)}
                type="button"
              >
                {isEdit ? null : <span className="font-medium">{index + 1}. </span>}{step.label}
              </button>
              {index < steps.length - 1 ? <span className="text-text-muted/60">›</span> : null}
            </React.Fragment>
          );
        })}
      </div>
    ) : null;

  const defaultFooter = isEdit ? (
    <>
      <Button intent="cancel" onClick={onClose} type="button" variant="ghost" disabled={submitting}>Cancel</Button>
      <div className="ml-auto flex items-center gap-2">
        <Button onClick={onSubmit} type="button" loading={submitting} disabled={submitting || !canAdvance}>
          <Save className="h-4 w-4" />
          {submitLabel}
        </Button>
      </div>
    </>
  ) : (
    <>
      <Button intent="cancel" onClick={onClose} type="button" variant="ghost" disabled={submitting}>Cancel</Button>
      <div className="ml-auto flex items-center gap-2">
        {!isFirstStep ? (
          <Button onClick={onBack} type="button" variant="secondary" disabled={submitting}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        ) : null}
        {isLastStep ? (
          <Button onClick={onSubmit} type="button" loading={submitting} disabled={submitting || !canAdvance}>
            <Save className="h-4 w-4" />
            {submitLabel}
          </Button>
        ) : (
          <Button onClick={onNext} type="button" disabled={submitting || !canAdvance}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </>
  );

  const footer = customFooter ?? defaultFooter;

  const body = (
    <div className="space-y-2">
      {stepper}
      {children}
    </div>
  );

  if (frame === "popup") {
    return (
      <Popup footer={footer} headerTitleAccessory={headerTitleAccessory} onClose={onClose} open={open} size={popupSize} subtitle={resolvedSubtitle} title={title} viewKey={currentStepId}>
        {body}
      </Popup>
    );
  }

  return (
    <Panel footer={footer} headerTitleAccessory={headerTitleAccessory} onClose={onClose} open={open} pushMode={sidebarPushMode} subtitle={resolvedSubtitle} title={title}>
      {body}
    </Panel>
  );
}

export type CreateWizardProps<TState> = {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  initialState: TState;
  steps: WizardStep<TState>[];
  submitLabel?: string;
  onSubmit: (state: TState) => Promise<CreateWizardSubmitResult>;
  confirmCloseDescription?: string;
  /** Visual frame. Defaults to "sidebar" — popup is opt-in for specific contexts. */
  frame?: CreateWizardFrame;
  /** Optional persistence adapter. Use `draftId` for the common localStorage case. */
  persistence?: WizardPersistenceAdapter<TState>;
  /** Shorthand: scope a localStorage draft by id. Ignored if `persistence` is set. */
  draftId?: string;
  /** Optional version string used to invalidate drafts when the state shape changes. */
  draftVersion?: string;
  /** Popup size when frame="popup". Defaults to "lg". */
  popupSize?: "sm" | "md" | "lg" | "xl" | "full";
  /** Push-mode for sidebar. Defaults to "content" (matches Panel default). */
  sidebarPushMode?: "content" | "app";
  /** Hide the footer Cancel button — relies on the panel/popup X to close. */
  hideCancel?: boolean;
  /**
   * "create" (default) shows back/next/submit and gates the stepper on linear
   * progress. "edit" lets the user jump freely between steps and replaces the
   * footer with a single Save button — used as the "settings" experience for
   * an existing entity.
   */
  mode?: "create" | "edit";
  /** Forwarded to the underlying Panel header (sidebar frame only). */
  headerShowAvatar?: boolean;
  headerAvatarSlot?: React.ReactNode;
  headerAvatarAlt?: string;
  /**
   * Inline status accessory (typically a `<Chip>`) rendered next to the
   * title in the wizard header. Convention: any wizard controlling an
   * entity with a status MUST render that status here, not as a separate
   * "Visibility" / "Status" step. See `packages/ui/CLAUDE.md`.
   *
   * Accepts either a static node or a render function that receives the
   * live wizard state — use the function form when the chip needs to
   * reflect / drive the in-flight wizard state (the common case).
   */
  headerTitleAccessory?:
    | React.ReactNode
    | ((ctx: { state: TState; setField: <K extends keyof TState>(key: K, value: TState[K]) => void }) => React.ReactNode);
};

export function CreateWizard<TState>({
  open,
  onClose,
  title,
  subtitle,
  initialState,
  steps,
  submitLabel = "Create",
  onSubmit,
  confirmCloseDescription = "Your unsaved changes will be lost.",
  frame = "sidebar",
  persistence,
  draftId,
  draftVersion,
  popupSize = "lg",
  sidebarPushMode = "content",
  hideCancel = false,
  mode = "create",
  headerShowAvatar,
  headerAvatarSlot,
  headerAvatarAlt,
  headerTitleAccessory
}: CreateWizardProps<TState>) {
  const isEdit = mode === "edit";
  const { confirm } = useConfirmDialog();

  const resolvedPersistence = React.useMemo(() => {
    // No draft persistence in edit mode — we're editing a real entity, not a draft.
    if (isEdit) {
      return undefined;
    }
    if (persistence) {
      return persistence;
    }
    if (draftId) {
      return createLocalStoragePersistence<TState>(`orgframe.wizard.${draftId}`, { version: draftVersion });
    }
    return undefined;
  }, [persistence, draftId, draftVersion, isEdit]);

  const flow = useCreateFlow<TState>({
    open,
    onClose,
    initialState,
    steps,
    onSubmit,
    persistence: resolvedPersistence,
    validateAllOnSubmit: isEdit
  });

  const requestClose = React.useCallback(async () => {
    if (flow.submitting) {
      return;
    }
    if (!flow.isDirty) {
      onClose();
      return;
    }
    const confirmed = await confirm({
      title: "Discard changes?",
      description: confirmCloseDescription,
      confirmLabel: "Discard",
      cancelLabel: "Keep editing",
      variant: "destructive"
    });
    if (confirmed) {
      const adapter = resolvedPersistence;
      if (adapter) {
        await Promise.resolve(adapter.clear()).catch(() => undefined);
      }
      onClose();
    }
  }, [confirm, confirmCloseDescription, flow.isDirty, flow.submitting, onClose, resolvedPersistence]);

  const stepper =
    flow.totalVisible > 1 ? (
      <div className="flex flex-wrap items-center gap-1.5 px-1 text-xs text-text-muted">
        {flow.visibleSteps.map((step, index) => {
          const isComplete = index < flow.currentIndex;
          const isCurrent = index === flow.currentIndex;
          // In edit mode every step is reachable; in create mode you only
          // unlock the steps you've already advanced through.
          const reachable = isEdit ? true : index <= flow.currentIndex;
          return (
            <React.Fragment key={step.id}>
              <button
                className={
                  "rounded-full border px-2.5 py-1 text-xs font-medium transition " +
                  (isCurrent
                    ? "border-accent/40 bg-accent/10 text-text"
                    : isComplete && !isEdit
                      ? "border-success/40 bg-success/5 text-success"
                      : "border-border bg-surface text-text-muted hover:bg-surface-muted/60")
                }
                disabled={!reachable || flow.submitting}
                onClick={() => flow.goToIndex(index)}
                type="button"
              >
                {isEdit ? null : <span className="font-medium">{index + 1}. </span>}
                {step.label}
              </button>
              {index < flow.visibleSteps.length - 1 ? <span className="text-text-muted/60">›</span> : null}
            </React.Fragment>
          );
        })}
      </div>
    ) : null;

  const draftBanner =
    flow.restoredFromDraft && flow.isDirty ? (
      <div className="mb-3 flex items-center justify-between gap-2 rounded-control border border-accent/30 bg-accent/5 px-3 py-2 text-xs text-text">
        <span>Restored from your last draft.</span>
        <Button onClick={flow.resetDraft} size="sm" type="button" variant="ghost">
          <RotateCcw className="h-3.5 w-3.5" />
          Start fresh
        </Button>
      </div>
    ) : null;

  const body = (
    <div className="space-y-2">
      {stepper}
      {draftBanner}
      {flow.currentStep
        ? flow.currentStep.render({
            state: flow.state,
            setState: flow.setState,
            setField: flow.setField,
            fieldErrors: flow.fieldErrors
          })
        : null}
    </div>
  );

  const editSubmitLabel = submitLabel === "Create" ? "Save changes" : submitLabel;
  const footer = isEdit ? (
    <>
      {hideCancel ? null : (
        <Button onClick={requestClose} type="button" variant="ghost" disabled={flow.submitting}>
          Close
        </Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        <Button
          disabled={flow.submitting || !flow.isDirty}
          loading={flow.submitting}
          onClick={flow.submit}
          type="submit"
        >
          <Save className="h-4 w-4" />
          {editSubmitLabel}
        </Button>
      </div>
    </>
  ) : (
    <>
      {hideCancel ? null : (
        <Button intent="cancel" onClick={requestClose} type="button" variant="ghost" disabled={flow.submitting}>Cancel</Button>
      )}
      <div className="ml-auto flex items-center gap-2">
        {!flow.isFirstStep ? (
          <Button onClick={flow.back} type="button" variant="secondary" disabled={flow.submitting}>
            <ChevronLeft className="h-4 w-4" />
            Back
          </Button>
        ) : null}
        {flow.isLastStep ? (
          <Button onClick={flow.submit} type="submit" loading={flow.submitting} disabled={flow.submitting}>
            <Save className="h-4 w-4" />
            {submitLabel}
          </Button>
        ) : (
          <Button onClick={flow.next} type="button" disabled={flow.submitting}>
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </>
  );

  const resolvedSubtitle = subtitle ?? flow.currentStep?.description;
  const resolvedTitleAccessory =
    typeof headerTitleAccessory === "function"
      ? headerTitleAccessory({ state: flow.state, setField: flow.setField })
      : headerTitleAccessory;

  if (frame === "popup") {
    return (
      <Popup
        footer={footer}
        headerTitleAccessory={resolvedTitleAccessory}
        onClose={requestClose}
        open={open}
        size={popupSize}
        subtitle={resolvedSubtitle}
        title={title}
        viewKey={flow.currentStep?.id ?? "step-0"}
      >
        {body}
      </Popup>
    );
  }

  return (
    <Panel
      footer={footer}
      headerAvatarAlt={headerAvatarAlt}
      headerAvatarSlot={headerAvatarSlot}
      headerShowAvatar={headerShowAvatar}
      headerTitleAccessory={resolvedTitleAccessory}
      onClose={requestClose}
      open={open}
      pushMode={sidebarPushMode}
      subtitle={resolvedSubtitle}
      title={title}
    >
      {body}
    </Panel>
  );
}
