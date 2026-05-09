"use client";

import { useEffect, useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { Select, type SelectOption } from "@orgframe/ui/primitives/select";
import { DEFAULT_METRIC_SOURCE, METRIC_SOURCES } from "@/src/features/manage-dashboard/widgets/metric-sources";

export type MetricCardWizardResult = { label: string; source: string };

type MetricCardWizardProps = {
  open: boolean;
  onClose: () => void;
  onFinish: (result: MetricCardWizardResult) => void;
};

type Step = "name" | "source";

export function MetricCardWizard({ open, onClose, onFinish }: MetricCardWizardProps) {
  const [step, setStep] = useState<Step>("name");
  const [label, setLabel] = useState("");
  const [source, setSource] = useState<string>(DEFAULT_METRIC_SOURCE);

  useEffect(() => {
    if (open) {
      setStep("name");
      setLabel("");
      setSource(DEFAULT_METRIC_SOURCE);
    }
  }, [open]);

  const trimmed = label.trim();
  const canProceedFromName = trimmed.length > 0;
  const sourceMeta = METRIC_SOURCES.find((m) => m.value === source);

  const sourceOptions: SelectOption[] = METRIC_SOURCES.map((m) => ({
    value: m.value,
    label: m.label,
    meta: m.group
  }));

  const finish = () => {
    if (!canProceedFromName) return;
    onFinish({ label: trimmed, source });
  };

  const footer = (
    <div className="flex w-full items-center justify-between gap-2">
      <Button intent="cancel" onClick={onClose} />
      {step === "name" ? (
        <Button disabled={!canProceedFromName} onClick={() => setStep("source")} variant="primary">
          Next
        </Button>
      ) : (
        <div className="flex items-center gap-2">
          <Button onClick={() => setStep("name")} variant="ghost">
            Back
          </Button>
          <Button onClick={finish} variant="primary">
            Add card
          </Button>
        </div>
      )}
    </div>
  );

  return (
    <Panel
      footer={footer}
      onClose={onClose}
      open={open}
      panelKey="metric-card-wizard"
      subtitle={step === "name" ? "Step 1 of 2 — Name" : "Step 2 of 2 — Data source"}
      title="New metric card"
    >
      {step === "name" ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm text-text">
            <span className="ui-kv-label">Card name</span>
            <Input
              autoFocus
              onChange={(e) => setLabel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canProceedFromName) {
                  e.preventDefault();
                  setStep("source");
                }
              }}
              placeholder="e.g. Active forms"
              value={label}
            />
          </label>
          <p className="text-xs text-text-muted">This is the label shown above the value on the card.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm text-text">
            <span className="ui-kv-label">Data source</span>
            <Select
              onChange={(e) => setSource(e.target.value)}
              options={sourceOptions}
              value={source}
            />
          </label>
          <p className="text-xs text-text-muted">
            The card will display the current value of <strong>{sourceMeta?.label ?? source}</strong>.
          </p>
        </div>
      )}
    </Panel>
  );
}
