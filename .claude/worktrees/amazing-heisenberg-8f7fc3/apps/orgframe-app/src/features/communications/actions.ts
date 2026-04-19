"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { rethrowIfNavigationError } from "@/src/shared/navigation/rethrowIfNavigationError";
import { getOrgAuthContext } from "@/src/shared/org/getOrgAuthContext";
import { can } from "@/src/shared/permissions/can";
import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import { getInboxConversationDetail, listChannelIntegrations, listInboxConversations, searchCommContacts } from "@/src/features/communications/db/queries";
import {
  connectFacebookPageIntegration,
  disconnectChannelIntegration,
  createContactFromConversation,
  dismissConversationSuggestions,
  linkChannelIdentityToContact,
  mergeContacts,
  rejectSuggestion,
  rerunConversationSuggestions,
  unlinkChannelIdentityFromContact
} from "@/src/features/communications/service";
import type { InboxWorkspaceReadModel } from "@/src/features/communications/types";

const textSchema = z.string().trim();

const workspaceSchema = z.object({
  orgSlug: textSchema.min(1),
  conversationId: z.string().uuid().optional()
});

const resolveSchema = z.object({
  orgSlug: textSchema.min(1),
  conversationId: z.string().uuid(),
  contactId: z.string().uuid(),
  identityId: z.string().uuid(),
  source: z.enum(["manual", "suggestion"]) 
});

const createContactSchema = z.object({
  orgSlug: textSchema.min(1),
  conversationId: z.string().uuid(),
  displayName: textSchema.max(160).optional(),
  email: textSchema.max(240).optional(),
  phone: textSchema.max(80).optional(),
  notes: textSchema.max(2000).optional()
});

const dismissSuggestionsSchema = z.object({
  orgSlug: textSchema.min(1),
  conversationId: z.string().uuid()
});

const rerunSuggestionsSchema = dismissSuggestionsSchema;

const rejectSuggestionSchema = z.object({
  orgSlug: textSchema.min(1),
  conversationId: z.string().uuid(),
  suggestionId: z.string().uuid()
});

const unlinkIdentitySchema = z.object({
  orgSlug: textSchema.min(1),
  identityId: z.string().uuid()
});

const mergeSchema = z.object({
  orgSlug: textSchema.min(1),
  sourceContactId: z.string().uuid(),
  targetContactId: z.string().uuid(),
  displayName: textSchema.max(160).optional(),
  firstName: textSchema.max(120).optional(),
  lastName: textSchema.max(120).optional(),
  primaryEmail: textSchema.max(240).optional(),
  primaryPhone: textSchema.max(80).optional(),
  notes: textSchema.max(2000).optional()
});

const searchSchema = z.object({
  orgSlug: textSchema.min(1),
  query: textSchema.max(120).optional()
});

const connectionsSchema = z.object({
  orgSlug: textSchema.min(1)
});

const connectFacebookSchema = z.object({
  orgSlug: textSchema.min(1),
  pageId: textSchema.min(1).max(64),
  pageName: textSchema.max(180).optional(),
  pageAccessToken: textSchema.min(10).max(2048)
});

const disconnectIntegrationSchema = z.object({
  orgSlug: textSchema.min(1),
  integrationId: z.string().uuid()
});

export type CommunicationsActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

function asError(error: string): CommunicationsActionResult<never> {
  return {
    ok: false,
    error
  };
}

function normalizeOptional(value: string | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : null;
}

async function requireCommunicationsRead(orgSlug: string) {
  const org = await getOrgAuthContext(orgSlug);
  const hasRead = can(org.membershipPermissions, "communications.read") || can(org.membershipPermissions, "communications.write");

  if (!hasRead) {
    throw new Error("FORBIDDEN");
  }

  return org;
}

async function requireCommunicationsWrite(orgSlug: string) {
  const org = await getOrgAuthContext(orgSlug);
  const hasWrite = can(org.membershipPermissions, "communications.write");

  if (!hasWrite) {
    throw new Error("FORBIDDEN");
  }

  return org;
}

function revalidateInboxPaths(orgSlug: string) {
  revalidatePath(`/${orgSlug}/tools/inbox`);
  revalidatePath(`/${orgSlug}/tools/inbox`, "layout");
  revalidatePath(`/${orgSlug}/tools/inbox`);
  revalidatePath(`/${orgSlug}/tools/inbox`, "layout");
}

export async function getInboxWorkspaceDataAction(input: z.input<typeof workspaceSchema>): Promise<CommunicationsActionResult<InboxWorkspaceReadModel>> {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid inbox request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsRead(payload.orgSlug);
    const conversations = await listInboxConversations(org.orgId);

    const selectedConversationId = payload.conversationId ?? conversations[0]?.conversation.id;
    const selectedConversation = selectedConversationId ? await getInboxConversationDetail(org.orgId, selectedConversationId) : null;

    return {
      ok: true,
      data: {
        conversations,
        selectedConversation
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load inbox workspace.");
  }
}

export async function linkConversationIdentityAction(
  input: z.input<typeof resolveSchema>
): Promise<CommunicationsActionResult<{ conversationId: string; contactId: string }>> {
  const parsed = resolveSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid link request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    await linkChannelIdentityToContact({
      orgId: org.orgId,
      conversationId: payload.conversationId,
      identityId: payload.identityId,
      contactId: payload.contactId,
      actorUserId: org.userId,
      source: payload.source
    });

    revalidateInboxPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        conversationId: payload.conversationId,
        contactId: payload.contactId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to link this identity right now.");
  }
}

export async function createContactFromConversationAction(
  input: z.input<typeof createContactSchema>
): Promise<CommunicationsActionResult<{ conversationId: string; contactId: string }>> {
  const parsed = createContactSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid contact create request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    const contact = await createContactFromConversation({
      orgId: org.orgId,
      conversationId: payload.conversationId,
      actorUserId: org.userId,
      displayName: normalizeOptional(payload.displayName),
      email: normalizeOptional(payload.email),
      phone: normalizeOptional(payload.phone),
      notes: normalizeOptional(payload.notes)
    });

    revalidateInboxPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        conversationId: payload.conversationId,
        contactId: contact.id
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to create contact from this conversation.");
  }
}

export async function dismissConversationSuggestionsAction(
  input: z.input<typeof dismissSuggestionsSchema>
): Promise<CommunicationsActionResult<{ conversationId: string }>> {
  const parsed = dismissSuggestionsSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid dismiss request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    await dismissConversationSuggestions({
      orgId: org.orgId,
      conversationId: payload.conversationId,
      actorUserId: org.userId
    });

    revalidateInboxPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        conversationId: payload.conversationId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to dismiss suggestions right now.");
  }
}

export async function rerunConversationSuggestionsAction(
  input: z.input<typeof rerunSuggestionsSchema>
): Promise<CommunicationsActionResult<{ conversationId: string; suggestionCount: number }>> {
  const parsed = rerunSuggestionsSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid regenerate request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    const suggestions = await rerunConversationSuggestions({
      orgId: org.orgId,
      conversationId: payload.conversationId,
      actorUserId: org.userId
    });

    revalidateInboxPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        conversationId: payload.conversationId,
        suggestionCount: suggestions.length
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to regenerate suggestions.");
  }
}

export async function rejectSuggestionAction(
  input: z.input<typeof rejectSuggestionSchema>
): Promise<CommunicationsActionResult<{ conversationId: string; suggestionId: string }>> {
  const parsed = rejectSuggestionSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid reject request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    await rejectSuggestion({
      orgId: org.orgId,
      conversationId: payload.conversationId,
      suggestionId: payload.suggestionId,
      actorUserId: org.userId
    });

    revalidateInboxPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        conversationId: payload.conversationId,
        suggestionId: payload.suggestionId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to reject suggestion.");
  }
}

export async function unlinkChannelIdentityAction(
  input: z.input<typeof unlinkIdentitySchema>
): Promise<CommunicationsActionResult<{ identityId: string }>> {
  const parsed = unlinkIdentitySchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid unlink request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    await unlinkChannelIdentityFromContact({
      orgId: org.orgId,
      identityId: payload.identityId,
      actorUserId: org.userId
    });

    revalidateInboxPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        identityId: payload.identityId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to unlink this identity.");
  }
}

export async function mergeContactsAction(input: z.input<typeof mergeSchema>): Promise<CommunicationsActionResult<{ sourceContactId: string; targetContactId: string }>> {
  const parsed = mergeSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid merge request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    await mergeContacts({
      orgId: org.orgId,
      sourceContactId: payload.sourceContactId,
      targetContactId: payload.targetContactId,
      strategy: {
        displayName: normalizeOptional(payload.displayName),
        firstName: normalizeOptional(payload.firstName),
        lastName: normalizeOptional(payload.lastName),
        primaryEmail: normalizeOptional(payload.primaryEmail),
        primaryPhone: normalizeOptional(payload.primaryPhone),
        notes: normalizeOptional(payload.notes)
      }
    });

    revalidateInboxPaths(org.orgSlug);

    return {
      ok: true,
      data: {
        sourceContactId: payload.sourceContactId,
        targetContactId: payload.targetContactId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to merge contacts right now.");
  }
}

export async function searchInboxContactsAction(
  input: z.input<typeof searchSchema>
): Promise<CommunicationsActionResult<{ contacts: Awaited<ReturnType<typeof searchCommContacts>> }>> {
  const parsed = searchSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid contact search request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsRead(payload.orgSlug);
    const contacts = await searchCommContacts(org.orgId, payload.query ?? "", 25);

    return {
      ok: true,
      data: {
        contacts
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to search contacts.");
  }
}

export async function getInboxConnectionsDataAction(
  input: z.input<typeof connectionsSchema>
): Promise<CommunicationsActionResult<{ integrations: Awaited<ReturnType<typeof listChannelIntegrations>> }>> {
  const parsed = connectionsSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid connections request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsRead(payload.orgSlug);
    const serviceRoleClient = createOptionalSupabaseServiceRoleClient();
    const integrations = await listChannelIntegrations(org.orgId, "facebook_messenger", serviceRoleClient ?? undefined);

    return {
      ok: true,
      data: {
        integrations
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to load inbox connections.");
  }
}

export async function connectFacebookPageAction(
  input: z.input<typeof connectFacebookSchema>
): Promise<CommunicationsActionResult<{ integrationId: string; providerAccountId: string; providerAccountName: string | null; webhookSubscribed: boolean }>> {
  const parsed = connectFacebookSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid Facebook connection request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    const result = await connectFacebookPageIntegration({
      orgId: org.orgId,
      actorUserId: org.userId,
      pageId: payload.pageId,
      pageName: normalizeOptional(payload.pageName),
      pageAccessToken: payload.pageAccessToken
    });

    revalidateInboxPaths(org.orgSlug);
    revalidatePath(`/${org.orgSlug}/tools/inbox/connections`);
    revalidatePath(`/${org.orgSlug}/tools/inbox/connections`);

    return {
      ok: true,
      data: {
        integrationId: result.integrationId,
        providerAccountId: result.providerAccountId,
        providerAccountName: result.providerAccountName,
        webhookSubscribed: result.webhookSubscribed
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError(error instanceof Error ? error.message : "Unable to connect Facebook page.");
  }
}

export async function disconnectInboxIntegrationAction(
  input: z.input<typeof disconnectIntegrationSchema>
): Promise<CommunicationsActionResult<{ integrationId: string }>> {
  const parsed = disconnectIntegrationSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid disconnect request.");
  }

  try {
    const payload = parsed.data;
    const org = await requireCommunicationsWrite(payload.orgSlug);

    await disconnectChannelIntegration({
      orgId: org.orgId,
      integrationId: payload.integrationId,
      actorUserId: org.userId
    });

    revalidateInboxPaths(org.orgSlug);
    revalidatePath(`/${org.orgSlug}/tools/inbox/connections`);
    revalidatePath(`/${org.orgSlug}/tools/inbox/connections`);

    return {
      ok: true,
      data: {
        integrationId: payload.integrationId
      }
    };
  } catch (error) {
    rethrowIfNavigationError(error);
    return asError("Unable to disconnect integration.");
  }
}
