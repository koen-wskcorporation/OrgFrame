"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServer } from "@/lib/supabase/server";
import { createOptionalSupabaseServiceRoleClient } from "@/lib/supabase/service-role";
import { rethrowIfNavigationError } from "@/lib/actions/rethrowIfNavigationError";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { getOrgAuthContext } from "@/lib/org/getOrgAuthContext";
import { getOrgPublicContext } from "@/lib/org/getOrgPublicContext";
import { can } from "@/lib/permissions/can";
import { requireOrgPermission } from "@/lib/permissions/requireOrgPermission";
import { isAdminLikeRole } from "@/modules/core/access";
import { parseFormSchemaJson } from "@/modules/forms/schema";
import {
  createFormSubmissionViewRecord,
  createFormRecord,
  deleteFormSubmissionRecord,
  deleteFormSubmissionViewRecord,
  getFormById,
  getFormBySlug,
  getLatestFormVersion,
  listFormSubmissionViews,
  listFormSubmissions,
  listFormSubmissionsWithEntries,
  listFormsForManage,
  listPublishedFormsForProgram,
  publishFormVersionRecord,
  setFormSubmissionStatus,
  updateFormSubmissionViewConfigRecord,
  updateFormSubmissionViewRecord,
  updateFormSubmissionViewsOrderRecord,
  updateFormSubmissionAnswersJson,
  updateFormSubmissionEntryAnswersJson,
  updateFormRecord
} from "@/modules/forms/db/queries";
import type { RegistrationPlayerEntryInput, SubmissionStatus } from "@/modules/forms/types";
import { getProgramById } from "@/modules/programs/db/queries";

const textSchema = z.string().trim();
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const createFormSchema = z.object({
  orgSlug: textSchema.min(1),
  slug: slugSchema,
  name: textSchema.min(2).max(120),
  description: textSchema.max(2000).optional(),
  formKind: z.enum(["generic", "program_registration"]),
  status: z.enum(["draft", "published", "archived"]),
  programId: z.string().uuid().nullable().optional(),
  targetMode: z.enum(["locked", "choice"]),
  lockedProgramNodeId: z.string().uuid().nullable().optional(),
  allowMultiplePlayers: z.boolean().optional(),
  requireSignIn: z.boolean().optional()
});

const saveFormDraftSchema = createFormSchema.extend({
  formId: z.string().uuid(),
  schemaJson: z.string().trim().min(1)
});

const publishFormSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid()
});

const submissionStatusSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  submissionId: z.string().uuid(),
  status: z.enum(["submitted", "in_review", "approved", "rejected", "waitlisted", "cancelled"] satisfies SubmissionStatus[])
});

const deleteSubmissionSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  submissionId: z.string().uuid()
});

const submitFormSchema = z.object({
  orgSlug: textSchema.min(1),
  formSlug: slugSchema,
  answers: z.record(z.string(), z.unknown()).optional(),
  playerEntries: z
    .array(
      z.object({
        playerId: z.string().uuid(),
        programNodeId: z.string().uuid().nullable().optional(),
        answers: z.record(z.string(), z.unknown()).optional()
      })
    )
    .optional()
    .default([]),
  metadata: z.record(z.string(), z.unknown()).optional()
});

const formSharingSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid()
});

const addFormToPageSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  pageId: z.string().uuid()
});

const updateSubmissionAnswerSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  submissionId: z.string().uuid(),
  submissionEntryId: z.string().uuid().optional(),
  fieldName: z.string().trim().min(1).max(64),
  value: z.unknown()
});

const submissionViewConfigSchema = z.object({
  visibleColumnKeys: z.array(z.string().trim().min(1)).optional().default([]),
  columnOrderKeys: z.array(z.string().trim().min(1)).optional().default([]),
  pinnedLeftColumnKeys: z.array(z.string().trim().min(1)).optional().default([]),
  pinnedRightColumnKeys: z.array(z.string().trim().min(1)).optional().default([]),
  columnWidthsByKey: z.record(z.string().trim().min(1), z.number().finite().positive()).optional().default({}),
  sort: z
    .object({
      columnKey: z.string().trim().min(1).nullable(),
      direction: z.enum(["asc", "desc"]).default("asc")
    })
    .optional(),
  searchQuery: z.string().optional().default("")
});

const createSubmissionViewSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  name: textSchema.min(1).max(80),
  visibilityScope: z.enum(["private", "forms_readers", "specific_admin"]),
  targetUserId: z.string().uuid().nullable().optional(),
  config: submissionViewConfigSchema
});

const updateSubmissionViewLayoutSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  viewId: z.string().uuid(),
  visibleColumnKeys: z.array(z.string().trim().min(1)).default([]),
  columnOrderKeys: z.array(z.string().trim().min(1)).default([]),
  pinnedLeftColumnKeys: z.array(z.string().trim().min(1)).default([]),
  pinnedRightColumnKeys: z.array(z.string().trim().min(1)).default([]),
  columnWidthsByKey: z.record(z.string().trim().min(1), z.number().finite().positive()).default({})
});

const updateSubmissionViewSettingsSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  viewId: z.string().uuid(),
  name: textSchema.min(1).max(80),
  visibilityScope: z.enum(["private", "forms_readers", "specific_admin"]),
  targetUserId: z.string().uuid().nullable().optional()
});

const deleteSubmissionViewSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  viewId: z.string().uuid()
});

const reorderSubmissionViewsSchema = z.object({
  orgSlug: textSchema.min(1),
  formId: z.string().uuid(),
  viewOrder: z.array(z.string().uuid()).min(1)
});

export type FormsActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): FormsActionResult<never> {
  return {
    ok: false,
    error
  };
}

function normalizeOptional(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

function normalizePlayerEntries(entries: z.infer<typeof submitFormSchema>["playerEntries"]): RegistrationPlayerEntryInput[] {
  return entries.map((entry) => ({
    playerId: entry.playerId,
    programNodeId: entry.programNodeId ?? null,
    answers: entry.answers ?? {}
  }));
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

function isIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [yearRaw, monthRaw, dayRaw] = value.split("-");
  const year = Number.parseInt(yearRaw ?? "", 10);
  const month = Number.parseInt(monthRaw ?? "", 10);
  const day = Number.parseInt(dayRaw ?? "", 10);

  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return false;
  }

  const next = new Date(year, month - 1, day);
  return next.getFullYear() === year && next.getMonth() === month - 1 && next.getDate() === day;
}

async function getRegistrationFormNameAndValidateLink(params: { orgId: string; formId?: string; programId: string }) {
  const program = await getProgramById(params.orgId, params.programId);
  if (!program) {
    return {
      ok: false as const,
      error: "Program not found."
    };
  }

  const forms = await listFormsForManage(params.orgId);
  const existingLinkedForm = forms.find((form) => form.programId === params.programId && form.id !== params.formId);
  if (existingLinkedForm) {
    return {
      ok: false as const,
      error: "This program already has a linked form."
    };
  }

  return {
    ok: true as const,
    name: `${program.name} Registration`
  };
}

async function requireFormsReadOrWrite(orgSlug: string) {
  const orgContext = await getOrgAuthContext(orgSlug);
  const hasAccess = can(orgContext.membershipPermissions, "forms.read") || can(orgContext.membershipPermissions, "forms.write");

  if (!hasAccess) {
    throw new Error("FORBIDDEN");
  }

  return orgContext;
}

export async function getFormsManagePageData(orgSlug: string) {
  const org = await requireFormsReadOrWrite(orgSlug);
  const forms = await listFormsForManage(org.orgId);

  return {
    org,
    forms
  };
}

export async function getFormManageDetail(orgSlug: string, formId: string) {
  const org = await requireFormsReadOrWrite(orgSlug);
  const form = await getFormById(org.orgId, formId);

  if (!form) {
    return null;
  }

  const latestVersion = await getLatestFormVersion(form.id);

  return {
    org,
    form,
    latestVersion
  };
}

export async function createFormAction(input: z.input<typeof createFormSchema>): Promise<FormsActionResult<{ formId: string }>> {
  const parsed = createFormSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please fill in the required form fields.");
  }

  try {
    const payload = parsed.data;
    const org = await requireFormsReadOrWrite(payload.orgSlug);
    let resolvedName = payload.name;
    const resolvedRequireSignIn = payload.requireSignIn ?? true;

    if (payload.formKind === "program_registration") {
      if (!payload.programId) {
        return asError("Program registration forms require a program.");
      }

      const result = await getRegistrationFormNameAndValidateLink({
        orgId: org.orgId,
        programId: payload.programId
      });

      if (!result.ok) {
        return asError(result.error);
      }

      resolvedName = result.name;
    }

    const created = await createFormRecord({
      orgId: org.orgId,
      createdByUserId: org.userId,
      slug: payload.slug,
      name: resolvedName,
      description: normalizeOptional(payload.description),
      formKind: payload.formKind,
      status: payload.status,
      programId: payload.programId ?? null,
      targetMode: payload.targetMode,
      lockedProgramNodeId: payload.lockedProgramNodeId ?? null,
      settingsJson: {
        allowMultiplePlayers: payload.allowMultiplePlayers ?? false,
        requireSignIn: resolvedRequireSignIn
      }
    });

    if (payload.status === "published") {
      await publishFormVersionRecord({
        orgId: org.orgId,
        formId: created.id,
        createdByUserId: org.userId,
        snapshotJson: {
          schema: created.schemaJson,
          ui: created.uiJson,
          settings: created.settingsJson
        }
      });
    }

    revalidatePath(`/${org.orgSlug}/tools/forms`);

    return {
      ok: true,
      data: {
        formId: created.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create this form right now.");
  }
}

export async function saveFormDraftAction(input: z.input<typeof saveFormDraftSchema>): Promise<FormsActionResult<{ formId: string }>> {
  const parsed = saveFormDraftSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review the form details.");
  }

  const payload = parsed.data;
  let resolvedName = payload.name;
  const resolvedRequireSignIn = payload.requireSignIn ?? true;

  try {
    const org = await requireOrgPermission(payload.orgSlug, "forms.write");

    if (payload.formKind === "program_registration") {
      if (!payload.programId) {
        return asError("Program registration forms require a program.");
      }

      const result = await getRegistrationFormNameAndValidateLink({
        orgId: org.orgId,
        formId: payload.formId,
        programId: payload.programId
      });

      if (!result.ok) {
        return asError(result.error);
      }

      resolvedName = result.name;
    }

    const parsedSchema = parseFormSchemaJson(payload.schemaJson, resolvedName, payload.formKind);
    if (parsedSchema.error) {
      return asError(parsedSchema.error);
    }

    const updated = await updateFormRecord({
      orgId: org.orgId,
      formId: payload.formId,
      slug: payload.slug,
      name: resolvedName,
      description: normalizeOptional(payload.description),
      formKind: payload.formKind,
      status: payload.status,
      programId: payload.programId ?? null,
      targetMode: payload.targetMode,
      lockedProgramNodeId: payload.lockedProgramNodeId ?? null,
      schemaJson: parsedSchema.schema,
      settingsJson: {
        allowMultiplePlayers: payload.allowMultiplePlayers ?? false,
        requireSignIn: resolvedRequireSignIn
      }
    });

    revalidatePath(`/${org.orgSlug}/tools/forms`);
    revalidatePath(`/${org.orgSlug}/tools/forms/${updated.id}/editor`);

    return {
      ok: true,
      data: {
        formId: updated.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save this form right now.");
  }
}

export async function publishFormVersionAction(input: z.input<typeof publishFormSchema>): Promise<FormsActionResult<{ formId: string; versionId: string }>> {
  const parsed = publishFormSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid publish request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "forms.write");
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    const version = await publishFormVersionRecord({
      orgId: org.orgId,
      formId: form.id,
      createdByUserId: org.userId,
      snapshotJson: {
        schema: form.schemaJson,
        ui: form.uiJson,
        settings: form.settingsJson
      }
    });

    await updateFormRecord({
      orgId: org.orgId,
      formId: form.id,
      slug: form.slug,
      name: form.name,
      description: form.description,
      formKind: form.formKind,
      status: "published",
      programId: form.programId,
      targetMode: form.targetMode,
      lockedProgramNodeId: form.lockedProgramNodeId,
      schemaJson: form.schemaJson,
      settingsJson: form.settingsJson
    });

    revalidatePath(`/${org.orgSlug}/tools/forms`);
    revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/editor`);
    revalidatePath(`/${org.orgSlug}/register/${form.slug}`);

    return {
      ok: true,
      data: {
        formId: form.id,
        versionId: version.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to publish this form right now.");
  }
}

export async function listFormSubmissionsAction(input: { orgSlug: string; formId: string }): Promise<FormsActionResult<{ submissions: Awaited<ReturnType<typeof listFormSubmissions>> }>> {
  try {
    const org = await requireFormsReadOrWrite(input.orgSlug);
    const submissions = await listFormSubmissions(org.orgId, input.formId);

    return {
      ok: true,
      data: {
        submissions
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load form submissions.");
  }
}

export async function setSubmissionStatusAction(input: z.input<typeof submissionStatusSchema>): Promise<FormsActionResult<{ submissionId: string }>> {
  const parsed = submissionStatusSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid status update.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "forms.write");
    const updated = await setFormSubmissionStatus({
      orgId: org.orgId,
      submissionId: payload.submissionId,
      status: payload.status
    });

    revalidatePath(`/${org.orgSlug}/tools/forms/${payload.formId}/submissions`);

    return {
      ok: true,
      data: {
        submissionId: updated.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update submission status right now.");
  }
}

export async function deleteFormSubmissionAction(
  input: z.input<typeof deleteSubmissionSchema>
): Promise<FormsActionResult<{ submissionId: string }>> {
  const parsed = deleteSubmissionSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "forms.write");
    const deleted = await deleteFormSubmissionRecord({
      orgId: org.orgId,
      formId: payload.formId,
      submissionId: payload.submissionId
    });

    if (!deleted) {
      return asError("Submission not found.");
    }

    revalidatePath(`/${org.orgSlug}/tools/forms/${payload.formId}/submissions`);
    return {
      ok: true,
      data: {
        submissionId: payload.submissionId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this submission right now.");
  }
}

export async function updateSubmissionAnswerAction(
  input: z.input<typeof updateSubmissionAnswerSchema>
): Promise<FormsActionResult<{ submissionId: string; submissionEntryId?: string; fieldName: string; value: unknown }>> {
  const parsed = updateSubmissionAnswerSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid answer update.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "forms.write");
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    const field = form.schemaJson.pages.flatMap((page) => page.fields).find((item) => item.name === payload.fieldName || item.id === payload.fieldName);

    if (!field) {
      return asError("Field not found on this form.");
    }

    const submissions = await listFormSubmissionsWithEntries(org.orgId, form.id);
    const submission = submissions.find((item) => item.id === payload.submissionId);

    if (!submission) {
      return asError("Submission not found.");
    }

    let normalizedValue: unknown = payload.value;

    if (field.type === "checkbox") {
      normalizedValue = Boolean(payload.value);
    } else if (field.type === "number") {
      const raw = typeof payload.value === "number" ? payload.value : Number.parseFloat(String(payload.value ?? "").trim());
      if (!Number.isFinite(raw)) {
        return asError(`${field.label} must be a valid number.`);
      }
      normalizedValue = raw;
    } else if (field.type === "date") {
      const raw = String(payload.value ?? "").trim();
      if (raw.length === 0) {
        normalizedValue = "";
      } else if (!isIsoDate(raw)) {
        return asError(`${field.label} must use YYYY-MM-DD format.`);
      } else {
        normalizedValue = raw;
      }
    } else if (field.type === "phone") {
      const raw = formatPhoneNumberInput(String(payload.value ?? ""));
      const digits = digitsOnly(raw);
      if (raw.length > 0 && digits.length !== 10) {
        return asError(`${field.label} must be a valid phone number.`);
      }
      normalizedValue = raw;
    } else if (field.type === "email") {
      const raw = String(payload.value ?? "").trim().toLowerCase();
      if (raw.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
        return asError(`${field.label} must be a valid email.`);
      }
      normalizedValue = raw;
    } else if (field.type === "select") {
      const raw = String(payload.value ?? "").trim();
      if (raw.length > 0 && !field.options.some((option) => option.value === raw)) {
        return asError(`${field.label} must match a defined option.`);
      }
      normalizedValue = raw;
    } else {
      normalizedValue = String(payload.value ?? "");
    }

    const targetKey = field.name;
    if (payload.submissionEntryId) {
      const entry = submission.entries.find((item) => item.id === payload.submissionEntryId);
      if (!entry) {
        return asError("Submission entry not found.");
      }

      const nextAnswers = { ...entry.answersJson };
      if (normalizedValue === "" || normalizedValue === null || normalizedValue === undefined) {
        delete nextAnswers[targetKey];
      } else {
        nextAnswers[targetKey] = normalizedValue;
      }

      await updateFormSubmissionEntryAnswersJson({
        submissionEntryId: entry.id,
        answersJson: nextAnswers
      });

      revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/submissions`);
      return {
        ok: true,
        data: {
          submissionId: submission.id,
          submissionEntryId: entry.id,
          fieldName: targetKey,
          value: normalizedValue
        }
      };
    }

    const nextAnswers = { ...submission.answersJson };
    if (normalizedValue === "" || normalizedValue === null || normalizedValue === undefined) {
      delete nextAnswers[targetKey];
    } else {
      nextAnswers[targetKey] = normalizedValue;
    }

    await updateFormSubmissionAnswersJson({
      orgId: org.orgId,
      submissionId: submission.id,
      answersJson: nextAnswers
    });

    revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/submissions`);
    return {
      ok: true,
      data: {
        submissionId: submission.id,
        fieldName: targetKey,
        value: normalizedValue
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update this answer right now.");
  }
}

export async function submitFormResponseAction(input: z.input<typeof submitFormSchema>): Promise<FormsActionResult<{ submissionId: string; status: string }>> {
  const parsed = submitFormSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please complete required registration fields.");
  }

  try {
    const payload = parsed.data;
    const org = await getOrgPublicContext(payload.orgSlug);
    const form = await getFormBySlug(org.orgId, payload.formSlug, {
      includeDraft: false
    });

    if (!form) {
      return asError("Form not found.");
    }

    const user = await getSessionUser();
    const requireSignIn = form.settingsJson.requireSignIn !== false;

    if (requireSignIn && !user) {
      return asError("Please sign in to submit this form.");
    }

    const supabase = await createSupabaseServer();

    const { data, error } = await supabase.rpc("submit_form_response", {
      input_org_slug: payload.orgSlug,
      input_form_slug: payload.formSlug,
      input_answers: payload.answers ?? {},
      input_player_entries: normalizePlayerEntries(payload.playerEntries),
      input_metadata: payload.metadata ?? {}
    });

    if (error) {
      if (error.message.includes("AUTH_REQUIRED")) {
        return asError("Please sign in to submit this form.");
      }

      throw new Error(error.message);
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row || typeof row.submission_id !== "string") {
      return asError("Registration did not complete. Please try again.");
    }

    revalidatePath(`/${payload.orgSlug}/register/${payload.formSlug}`);

    return {
      ok: true,
      data: {
        submissionId: row.submission_id,
        status: typeof row.status === "string" ? row.status : "submitted"
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to submit this registration right now.");
  }
}

export async function getPublicRegistrationForm(orgSlug: string, formSlug: string) {
  const org = await getOrgPublicContext(orgSlug);
  const form = await getFormBySlug(org.orgId, formSlug, {
    includeDraft: false
  });

  return {
    org,
    form
  };
}

export async function getPublishedFormsForProgram(orgSlug: string, programId: string) {
  const org = await getOrgPublicContext(orgSlug);
  return listPublishedFormsForProgram(org.orgId, programId);
}

export type FormSubmissionViewAdminAccount = {
  userId: string;
  label: string;
  email: string | null;
};

export type FormSubmissionViewsData = {
  views: Awaited<ReturnType<typeof listFormSubmissionViews>>;
  adminAccounts: FormSubmissionViewAdminAccount[];
};

export async function getFormSubmissionViewsDataAction(
  input: z.input<typeof formSharingSchema>
): Promise<FormsActionResult<FormSubmissionViewsData>> {
  const parsed = formSharingSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid submissions view request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireFormsReadOrWrite(payload.orgSlug);
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    const [rawViews, membershipsResult] = await Promise.all([
      listFormSubmissionViews(org.orgId, form.id),
      createSupabaseServer().then((supabase) =>
        supabase
          .from("org_memberships")
          .select("user_id, role")
          .eq("org_id", org.orgId)
      )
    ]);

    if (membershipsResult.error) {
      throw new Error(membershipsResult.error.message);
    }

    const views =
      rawViews.length > 0
        ? rawViews
        : [
            await createFormSubmissionViewRecord({
              orgId: org.orgId,
              formId: form.id,
              name: "Default",
              sortIndex: 0,
              visibilityScope: "private",
              targetUserId: null,
              configJson: {},
              createdByUserId: org.userId
            })
          ];

    const adminUserIds = Array.from(
      new Set(
        (membershipsResult.data ?? [])
          .filter((membership) => isAdminLikeRole(String(membership.role ?? "")))
          .map((membership) => String(membership.user_id ?? ""))
          .filter((value) => value.length > 0)
      )
    );

    const supabase = await createSupabaseServer();
    const { data: profileRows, error: profileError } = await supabase
      .from("user_profiles")
      .select("user_id, first_name, last_name")
      .in("user_id", adminUserIds);

    if (profileError) {
      throw new Error(profileError.message);
    }

    const profileById = new Map<string, { firstName: string | null; lastName: string | null }>(
      (profileRows ?? []).map((row) => [
        String(row.user_id),
        {
          firstName: typeof row.first_name === "string" ? row.first_name : null,
          lastName: typeof row.last_name === "string" ? row.last_name : null
        }
      ])
    );

    const emailByUserId = new Map<string, string>();
    const serviceRole = createOptionalSupabaseServiceRoleClient();
    if (serviceRole) {
      await Promise.all(
        adminUserIds.map(async (userId) => {
          const { data: userData, error: userError } = await serviceRole.auth.admin.getUserById(userId);
          if (userError) {
            return;
          }

          const email = userData.user?.email?.trim().toLowerCase();
          if (email) {
            emailByUserId.set(userId, email);
          }
        })
      );
    }

    const adminAccounts = adminUserIds.map((userId) => {
      const profile = profileById.get(userId);
      const email = emailByUserId.get(userId) ?? null;
      const fullName = `${profile?.firstName ?? ""} ${profile?.lastName ?? ""}`.trim();
      const label = fullName.length > 0 ? fullName : email ?? `Admin ${userId.slice(0, 8)}`;

      return {
        userId,
        label,
        email
      };
    });

    return {
      ok: true,
      data: {
        views,
        adminAccounts
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load saved views right now.");
  }
}

export async function createFormSubmissionViewAction(
  input: z.input<typeof createSubmissionViewSchema>
): Promise<FormsActionResult<{ view: Awaited<ReturnType<typeof createFormSubmissionViewRecord>> }>> {
  const parsed = createSubmissionViewSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Please review your view settings.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "forms.write");
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    if (payload.visibilityScope === "specific_admin" && !payload.targetUserId) {
      return asError("Please select an admin account.");
    }

    if (payload.visibilityScope !== "specific_admin" && payload.targetUserId) {
      return asError("Target admin can only be set for specific-admin visibility.");
    }

    if (payload.visibilityScope === "specific_admin" && payload.targetUserId) {
      const supabase = await createSupabaseServer();
      const { data: membershipRow, error: membershipError } = await supabase
        .from("org_memberships")
        .select("role")
        .eq("org_id", org.orgId)
        .eq("user_id", payload.targetUserId)
        .maybeSingle();

      if (membershipError) {
        throw new Error(membershipError.message);
      }

      if (!membershipRow || !isAdminLikeRole(String(membershipRow.role ?? ""))) {
        return asError("Selected account must be an org admin.");
      }
    }

    const existingViews = await listFormSubmissionViews(org.orgId, form.id);
    const nextSortIndex =
      existingViews.length === 0 ? 0 : Math.max(...existingViews.map((view) => view.sortIndex)) + 1;

    const view = await createFormSubmissionViewRecord({
      orgId: org.orgId,
      formId: form.id,
      name: payload.name,
      sortIndex: nextSortIndex,
      visibilityScope: payload.visibilityScope,
      targetUserId: payload.visibilityScope === "specific_admin" ? payload.targetUserId ?? null : null,
      configJson: {
        visibleColumnKeys: payload.config.visibleColumnKeys,
        columnOrderKeys: payload.config.columnOrderKeys,
        pinnedLeftColumnKeys: payload.config.pinnedLeftColumnKeys,
        pinnedRightColumnKeys: payload.config.pinnedRightColumnKeys,
        columnWidthsByKey: payload.config.columnWidthsByKey,
        sort: payload.config.sort ?? null,
        searchQuery: payload.config.searchQuery ?? ""
      },
      createdByUserId: org.userId
    });

    revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/submissions`);

    return {
      ok: true,
      data: {
        view
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save this view right now.");
  }
}

export async function updateFormSubmissionViewLayoutAction(
  input: z.input<typeof updateSubmissionViewLayoutSchema>
): Promise<FormsActionResult<{ view: Awaited<ReturnType<typeof updateFormSubmissionViewConfigRecord>> }>> {
  const parsed = updateSubmissionViewLayoutSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid view layout update.");
  }

  try {
    const payload = parsed.data;
    const org = await requireFormsReadOrWrite(payload.orgSlug);
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    const existingViews = await listFormSubmissionViews(org.orgId, form.id);
    const targetView = existingViews.find((view) => view.id === payload.viewId);
    if (!targetView) {
      return asError("View not found.");
    }

    const nextView = await updateFormSubmissionViewConfigRecord({
      orgId: org.orgId,
      formId: form.id,
      viewId: targetView.id,
      configJson: {
        ...targetView.configJson,
        visibleColumnKeys: payload.visibleColumnKeys,
        columnOrderKeys: payload.columnOrderKeys,
        pinnedLeftColumnKeys: payload.pinnedLeftColumnKeys,
        pinnedRightColumnKeys: payload.pinnedRightColumnKeys,
        columnWidthsByKey: payload.columnWidthsByKey
      }
    });

    revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/submissions`);

    return {
      ok: true,
      data: {
        view: nextView
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to save view layout right now.");
  }
}

export async function updateFormSubmissionViewSettingsAction(
  input: z.input<typeof updateSubmissionViewSettingsSchema>
): Promise<FormsActionResult<{ view: Awaited<ReturnType<typeof updateFormSubmissionViewRecord>> }>> {
  const parsed = updateSubmissionViewSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid view settings update.");
  }

  try {
    const payload = parsed.data;
    const org = await requireFormsReadOrWrite(payload.orgSlug);
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    if (payload.visibilityScope === "specific_admin" && !payload.targetUserId) {
      return asError("Please select an admin account.");
    }

    if (payload.visibilityScope !== "specific_admin" && payload.targetUserId) {
      return asError("Target admin can only be set for specific-admin visibility.");
    }

    if (payload.visibilityScope === "specific_admin" && payload.targetUserId) {
      const supabase = await createSupabaseServer();
      const { data: membershipRow, error: membershipError } = await supabase
        .from("org_memberships")
        .select("role")
        .eq("org_id", org.orgId)
        .eq("user_id", payload.targetUserId)
        .maybeSingle();

      if (membershipError) {
        throw new Error(membershipError.message);
      }

      if (!membershipRow || !isAdminLikeRole(String(membershipRow.role ?? ""))) {
        return asError("Selected account must be an org admin.");
      }
    }

    const view = await updateFormSubmissionViewRecord({
      orgId: org.orgId,
      formId: form.id,
      viewId: payload.viewId,
      name: payload.name,
      visibilityScope: payload.visibilityScope,
      targetUserId: payload.visibilityScope === "specific_admin" ? payload.targetUserId ?? null : null
    });

    revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/submissions`);
    return {
      ok: true,
      data: {
        view
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to update view settings right now.");
  }
}

export async function deleteFormSubmissionViewAction(
  input: z.input<typeof deleteSubmissionViewSchema>
): Promise<FormsActionResult<{ viewId: string }>> {
  const parsed = deleteSubmissionViewSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid delete request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireFormsReadOrWrite(payload.orgSlug);
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    const views = await listFormSubmissionViews(org.orgId, form.id);
    if (views.length <= 1) {
      return asError("At least one view is required.");
    }

    const exists = views.some((view) => view.id === payload.viewId);
    if (!exists) {
      return asError("View not found.");
    }

    await deleteFormSubmissionViewRecord({
      orgId: org.orgId,
      formId: form.id,
      viewId: payload.viewId
    });

    revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/submissions`);
    return {
      ok: true,
      data: {
        viewId: payload.viewId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to delete this view right now.");
  }
}

export async function reorderFormSubmissionViewsAction(
  input: z.input<typeof reorderSubmissionViewsSchema>
): Promise<FormsActionResult<{ orderedViewIds: string[] }>> {
  const parsed = reorderSubmissionViewsSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid view order.");
  }

  try {
    const payload = parsed.data;
    const org = await requireFormsReadOrWrite(payload.orgSlug);
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    const views = await listFormSubmissionViews(org.orgId, form.id);
    if (views.length === 0) {
      return asError("No views found.");
    }

    const existingIds = new Set(views.map((view) => view.id));
    const nextIds = payload.viewOrder;
    if (nextIds.length !== views.length) {
      return asError("View order is incomplete.");
    }
    if (nextIds.some((id) => !existingIds.has(id))) {
      return asError("View order includes unknown views.");
    }

    await updateFormSubmissionViewsOrderRecord({
      orgId: org.orgId,
      formId: form.id,
      viewOrder: nextIds
    });

    revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/submissions`);
    return {
      ok: true,
      data: {
        orderedViewIds: nextIds
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to reorder views right now.");
  }
}

export type FormSharingPageItem = {
  id: string;
  title: string;
  slug: string;
  isPublished: boolean;
  includeCount: number;
};

export type FormSharingData = {
  formSlug: string;
  canWritePages: boolean;
  pages: FormSharingPageItem[];
};

export async function getFormSharingDataAction(input: z.input<typeof formSharingSchema>): Promise<FormsActionResult<FormSharingData>> {
  const parsed = formSharingSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid sharing request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireFormsReadOrWrite(payload.orgSlug);
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    const canWritePages = can(org.membershipPermissions, "org.pages.write");
    const canReadPages = canWritePages || can(org.membershipPermissions, "org.pages.read");

    if (!canReadPages) {
      return {
        ok: true,
        data: {
          formSlug: form.slug,
          canWritePages: false,
          pages: []
        }
      };
    }

    const supabase = await createSupabaseServer();
    const { data: pagesData, error: pagesError } = await supabase
      .from("org_pages")
      .select("id, slug, title, is_published, sort_index, created_at")
      .eq("org_id", org.orgId)
      .order("sort_index", { ascending: true })
      .order("created_at", { ascending: true });

    if (pagesError) {
      throw new Error(pagesError.message);
    }

    const pageRows = (pagesData ?? []).map((row) => ({
      id: String(row.id),
      slug: String(row.slug),
      title: String(row.title),
      isPublished: Boolean(row.is_published)
    }));

    if (pageRows.length === 0) {
      return {
        ok: true,
        data: {
          formSlug: form.slug,
          canWritePages,
          pages: []
        }
      };
    }

    const pageIds = pageRows.map((page) => page.id);
    const includeCountByPageId = new Map<string, number>();
    const { data: blocksData, error: blocksError } = await supabase
      .from("org_page_blocks")
      .select("org_page_id, config")
      .eq("type", "form_embed")
      .in("org_page_id", pageIds);

    if (blocksError) {
      throw new Error(blocksError.message);
    }

    (blocksData ?? []).forEach((row) => {
      const pageId = String(row.org_page_id ?? "");
      const configValue = row.config as { formId?: unknown } | null;
      const configFormId = typeof configValue?.formId === "string" ? configValue.formId : null;

      if (!pageId || configFormId !== form.id) {
        return;
      }

      includeCountByPageId.set(pageId, (includeCountByPageId.get(pageId) ?? 0) + 1);
    });

    return {
      ok: true,
      data: {
        formSlug: form.slug,
        canWritePages,
        pages: pageRows.map((page) => ({
          ...page,
          includeCount: includeCountByPageId.get(page.id) ?? 0
        }))
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load sharing details right now.");
  }
}

export async function addFormToPageAction(input: z.input<typeof addFormToPageSchema>): Promise<FormsActionResult<{ pageId: string }>> {
  const parsed = addFormToPageSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid page request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireOrgPermission(payload.orgSlug, "org.pages.write");
    const form = await getFormById(org.orgId, payload.formId);

    if (!form) {
      return asError("Form not found.");
    }

    const supabase = await createSupabaseServer();
    const { data: pageData, error: pageError } = await supabase
      .from("org_pages")
      .select("id, slug")
      .eq("org_id", org.orgId)
      .eq("id", payload.pageId)
      .maybeSingle();

    if (pageError) {
      throw new Error(pageError.message);
    }

    if (!pageData) {
      return asError("Page not found.");
    }

    const { data: existingBlocks, error: existingBlocksError } = await supabase
      .from("org_page_blocks")
      .select("id, config")
      .eq("org_page_id", payload.pageId)
      .eq("type", "form_embed");

    if (existingBlocksError) {
      throw new Error(existingBlocksError.message);
    }

    const alreadyIncluded = (existingBlocks ?? []).some((row) => {
      const configValue = row.config as { formId?: unknown } | null;
      return typeof configValue?.formId === "string" && configValue.formId === payload.formId;
    });

    if (alreadyIncluded) {
      return {
        ok: true,
        data: {
          pageId: payload.pageId
        }
      };
    }

    const { data: lastBlock, error: lastBlockError } = await supabase
      .from("org_page_blocks")
      .select("sort_index")
      .eq("org_page_id", payload.pageId)
      .order("sort_index", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastBlockError) {
      throw new Error(lastBlockError.message);
    }

    const nextSortIndex = typeof lastBlock?.sort_index === "number" ? lastBlock.sort_index + 1 : 0;
    const { error: insertError } = await supabase.from("org_page_blocks").insert({
      org_page_id: payload.pageId,
      type: "form_embed",
      sort_index: nextSortIndex,
      config: {
        title: form.name,
        body: "Complete the form below.",
        formId: form.id
      }
    });

    if (insertError) {
      throw new Error(insertError.message);
    }

    const pageSlug = String(pageData.slug);
    revalidatePath(`/${org.orgSlug}/tools/forms/${form.id}/editor`);
    revalidatePath(pageSlug === "home" ? `/${org.orgSlug}` : `/${org.orgSlug}/${pageSlug}`);

    return {
      ok: true,
      data: {
        pageId: payload.pageId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to add this form to that page right now.");
  }
}
