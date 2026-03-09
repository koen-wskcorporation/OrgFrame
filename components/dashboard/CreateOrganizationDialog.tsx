"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Building2, GraduationCap, Shield, Sparkles, Trophy } from "lucide-react";
import { createOrganizationAction } from "@/app/account/organizations/actions";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { MultiSelect } from "@/components/ui/multi-select";
import { useToast } from "@/components/ui/toast";
import { applyBrandingVars } from "@/lib/branding/applyBrandingVars";
import { useSiteOrigin } from "@/lib/hooks/useSiteOrigin";
import { ACTIVITY_OPTIONS, ORG_TYPE_OPTIONS, THEME_COLOR_OPTIONS, normalizeOrgSlug } from "@/lib/org/onboarding";
import { cn } from "@/lib/utils";

type StepId = "name" | "type" | "activities" | "color";
type Direction = "forward" | "backward";

type DraftState = {
  orgName: string;
  orgType: string;
  activityLabels: string[];
  themeColor: string;
};

const INITIAL_DRAFT: DraftState = {
  orgName: "",
  orgType: "",
  activityLabels: [],
  themeColor: THEME_COLOR_OPTIONS[0]?.value ?? "#0f766e"
};

const typeIconByValue = {
  club: Trophy,
  league: Shield,
  school: GraduationCap,
  academy: Sparkles,
  facility: Building2
} as const;

const steps: Array<{
  id: StepId;
  eyebrow: string;
  title: string;
  description: string;
  cta: string;
}> = [
  {
    id: "name",
    eyebrow: "Step 1",
    title: "What should we call it?",
    description: "You can always adjust the details later.",
    cta: "Continue"
  },
  {
    id: "type",
    eyebrow: "Step 2",
    title: "What kind of organization is this?",
    description: "Pick the closest fit. It helps us keep the workspace feeling tailored.",
    cta: "Continue"
  },
  {
    id: "activities",
    eyebrow: "Step 3",
    title: "Which sports or activities do you support?",
    description: "Choose one or several. Keep it simple for now.",
    cta: "Continue"
  },
  {
    id: "color",
    eyebrow: "Step 4",
    title: "Choose your org color",
    description: "A strong color makes the workspace feel like yours right away.",
    cta: "Create organization"
  }
];

function isStepValid(stepId: StepId, draft: DraftState) {
  if (stepId === "name") {
    const length = draft.orgName.trim().length;
    return length >= 2 && length <= 120;
  }

  if (stepId === "type") {
    return draft.orgType.length > 0;
  }

  if (stepId === "activities") {
    return draft.activityLabels.length > 0;
  }

  return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(draft.themeColor);
}

function progressPercentage(stepIndex: number) {
  return ((stepIndex + 1) / steps.length) * 100;
}

function ThemePreview({ orgName, themeColor }: { orgName: string; themeColor: string }) {
  const style = applyBrandingVars({ accent: themeColor });
  const previewName = orgName.trim() || "Your Organization";

  return (
    <div
      className="overflow-hidden rounded-[28px] border border-border/70 bg-[linear-gradient(180deg,hsl(var(--surface)),hsl(200_25%_97%))] shadow-[0_20px_40px_hsl(220_30%_16%/0.08)]"
      style={style}
    >
      <div className="flex items-center justify-between border-b border-border/65 bg-[hsl(var(--accent)/0.12)] px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Preview</p>
          <p className="mt-1 text-sm font-semibold text-text">{previewName}</p>
        </div>
        <span className="rounded-full bg-[hsl(var(--accent))] px-3 py-1 text-xs font-semibold text-[hsl(var(--accent-foreground))]">Live</span>
      </div>

      <div className="space-y-3 px-4 py-4">
        <div className="rounded-[20px] border border-border/70 bg-white/85 p-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Workspace button</p>
          <button
            className="mt-3 inline-flex h-10 items-center rounded-full bg-[hsl(var(--accent))] px-4 text-sm font-semibold text-[hsl(var(--accent-foreground))] shadow-sm"
            type="button"
          >
            Open dashboard
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="rounded-full border border-border/70 bg-white/80 px-3 py-1 text-xs font-semibold text-text">Programs</span>
          <span className="rounded-full bg-[hsl(var(--accent)/0.14)] px-3 py-1 text-xs font-semibold text-text">Brand color</span>
        </div>
      </div>
    </div>
  );
}

export function CreateOrganizationDialog() {
  const router = useRouter();
  const siteOrigin = useSiteOrigin();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DraftState>(INITIAL_DRAFT);
  const [stepIndex, setStepIndex] = useState(0);
  const [direction, setDirection] = useState<Direction>("forward");
  const [isPending, startTransition] = useTransition();

  const currentStep = steps[stepIndex];
  const canContinue = isStepValid(currentStep.id, draft);
  const currentSlug = useMemo(() => normalizeOrgSlug(draft.orgName), [draft.orgName]);
  const urlPreview = currentSlug ? `${siteOrigin || ""}/${currentSlug}` : `${siteOrigin || ""}/your-org`;
  const selectedType = ORG_TYPE_OPTIONS.find((option) => option.value === draft.orgType);

  function handleClose() {
    if (isPending) {
      return;
    }

    setOpen(false);
  }

  function handleBack() {
    if (stepIndex === 0 || isPending) {
      return;
    }

    setDirection("backward");
    setStepIndex((current) => current - 1);
  }

  function goToNextStep() {
    if (stepIndex >= steps.length - 1 || !canContinue || isPending) {
      return;
    }

    setDirection("forward");
    setStepIndex((current) => current + 1);
  }

  function resetFlow() {
    setDraft(INITIAL_DRAFT);
    setStepIndex(0);
    setDirection("forward");
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending || !canContinue) {
      return;
    }

    if (currentStep.id !== "color") {
      goToNextStep();
      return;
    }

    startTransition(async () => {
      const result = await createOrganizationAction({
        orgName: draft.orgName,
        orgType: draft.orgType,
        activityLabels: draft.activityLabels,
        themeColor: draft.themeColor
      });

      if (!result.ok) {
        toast({
          title: "Unable to create organization",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setOpen(false);
      resetFlow();
      router.push(`/${result.orgSlug}/workspace`);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="secondary">
        Create organization
      </Button>

      <Modal
        className="max-w-[760px]"
        closeLabel="Close organization setup"
        contentClassName="pt-0"
        onClose={handleClose}
        open={open}
      >
        <div className="px-0 pb-1 pt-6 sm:pt-8">
          <div className="px-6 sm:px-8">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">Let&apos;s create your organization</p>
                <h2 className="mt-2 text-[clamp(1.8rem,3vw,2.35rem)] font-semibold tracking-[-0.04em] text-text">A calm setup that takes a minute.</h2>
              </div>
              <div className="hidden rounded-full border border-border/70 bg-white/75 px-4 py-2 text-sm font-medium text-text-muted shadow-sm sm:block">
                {stepIndex + 1} / {steps.length}
              </div>
            </div>

            <div className="mt-6">
              <div className="h-2 overflow-hidden rounded-full bg-surface-muted/80">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,hsl(var(--accent))_0%,hsl(var(--accent)/0.72)_100%)] transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)]"
                  style={{
                    transform: `scaleX(${progressPercentage(stepIndex) / 100})`,
                    transformOrigin: "left center"
                  }}
                />
              </div>
            </div>
          </div>

          <form className="mt-8" onSubmit={handleSubmit}>
            <div className="px-6 sm:px-8">
              <div className="ui-onboarding-step min-h-[420px]" data-direction={direction} key={currentStep.id}>
                <div className="max-w-[38rem]">
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-text-muted">{currentStep.eyebrow}</p>
                  <h3 className="mt-3 text-[clamp(1.5rem,2vw,2rem)] font-semibold tracking-[-0.03em] text-text">{currentStep.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-text-muted">{currentStep.description}</p>
                </div>

                {currentStep.id === "name" ? (
                  <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1.3fr)_minmax(260px,0.9fr)]">
                    <div className="rounded-[30px] border border-border/70 bg-[linear-gradient(180deg,hsl(0_0%_100%),hsl(200_33%_98%))] p-5 shadow-[0_18px_40px_hsl(220_28%_18%/0.06)] sm:p-6">
                      <label className="block text-sm font-semibold text-text" htmlFor="org-name">
                        Organization name
                      </label>
                      <input
                        autoFocus
                        className="mt-3 h-14 w-full rounded-[22px] border border-border bg-white px-4 text-lg font-semibold text-text shadow-[inset_0_1px_0_hsl(var(--canvas)/0.35)] outline-none transition placeholder:text-text-muted focus:border-accent/45 focus:ring-2 focus:ring-ring/35"
                        data-autofocus="true"
                        id="org-name"
                        maxLength={120}
                        onChange={(event) => setDraft((current) => ({ ...current, orgName: event.target.value }))}
                        placeholder="Northshore Soccer Club"
                        value={draft.orgName}
                      />

                      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-[22px] border border-border/70 bg-surface-muted/55 px-4 py-3">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-text-muted">URL</span>
                        <span className="text-sm font-medium text-text">{urlPreview}</span>
                      </div>

                      <p className="mt-3 text-xs leading-relaxed text-text-muted">We&apos;ll create the URL automatically from the name so you can keep moving.</p>
                    </div>

                    <div className="rounded-[30px] border border-border/70 bg-[radial-gradient(circle_at_top,_hsl(var(--accent)/0.14),_transparent_62%),linear-gradient(180deg,hsl(0_0%_100%),hsl(200_24%_97%))] p-5 shadow-[0_18px_40px_hsl(220_28%_18%/0.05)] sm:p-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Why this step is here</p>
                      <p className="mt-3 text-sm leading-relaxed text-text">
                        A clear name makes the workspace feel real immediately and helps staff know they&apos;re in the right place.
                      </p>
                      <div className="mt-6 rounded-[22px] border border-white/80 bg-white/85 p-4 shadow-sm">
                        <p className="text-sm font-semibold text-text">{draft.orgName.trim() || "Your future org name"}</p>
                        <p className="mt-1 text-sm text-text-muted">The workspace, site, and navigation all start here.</p>
                      </div>
                    </div>
                  </div>
                ) : null}

                {currentStep.id === "type" ? (
                  <div className="mt-8 grid gap-3 md:grid-cols-2">
                    {ORG_TYPE_OPTIONS.map((option) => {
                      const Icon = typeIconByValue[option.value as keyof typeof typeIconByValue] ?? Trophy;
                      const selected = option.value === draft.orgType;

                      return (
                        <button
                          className={cn(
                            "group rounded-[28px] border p-5 text-left transition duration-200",
                            "bg-[linear-gradient(180deg,hsl(0_0%_100%),hsl(200_28%_98%))] shadow-[0_14px_34px_hsl(220_28%_18%/0.05)]",
                            selected
                              ? "border-accent/45 bg-[radial-gradient(circle_at_top,_hsl(var(--accent)/0.14),_transparent_55%),linear-gradient(180deg,hsl(0_0%_100%),hsl(200_28%_98%))] shadow-[0_18px_38px_hsl(var(--accent)/0.18)]"
                              : "border-border/75 hover:-translate-y-0.5 hover:border-border hover:shadow-[0_18px_38px_hsl(220_28%_18%/0.08)]"
                          )}
                          key={option.value}
                          onClick={() => setDraft((current) => ({ ...current, orgType: option.value }))}
                          type="button"
                        >
                          <div className="flex items-start justify-between gap-4">
                            <span
                              className={cn(
                                "inline-flex h-11 w-11 items-center justify-center rounded-2xl border",
                                selected ? "border-accent/20 bg-accent/12 text-text" : "border-border/70 bg-white text-text-muted"
                              )}
                            >
                              <Icon className="h-5 w-5" />
                            </span>
                            <span
                              className={cn(
                                "rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]",
                                selected ? "bg-accent text-accent-foreground" : "bg-surface-muted text-text-muted"
                              )}
                            >
                              {selected ? "Selected" : "Choose"}
                            </span>
                          </div>

                          <p className="mt-5 text-lg font-semibold tracking-tight text-text">{option.label}</p>
                          <p className="mt-2 text-sm leading-relaxed text-text-muted">{option.description}</p>
                        </button>
                      );
                    })}
                  </div>
                ) : null}

                {currentStep.id === "activities" ? (
                  <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1.35fr)_minmax(240px,0.8fr)]">
                    <div className="rounded-[30px] border border-border/70 bg-[linear-gradient(180deg,hsl(0_0%_100%),hsl(200_28%_98%))] p-5 shadow-[0_18px_40px_hsl(220_28%_18%/0.06)] sm:p-6">
                      <MultiSelect
                        autoFocus
                        emptyMessage="Nothing matched that search."
                        onChange={(activityLabels) => setDraft((current) => ({ ...current, activityLabels }))}
                        options={ACTIVITY_OPTIONS}
                        placeholder="Search sports or activities"
                        searchPlaceholder="Search sports or activities"
                        value={draft.activityLabels}
                      />
                    </div>

                    <div className="rounded-[30px] border border-border/70 bg-[radial-gradient(circle_at_top,_hsl(var(--accent)/0.1),_transparent_58%),linear-gradient(180deg,hsl(0_0%_100%),hsl(200_24%_97%))] p-5 shadow-[0_18px_40px_hsl(220_28%_18%/0.05)] sm:p-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Selected</p>
                      {draft.activityLabels.length > 0 ? (
                        <div className="mt-4 flex flex-wrap gap-2">
                          {draft.activityLabels.map((value) => {
                            const option = ACTIVITY_OPTIONS.find((entry) => entry.value === value);

                            return (
                              <span className="rounded-full border border-border/70 bg-white/85 px-3 py-1.5 text-sm font-medium text-text" key={value}>
                                {option?.label ?? value}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="mt-4 text-sm leading-relaxed text-text-muted">Start typing to add one or more sports. The list stays lightweight even with multiple picks.</p>
                      )}
                    </div>
                  </div>
                ) : null}

                {currentStep.id === "color" ? (
                  <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1.05fr)_minmax(300px,0.95fr)]">
                    <div className="grid gap-3 sm:grid-cols-2">
                      {THEME_COLOR_OPTIONS.map((option) => {
                        const selected = option.value === draft.themeColor;

                        return (
                          <button
                            className={cn(
                              "rounded-[24px] border p-4 text-left transition duration-200",
                              selected
                                ? "border-accent/45 bg-[radial-gradient(circle_at_top,_hsl(var(--accent)/0.14),_transparent_55%),linear-gradient(180deg,hsl(0_0%_100%),hsl(200_26%_98%))] shadow-[0_18px_36px_hsl(var(--accent)/0.18)]"
                                : "border-border/75 bg-[linear-gradient(180deg,hsl(0_0%_100%),hsl(200_26%_98%))] hover:-translate-y-0.5 hover:shadow-[0_18px_36px_hsl(220_28%_18%/0.08)]"
                            )}
                            key={option.value}
                            onClick={() => setDraft((current) => ({ ...current, themeColor: option.value }))}
                            type="button"
                          >
                            <div className="flex items-center gap-3">
                              <span
                                className="h-11 w-11 rounded-2xl border border-black/5 shadow-[inset_0_1px_0_hsl(0_0%_100%/0.35)]"
                                style={{ backgroundColor: option.value }}
                              />
                              <div className="min-w-0">
                                <p className="text-sm font-semibold text-text">{option.label}</p>
                                <p className="mt-1 text-xs leading-relaxed text-text-muted">{option.description}</p>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>

                    <div className="space-y-4">
                      <div className="rounded-[30px] border border-border/70 bg-[linear-gradient(180deg,hsl(0_0%_100%),hsl(200_24%_97%))] p-5 shadow-[0_18px_40px_hsl(220_28%_18%/0.05)] sm:p-6">
                        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Current feel</p>
                        <p className="mt-2 text-sm leading-relaxed text-text-muted">
                          {selectedType ? `${selectedType.label} setup` : "Organization setup"} with a brand color that carries through the workspace.
                        </p>
                      </div>

                      <ThemePreview orgName={draft.orgName} themeColor={draft.themeColor} />
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="mt-8 flex flex-col gap-3 border-t border-border/70 bg-white/55 px-6 py-4 backdrop-blur sm:flex-row sm:items-center sm:justify-between sm:px-8">
              <div className="flex items-center gap-2">
                {stepIndex > 0 ? (
                  <Button disabled={isPending} onClick={handleBack} size="sm" variant="ghost">
                    <ArrowLeft className="h-4 w-4" />
                    Back
                  </Button>
                ) : (
                  <p className="text-sm text-text-muted">You can close this anytime and come back right where you left off.</p>
                )}
              </div>

              <Button disabled={!canContinue || isPending} loading={isPending} size="lg" type="submit">
                {isPending ? "Creating..." : currentStep.cta}
              </Button>
            </div>
          </form>
        </div>
      </Modal>
    </>
  );
}
