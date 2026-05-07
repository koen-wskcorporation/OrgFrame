"use client";

// Re-export the consolidated wizard primitive. The implementation lives in
// `@orgframe/ui/primitives/create-wizard` so it can be reused across apps and
// can render in either a sidebar (default) or popup frame.
export {
  CreateWizard,
  WizardChrome,
  useCreateFlow,
  validateWithServerAction,
  createLocalStoragePersistence
} from "@orgframe/ui/primitives/create-wizard";

export type {
  CreateWizardProps,
  CreateWizardFrame,
  CreateWizardSubmitResult,
  WizardStep,
  WizardStepRenderContext,
  WizardChromeProps,
  WizardChromeStep,
  WizardPersistenceAdapter,
  UseCreateFlowOptions,
  UseCreateFlowResult
} from "@orgframe/ui/primitives/create-wizard";
