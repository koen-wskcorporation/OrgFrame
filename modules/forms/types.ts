import type { ButtonConfig } from "@/lib/links";

export type FormStatus = "draft" | "published" | "archived";

export type FormKind = "generic" | "program_registration";

export type TargetMode = "locked" | "choice";

export type SubmissionStatus = "submitted" | "in_review" | "approved" | "rejected" | "waitlisted" | "cancelled";

export type FormFieldType = "text" | "textarea" | "email" | "phone" | "number" | "date" | "select" | "checkbox";

export type FormPageKey = "generic_custom" | "generic_success" | "registration_player" | "registration_division_questions" | "registration_payment" | "registration_success";

export const REGISTRATION_PAGE_KEYS = {
  player: "registration_player",
  divisionQuestions: "registration_division_questions",
  payment: "registration_payment",
  success: "registration_success"
} as const;

export const REGISTRATION_PAGE_ORDER = [
  REGISTRATION_PAGE_KEYS.player,
  REGISTRATION_PAGE_KEYS.divisionQuestions,
  REGISTRATION_PAGE_KEYS.payment,
  REGISTRATION_PAGE_KEYS.success
] as const;

export type FormFieldOption = {
  value: string;
  label: string;
};

export type FormField = {
  id: string;
  name: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder: string | null;
  helpText: string | null;
  options: FormFieldOption[];
  targetNodeIds: string[];
  includeDescendants: boolean;
};

export type FormPage = {
  id: string;
  pageKey: FormPageKey;
  title: string;
  description: string | null;
  fields: FormField[];
  successButtons: ButtonConfig[];
  showSubmitAnotherResponseButton: boolean;
  locked: boolean;
};

export type FormRuleOperator = "equals" | "not_equals" | "is_true" | "is_false";

export type FormRuleEffect = "show" | "require";

export type FormRule = {
  id: string;
  sourceFieldName: string;
  operator: FormRuleOperator;
  value: string | boolean | null;
  targetFieldName: string;
  effect: FormRuleEffect;
};

export type FormSchema = {
  version: number;
  title: string;
  description: string | null;
  pages: FormPage[];
  rules: FormRule[];
};

export type OrgForm = {
  id: string;
  orgId: string;
  slug: string;
  name: string;
  description: string | null;
  formKind: FormKind;
  status: FormStatus;
  programId: string | null;
  targetMode: TargetMode;
  lockedProgramNodeId: string | null;
  schemaJson: FormSchema;
  uiJson: Record<string, unknown>;
  settingsJson: Record<string, unknown>;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type OrgFormVersion = {
  id: string;
  orgId: string;
  formId: string;
  versionNumber: number;
  snapshotJson: Record<string, unknown>;
  publishedAt: string;
  createdBy: string | null;
  createdAt: string;
};

export type FormSubmission = {
  id: string;
  orgId: string;
  formId: string;
  versionId: string;
  submittedByUserId: string | null;
  status: SubmissionStatus;
  answersJson: Record<string, unknown>;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type FormSubmissionEntry = {
  id: string;
  submissionId: string;
  playerId: string;
  programNodeId: string | null;
  answersJson: Record<string, unknown>;
  createdAt: string;
};

export type FormSubmissionWithEntries = FormSubmission & {
  entries: FormSubmissionEntry[];
};

export type ProgramRegistration = {
  id: string;
  orgId: string;
  programId: string;
  programNodeId: string | null;
  playerId: string;
  submissionId: string;
  status: SubmissionStatus;
  createdAt: string;
  updatedAt: string;
};

export type RegistrationPlayerEntryInput = {
  playerId: string;
  programNodeId: string | null;
  answers: Record<string, unknown>;
};

export type FormSubmissionViewVisibilityScope = "private" | "forms_readers" | "specific_admin";

export type FormSubmissionViewConfig = {
  visibleColumnKeys?: string[];
  columnOrderKeys?: string[];
  pinnedLeftColumnKeys?: string[];
  pinnedRightColumnKeys?: string[];
  columnWidthsByKey?: Record<string, number>;
  sort?: {
    columnKey: string | null;
    direction: "asc" | "desc";
  };
  searchQuery?: string;
};

export type OrgFormSubmissionView = {
  id: string;
  orgId: string;
  formId: string;
  name: string;
  sortIndex: number;
  visibilityScope: FormSubmissionViewVisibilityScope;
  targetUserId: string | null;
  configJson: FormSubmissionViewConfig;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
};
