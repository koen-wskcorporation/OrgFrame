import { z } from "zod";
import { buttonConfigSchema, normalizeButtons } from "@/lib/links";
import type { FormField, FormKind, FormPage, FormPageKey, FormSchema } from "@/modules/forms/types";
import { REGISTRATION_PAGE_KEYS, REGISTRATION_PAGE_ORDER } from "@/modules/forms/types";

const fieldTypeValues = ["text", "textarea", "email", "phone", "number", "date", "select", "checkbox"] as const;
const ruleOperatorValues = ["equals", "not_equals", "is_true", "is_false"] as const;
const ruleEffectValues = ["show", "require"] as const;
const pageKeyValues = ["generic_custom", "generic_success", "registration_player", "registration_division_questions", "registration_payment", "registration_success"] as const;

const optionSchema = z.object({
  value: z.string().trim().min(1).max(120),
  label: z.string().trim().min(1).max(120)
});

const fieldSchema = z.object({
  id: z.string().trim().min(1).max(64),
  name: z.string().trim().min(1).max(64),
  label: z.string().trim().min(1).max(120),
  type: z.enum(fieldTypeValues),
  required: z.boolean().default(false),
  placeholder: z.string().trim().max(200).nullable().optional(),
  helpText: z.string().trim().max(300).nullable().optional(),
  options: z.array(optionSchema).optional().default([]),
  targetNodeIds: z.array(z.string().uuid()).optional().default([]),
  includeDescendants: z.boolean().optional().default(false)
});

const pageSchema = z.object({
  id: z.string().trim().min(1).max(64),
  pageKey: z.enum(pageKeyValues).optional().default("generic_custom"),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).nullable().optional(),
  fields: z.array(fieldSchema).default([]),
  successButtons: z.array(buttonConfigSchema).optional().default([]),
  showSubmitAnotherResponseButton: z.boolean().optional().default(false),
  locked: z.boolean().optional().default(false)
});

const ruleSchema = z.object({
  id: z.string().trim().min(1).max(64),
  sourceFieldName: z.string().trim().min(1).max(64),
  operator: z.enum(ruleOperatorValues),
  value: z.union([z.string(), z.boolean(), z.null()]).optional().nullable(),
  targetFieldName: z.string().trim().min(1).max(64),
  effect: z.enum(ruleEffectValues)
});

const formSchemaV2Validator = z.object({
  version: z.number().int().positive().default(2),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  pages: z.array(pageSchema).default([]),
  rules: z.array(ruleSchema).default([])
});

const legacySectionSchema = z.object({
  id: z.string().trim().min(1).max(64),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(300).nullable().optional(),
  fields: z.array(fieldSchema.omit({ targetNodeIds: true, includeDescendants: true })).default([])
});

const legacyFormSchemaValidator = z.object({
  version: z.number().int().positive().default(1),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().optional(),
  sections: z.array(legacySectionSchema).default([]),
  rules: z.array(ruleSchema).default([])
});

function createRegistrationPageTemplate(pageKey: Exclude<FormPageKey, "generic_custom" | "generic_success">): FormPage {
  if (pageKey === REGISTRATION_PAGE_KEYS.player) {
    return {
      id: "page-registration-player",
      pageKey,
      title: "Player",
      description: "Select one or more players for this registration.",
      fields: [],
      successButtons: [],
      showSubmitAnotherResponseButton: false,
      locked: true
    };
  }

  if (pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions) {
    return {
      id: "page-registration-division-questions",
      pageKey,
      title: "Division + Questions",
      description: "Choose divisions and answer registration questions.",
      fields: [],
      successButtons: [],
      showSubmitAnotherResponseButton: false,
      locked: true
    };
  }

  if (pageKey === REGISTRATION_PAGE_KEYS.success) {
    return {
      id: "page-registration-success",
      pageKey,
      title: "Success",
      description: "Thanks for submitting. We'll follow up with next steps.",
      fields: [],
      successButtons: [],
      showSubmitAnotherResponseButton: true,
      locked: true
    };
  }

  return {
    id: "page-registration-payment",
    pageKey,
    title: "Payment",
    description: "Review and submit (payment placeholder).",
    fields: [],
    successButtons: [],
    showSubmitAnotherResponseButton: false,
    locked: true
  };
}

function createDefaultGenericPage(): FormPage {
  return {
    id: "page-general",
    pageKey: "generic_custom",
    title: "General",
    description: null,
    fields: [],
    successButtons: [],
    showSubmitAnotherResponseButton: false,
    locked: false
  };
}

function createDefaultGenericSuccessPage(): FormPage {
  return {
    id: "page-success",
    pageKey: "generic_success",
    title: "Success",
    description: "Thanks for submitting. We'll be in touch soon.",
    fields: [],
    successButtons: [],
    showSubmitAnotherResponseButton: true,
    locked: true
  };
}

export function createDefaultRegistrationPages(): FormPage[] {
  return REGISTRATION_PAGE_ORDER.map((pageKey) => createRegistrationPageTemplate(pageKey));
}

export function createDefaultFormSchema(name = "Form", formKind: FormKind = "generic"): FormSchema {
  return {
    version: 2,
    title: name,
    description: null,
    pages: formKind === "program_registration" ? createDefaultRegistrationPages() : [createDefaultGenericPage(), createDefaultGenericSuccessPage()],
    rules: []
  };
}

function normalizeField(field: {
  id: string;
  name: string;
  label: string;
  type: (typeof fieldTypeValues)[number];
  required: boolean;
  placeholder?: string | null;
  helpText?: string | null;
  options?: Array<{ value: string; label: string }>;
  targetNodeIds?: string[];
  includeDescendants?: boolean;
}): FormField {
  return {
    id: field.id,
    name: field.name,
    label: field.label,
    type: field.type,
    required: field.required,
    placeholder: field.placeholder ?? null,
    helpText: field.helpText ?? null,
    options: field.options ?? [],
    targetNodeIds: Array.from(new Set((field.targetNodeIds ?? []).filter((value) => value.length > 0))),
    includeDescendants: Boolean(field.includeDescendants)
  };
}

function mapGenericPages(pages: Array<z.infer<typeof pageSchema>>): FormPage[] {
  const mappedPages: FormPage[] = pages.map((page, index) => ({
    id: page.id,
    pageKey: page.pageKey === "generic_success" ? "generic_success" : "generic_custom",
    title: page.title || `Page ${index + 1}`,
    description: page.description ?? null,
    fields: (page.fields ?? []).map((field) => normalizeField(field)),
    successButtons: normalizeButtons(page.successButtons, { max: 4 }),
    showSubmitAnotherResponseButton: Boolean(page.showSubmitAnotherResponseButton),
    locked: page.pageKey === "generic_success"
  }));
  const customPages = mappedPages.filter((page) => page.pageKey === "generic_custom");
  const successPage = mappedPages.find((page) => page.pageKey === "generic_success");

  return [
    ...(customPages.length > 0 ? customPages : [createDefaultGenericPage()]),
    successPage
      ? {
          ...successPage,
          pageKey: "generic_success",
          fields: [],
          successButtons: normalizeButtons(successPage.successButtons, { max: 4 }),
          showSubmitAnotherResponseButton: Boolean(successPage.showSubmitAnotherResponseButton),
          locked: true
        }
      : createDefaultGenericSuccessPage()
  ];
}

function mapRegistrationPages(pages: Array<z.infer<typeof pageSchema>>): FormPage[] {
  const keyed = new Map<FormPageKey, z.infer<typeof pageSchema>>();
  for (const page of pages) {
    keyed.set(page.pageKey ?? "generic_custom", page);
  }

  const allFields = pages.flatMap((page) => page.fields ?? []).map((field) => normalizeField(field));
  const fixed = createDefaultRegistrationPages();

  return fixed.map((template) => {
    const existing = keyed.get(template.pageKey);
    return {
      ...template,
      id: existing?.id || template.id,
      title: existing?.title || template.title,
      description: existing?.description ?? template.description,
      fields: template.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions ? allFields : [],
      successButtons: template.pageKey === REGISTRATION_PAGE_KEYS.success ? normalizeButtons(existing?.successButtons, { max: 4 }) : [],
      showSubmitAnotherResponseButton:
        template.pageKey === REGISTRATION_PAGE_KEYS.success
          ? existing?.showSubmitAnotherResponseButton ?? template.showSubmitAnotherResponseButton
          : false
    };
  });
}

function filterAndMapRules(
  rules: Array<z.infer<typeof ruleSchema>>,
  pages: FormPage[]
): FormSchema["rules"] {
  const fieldNameSet = new Set(pages.flatMap((page) => page.fields.map((field) => field.name)));

  return rules
    .filter((rule) => fieldNameSet.has(rule.sourceFieldName) && fieldNameSet.has(rule.targetFieldName))
    .map((rule) => ({
      id: rule.id,
      sourceFieldName: rule.sourceFieldName,
      operator: rule.operator,
      value: rule.value ?? null,
      targetFieldName: rule.targetFieldName,
      effect: rule.effect
    }));
}

function parseV2Schema(value: unknown, fallbackName: string, formKind: FormKind): FormSchema | null {
  const parsed = formSchemaV2Validator.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const data = parsed.data;
  const normalizedPages = formKind === "program_registration" ? mapRegistrationPages(data.pages) : mapGenericPages(data.pages);

  return {
    version: 2,
    title: data.title || fallbackName,
    description: data.description ?? null,
    pages: normalizedPages,
    rules: filterAndMapRules(data.rules, normalizedPages)
  };
}

function parseLegacySchema(value: unknown, fallbackName: string, formKind: FormKind): FormSchema | null {
  const parsed = legacyFormSchemaValidator.safeParse(value);
  if (!parsed.success) {
    return null;
  }

  const data = parsed.data;

  if (formKind === "program_registration") {
    const middleFields = data.sections.flatMap((section) => (section.fields ?? []).map((field) => normalizeField({ ...field })));
    const pages = createDefaultRegistrationPages().map((page) =>
      page.pageKey === REGISTRATION_PAGE_KEYS.divisionQuestions
        ? {
            ...page,
            fields: middleFields
          }
        : page
    );

    return {
      version: 2,
      title: data.title || fallbackName,
      description: data.description ?? null,
      pages,
      rules: filterAndMapRules(data.rules, pages)
    };
  }

  const pages =
    data.sections.length > 0
      ? data.sections.map((section, index) => ({
          id: section.id,
          pageKey: "generic_custom" as const,
          title: section.title || `Page ${index + 1}`,
          description: section.description ?? null,
          fields: (section.fields ?? []).map((field) => normalizeField({ ...field })),
          successButtons: [],
          showSubmitAnotherResponseButton: false,
          locked: false
        }))
      : [createDefaultGenericPage()];

  const pagesWithSuccess = [
    ...pages,
    createDefaultGenericSuccessPage()
  ];

  return {
    version: 2,
    title: data.title || fallbackName,
    description: data.description ?? null,
    pages: pagesWithSuccess,
    rules: filterAndMapRules(data.rules, pagesWithSuccess)
  };
}

export function parseFormSchema(value: unknown, fallbackName = "Form", formKind: FormKind = "generic"): FormSchema {
  return parseV2Schema(value, fallbackName, formKind) ?? parseLegacySchema(value, fallbackName, formKind) ?? createDefaultFormSchema(fallbackName, formKind);
}

export function parseFormSchemaJson(
  rawJson: string,
  fallbackName = "Form",
  formKind: FormKind = "generic"
): { schema: FormSchema; error: string | null } {
  const trimmed = rawJson.trim();
  if (!trimmed) {
    return {
      schema: createDefaultFormSchema(fallbackName, formKind),
      error: null
    };
  }

  try {
    const parsed = JSON.parse(trimmed);
    return {
      schema: parseFormSchema(parsed, fallbackName, formKind),
      error: null
    };
  } catch {
    return {
      schema: createDefaultFormSchema(fallbackName, formKind),
      error: "Invalid schema JSON."
    };
  }
}
