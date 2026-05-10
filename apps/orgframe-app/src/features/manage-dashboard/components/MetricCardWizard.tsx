"use client";

import { useMemo } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { useCreateFlow, WizardChrome, type WizardStep } from "@orgframe/ui/primitives/create-wizard";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select, type SelectOption } from "@orgframe/ui/primitives/select";
import type { Permission } from "@/src/features/core/access";
import { hasAnyPermission } from "@/src/features/manage-dashboard/widgets/metadata";
import { DEFAULT_METRIC_SOURCE, METRIC_SOURCES, type MetricSource } from "@/src/features/manage-dashboard/widgets/metric-sources";

export type MetricCardWizardResult = { label: string; source: string };

type MetricCardWizardProps = {
  open: boolean;
  mode: "create" | "edit";
  availablePermissions: Permission[];
  initial?: MetricCardWizardResult;
  onClose: () => void;
  onFinish: (result: MetricCardWizardResult) => void;
  onDelete?: () => void;
};

type DataType = MetricSource["group"];

type WizardState = {
  label: string;
  dataType: DataType;
  source: string;
};

export function MetricCardWizard({
  open,
  mode,
  availablePermissions,
  initial,
  onClose,
  onFinish,
  onDelete
}: MetricCardWizardProps) {
  const allowedSources = useMemo<MetricSource[]>(
    () => METRIC_SOURCES.filter((m) => hasAnyPermission(availablePermissions, m.requiredAnyPermission)),
    [availablePermissions]
  );
  const allowedTypes = useMemo<DataType[]>(
    () => Array.from(new Set(allowedSources.map((m) => m.group))),
    [allowedSources]
  );
  const fallbackSource = allowedSources[0]?.value ?? DEFAULT_METRIC_SOURCE;
  const fallbackType: DataType = allowedTypes[0] ?? "Forms";

  const dataTypeOf = (sourceValue: string): DataType =>
    allowedSources.find((m) => m.value === sourceValue)?.group ?? fallbackType;

  const initialState = useMemo<WizardState>(() => {
    const requestedSource = initial?.source;
    const source =
      requestedSource && allowedSources.some((m) => m.value === requestedSource)
        ? requestedSource
        : fallbackSource;
    return {
      label: initial?.label ?? "",
      dataType: dataTypeOf(source),
      source
    };
  }, [initial?.label, initial?.source, fallbackSource, allowedSources]);

  const steps = useMemo<WizardStep<WizardState>[]>(() => {
    const typeOptions: SelectOption[] = allowedTypes.map((t) => ({ value: t, label: t }));
    return [
      {
        id: "name",
        label: "Name",
        description: "Give the card a short title that describes what it shows.",
        validate: (state) => (state.label.trim().length === 0 ? { label: "Enter a name." } : null),
        render: ({ state, setField, fieldErrors }) => (
          <FormField error={fieldErrors.label} hint="This is the title shown on the card." label="Card name">
            <Input
              autoFocus
              onChange={(e) => setField("label", e.target.value)}
              placeholder="e.g. Active forms"
              value={state.label}
            />
          </FormField>
        )
      },
      {
        id: "type",
        label: "Data type",
        description: "Pick the area of the org this card pulls from.",
        render: ({ state, setState }) => {
          if (allowedTypes.length === 0) {
            return (
              <Alert variant="warning">
                You don't have access to any data types in this org. Ask an admin to enable a module or grant a permission.
              </Alert>
            );
          }
          return (
            <FormField hint="Only data types you have access to in this org are listed." label="Data type">
              <Select
                onChange={(e) => {
                  const next = e.target.value as DataType;
                  const first = allowedSources.find((m) => m.group === next);
                  setState((current) => ({
                    ...current,
                    dataType: next,
                    source: first ? first.value : current.source
                  }));
                }}
                options={typeOptions}
                value={state.dataType}
              />
            </FormField>
          );
        }
      },
      {
        id: "source",
        label: "Data point",
        description: "Pick the specific metric this card will display.",
        render: ({ state, setField }) => {
          const sourcesForType = allowedSources.filter((m) => m.group === state.dataType);
          const sourceOptions: SelectOption[] = sourcesForType.map((m) => ({ value: m.value, label: m.label }));
          const sourceMeta = allowedSources.find((m) => m.value === state.source);
          if (sourceOptions.length === 0) {
            return <Alert variant="warning">No data points available for this type.</Alert>;
          }
          return (
            <FormField
              hint={`The card will display the current value of ${sourceMeta?.label ?? state.source}.`}
              label="Data point"
            >
              <Select
                onChange={(e) => setField("source", e.target.value)}
                options={sourceOptions}
                value={state.source}
              />
            </FormField>
          );
        }
      }
    ];
  }, [allowedSources, allowedTypes]);

  const flow = useCreateFlow<WizardState>({
    open,
    onClose,
    initialState,
    steps,
    validateAllOnSubmit: mode === "edit",
    onSubmit: async (state) => {
      const trimmed = state.label.trim();
      if (trimmed.length === 0) {
        return { ok: false, fieldErrors: { label: "Enter a name." }, stepId: "name" };
      }
      onFinish({ label: trimmed, source: state.source });
      return { ok: true };
    }
  });

  const trimmedLabel = flow.state.label.trim();
  const title = trimmedLabel.length > 0
    ? trimmedLabel
    : mode === "edit"
      ? "Untitled card"
      : "New metric card";

  return (
    <WizardChrome
      currentStepId={flow.currentStep?.id ?? steps[0].id}
      delete={
        mode === "edit" && onDelete
          ? {
              onDelete,
              confirmTitle: "Delete card?",
              confirmDescription: "This card will be removed from your dashboard."
            }
          : undefined
      }
      mode={mode}
      onBack={flow.back}
      onClose={onClose}
      onNext={flow.next}
      onStepChange={(id) => {
        const idx = flow.visibleSteps.findIndex((s) => s.id === id);
        if (idx >= 0) flow.goToIndex(idx);
      }}
      onSubmit={flow.submit}
      open={open}
      steps={flow.visibleSteps.map((s) => ({ id: s.id, label: s.label, description: s.description }))}
      submitLabel={mode === "edit" ? "Save changes" : "Add card"}
      submitting={flow.submitting}
      title={title}
    >
      {flow.currentStep
        ? flow.currentStep.render({
            state: flow.state,
            setState: flow.setState,
            setField: flow.setField,
            fieldErrors: flow.fieldErrors
          })
        : null}
    </WizardChrome>
  );
}
