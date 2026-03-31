import type { SupabaseClient } from "@supabase/supabase-js";
import { createOptionalSupabaseServiceRoleClient } from "@/src/shared/data-api/server";
import {
  acceptPendingSuggestionsForConversationContact,
  createCommAuditLog,
  createCommContact,
  createConversation,
  createResolutionEvent,
  deleteChannelIntegrationSecret,
  expirePendingSuggestionsForConversation,
  findActiveChannelIntegrationByProviderAccount,
  findCommContactById,
  findConversationByExternalThread,
  findConversationById,
  getChannelIntegrationSecret,
  findIdentityById,
  findIdentityByExternal,
  listChannelIntegrations,
  findMostRecentConversationByIdentity,
  getConversationSuggestions,
  getIdentityByConversation,
  linkIdentityToContact,
  listMatchingContacts,
  mergeContactsViaRpc,
  markChannelIntegrationDisconnected,
  rejectAllOtherPendingSuggestions,
  replaceConversationSuggestions,
  setSuggestionStatus,
  unlinkIdentity,
  upsertChannelIntegration,
  upsertChannelIntegrationSecret,
  updateChannelIntegrationSyncState,
  updateConversation,
  updateConversationsForIdentity,
  upsertIdentity,
  upsertInboundMessage
} from "@/src/features/communications/db/queries";
import { decryptAccessToken, encryptAccessToken, maskToken } from "@/src/features/communications/integrations/credentials";
import { fetchFacebookMessengerUserName, subscribeFacebookPageWebhook, verifyFacebookPageAccessToken } from "@/src/features/communications/integrations/facebook";
import { normalizeDisplayName, normalizeEmail, normalizePhone, splitName } from "@/src/features/communications/normalization";
import { defaultMatchScoringConfig, pickAutoLinkCandidate, rankContactCandidates } from "@/src/features/communications/scoring";
import type {
  CommContact,
  CommDirection,
  CommSuggestionWithContact,
  ContactMatchReasonCode,
  InboundIdentityHints,
  InboundIngressPayload
} from "@/src/features/communications/types";

const DEFAULT_MAX_SUGGESTIONS = 5;

function uniqueByContactId(candidates: ReturnType<typeof rankContactCandidates>) {
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    if (seen.has(candidate.contact.id)) {
      return false;
    }
    seen.add(candidate.contact.id);
    return true;
  });
}

async function buildSuggestions(input: {
  orgId: string;
  hints: InboundIdentityHints;
  identityNormalizedValue: string | null;
  client?: SupabaseClient<any>;
}) {
  const contacts = await listMatchingContacts({
    orgId: input.orgId,
    authUserId: input.hints.authUserId ?? null,
    normalizedEmail: normalizeEmail(input.hints.email),
    normalizedPhone: normalizePhone(input.hints.phone),
    displayName: normalizeDisplayName(input.hints.displayName),
    client: input.client
  });

  const ranked = uniqueByContactId(
    rankContactCandidates({
      contacts,
      hints: input.hints,
      identityNormalizedValue: input.identityNormalizedValue
    })
  );

  return ranked.slice(0, DEFAULT_MAX_SUGGESTIONS);
}

function resolveStatus(input: {
  resolvedContactId: string | null;
  suggestionsCount: number;
}) {
  if (input.resolvedContactId) {
    return "resolved" as const;
  }

  if (input.suggestionsCount > 0) {
    return "suggested" as const;
  }

  return "unresolved" as const;
}

export async function resolveInboundIdentity(input: InboundIngressPayload & { client?: SupabaseClient<any> }) {
  const normalizedIdentityValue = input.identityNormalizedValue ?? normalizeEmail(input.hints.email) ?? normalizePhone(input.hints.phone);

  let identity =
    (await findIdentityByExternal({
      orgId: input.orgId,
      channelType: input.channelType,
      externalId: input.externalIdentityId,
      client: input.client
    })) ??
    (await upsertIdentity({
      orgId: input.orgId,
      channelType: input.channelType,
      externalId: input.externalIdentityId,
      externalUsername: input.identityExternalUsername,
      normalizedValue: normalizedIdentityValue,
      displayLabel: input.identityDisplayLabel,
      isVerified: input.identityIsVerified,
      identityMetadata: input.identityMetadata,
      client: input.client
    }));

  let resolvedContact: CommContact | null = null;
  let suggestions = await buildSuggestions({
    orgId: input.orgId,
    hints: input.hints,
    identityNormalizedValue: normalizedIdentityValue,
    client: input.client
  });

  if (identity.contactId) {
    resolvedContact = await findCommContactById(input.orgId, identity.contactId, input.client);
  }

  if (!resolvedContact) {
    const autoCandidate = pickAutoLinkCandidate(suggestions, defaultMatchScoringConfig);
    if (autoCandidate) {
      identity = await linkIdentityToContact({
        orgId: input.orgId,
        identityId: identity.id,
        contactId: autoCandidate.contact.id,
        client: input.client
      });
      resolvedContact = autoCandidate.contact;
      suggestions = [];
    }
  }

  let conversation =
    (input.externalThreadId
      ? await findConversationByExternalThread({
          orgId: input.orgId,
          channelType: input.channelType,
          externalThreadId: input.externalThreadId,
          client: input.client
        })
      : null) ??
    (await findMostRecentConversationByIdentity({
      orgId: input.orgId,
      channelIdentityId: identity.id,
      channelType: input.channelType,
      client: input.client
    }));

  const preview = input.bodyText.slice(0, 240);
  const status = resolveStatus({
    resolvedContactId: resolvedContact?.id ?? null,
    suggestionsCount: suggestions.length
  });

  if (!conversation) {
    conversation = await createConversation({
      orgId: input.orgId,
      channelType: input.channelType,
      externalThreadId: input.externalThreadId,
      contactId: resolvedContact?.id ?? null,
      channelIdentityId: identity.id,
      resolutionStatus: status,
      previewText: preview,
      lastMessageAt: input.sentAt,
      conversationMetadata: {
        inboundHints: input.hints
      },
      client: input.client
    });
  } else {
    conversation = await updateConversation({
      orgId: input.orgId,
      conversationId: conversation.id,
      contactId: resolvedContact?.id ?? null,
      channelIdentityId: identity.id,
      resolutionStatus: status,
      previewText: preview,
      lastMessageAt: input.sentAt,
      conversationMetadata: {
        ...conversation.conversationMetadata,
        inboundHints: input.hints
      },
      client: input.client
    });
  }

  const message = await upsertInboundMessage({
    orgId: input.orgId,
    conversationId: conversation.id,
    contactId: resolvedContact?.id ?? null,
    channelIdentityId: identity.id,
    direction: input.direction,
    externalMessageId: input.externalMessageId,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml,
    senderLabel: input.senderLabel,
    sentAt: input.sentAt,
    messageMetadata: input.messageMetadata,
    client: input.client
  });

  let suggestionRows: CommSuggestionWithContact[] = [];

  if (!resolvedContact) {
    await replaceConversationSuggestions({
      orgId: input.orgId,
      conversationId: conversation.id,
      channelIdentityId: identity.id,
      suggestions: suggestions.map((suggestion) => ({
        suggestedContactId: suggestion.contact.id,
        confidenceScore: suggestion.score,
        confidenceReasonCodes: suggestion.reasons
      })),
      client: input.client
    });

    suggestionRows = suggestions.map((suggestion) => ({
      suggestion: {
        id: `preview:${suggestion.contact.id}`,
        orgId: input.orgId,
        conversationId: conversation.id,
        channelIdentityId: identity.id,
        suggestedContactId: suggestion.contact.id,
        confidenceScore: suggestion.score,
        confidenceReasonCodes: suggestion.reasons,
        status: "pending",
        createdAt: new Date().toISOString(),
        decidedAt: null,
        decidedByUserId: null
      },
      contact: suggestion.contact
    }));
  } else {
    await expirePendingSuggestionsForConversation({
      orgId: input.orgId,
      conversationId: conversation.id,
      client: input.client
    });
  }

  await createResolutionEvent({
    orgId: input.orgId,
    conversationId: conversation.id,
    channelIdentityId: identity.id,
    contactId: resolvedContact?.id ?? null,
    eventType: resolvedContact ? "inbound_resolved" : suggestionRows.length > 0 ? "inbound_suggested" : "inbound_unresolved",
    eventDetailJson: {
      channelType: input.channelType,
      externalIdentityId: input.externalIdentityId,
      externalMessageId: input.externalMessageId,
      reasons: suggestionRows.map((row) => row.suggestion.confidenceReasonCodes)
    },
    client: input.client
  });

  return {
    conversation,
    identity,
    contact: resolvedContact,
    message,
    suggestions: suggestionRows,
    autoLinked: Boolean(resolvedContact && !input.hints.authUserId)
  };
}

export async function generateContactMatchSuggestions(input: {
  orgId: string;
  conversationId: string;
  hints: InboundIdentityHints;
  identityNormalizedValue: string | null;
  client?: SupabaseClient<any>;
}) {
  const conversation = await findConversationById(input.orgId, input.conversationId, input.client);
  if (!conversation || !conversation.channelIdentityId) {
    return [];
  }

  const suggestions = await buildSuggestions({
    orgId: input.orgId,
    hints: input.hints,
    identityNormalizedValue: input.identityNormalizedValue,
    client: input.client
  });

  await replaceConversationSuggestions({
    orgId: input.orgId,
    conversationId: conversation.id,
    channelIdentityId: conversation.channelIdentityId,
    suggestions: suggestions.map((suggestion) => ({
      suggestedContactId: suggestion.contact.id,
      confidenceScore: suggestion.score,
      confidenceReasonCodes: suggestion.reasons
    })),
    client: input.client
  });

  await updateConversation({
    orgId: input.orgId,
    conversationId: conversation.id,
    resolutionStatus: suggestions.length > 0 ? "suggested" : "unresolved",
    client: input.client
  });

  return suggestions;
}

export async function linkChannelIdentityToContact(input: {
  orgId: string;
  conversationId: string;
  identityId: string;
  contactId: string;
  actorUserId: string;
  source: "manual" | "suggestion";
  client?: SupabaseClient<any>;
}) {
  const [conversation, contact] = await Promise.all([
    findConversationById(input.orgId, input.conversationId, input.client),
    findCommContactById(input.orgId, input.contactId, input.client)
  ]);

  if (!conversation) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  if (!contact) {
    throw new Error("CONTACT_NOT_FOUND");
  }

  await linkIdentityToContact({
    orgId: input.orgId,
    identityId: input.identityId,
    contactId: input.contactId,
    client: input.client
  });

  await updateConversationsForIdentity({
    orgId: input.orgId,
    identityId: input.identityId,
    contactId: input.contactId,
    resolutionStatus: "resolved",
    client: input.client
  });

  await updateConversation({
    orgId: input.orgId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    resolutionStatus: "resolved",
    client: input.client
  });

  const identity = await findIdentityById(input.orgId, input.identityId, input.client);

  await acceptPendingSuggestionsForConversationContact({
    orgId: input.orgId,
    conversationId: input.conversationId,
    contactId: input.contactId,
    decidedByUserId: input.actorUserId,
    client: input.client
  });

  await rejectAllOtherPendingSuggestions({
    orgId: input.orgId,
    conversationId: input.conversationId,
    acceptedContactId: input.contactId,
    decidedByUserId: input.actorUserId,
    client: input.client
  });

  await createResolutionEvent({
    orgId: input.orgId,
    conversationId: input.conversationId,
    channelIdentityId: input.identityId,
    contactId: input.contactId,
    actorUserId: input.actorUserId,
    eventType: "identity_linked",
    eventDetailJson: {
      source: input.source
    },
    client: input.client
  });

  await createCommAuditLog({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "communications.identity_linked",
    entityType: "org_comm_channel_identity",
    entityId: input.identityId,
    detailJson: {
      conversationId: input.conversationId,
      contactId: input.contactId,
      source: input.source
    },
    client: input.client
  });

  return {
    identity,
    contact
  };
}

export async function createContactFromConversation(input: {
  orgId: string;
  conversationId: string;
  actorUserId: string;
  displayName?: string | null;
  email?: string | null;
  phone?: string | null;
  notes?: string | null;
  client?: SupabaseClient<any>;
}) {
  const conversation = await findConversationById(input.orgId, input.conversationId, input.client);
  if (!conversation || !conversation.channelIdentityId) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  const identity = await findIdentityById(input.orgId, conversation.channelIdentityId, input.client);
  if (!identity) {
    throw new Error("IDENTITY_NOT_FOUND");
  }

  const hints = (conversation.conversationMetadata.inboundHints as InboundIdentityHints | undefined) ?? {};
  const normalizedName = normalizeDisplayName(input.displayName ?? hints.displayName ?? identity.displayLabel);
  const nameParts = splitName(normalizedName);
  const displayName = normalizedName ?? identity.displayLabel ?? "Unknown Contact";
  const email = normalizeEmail(input.email ?? hints.email);
  const phone = normalizePhone(input.phone ?? hints.phone);

  const contact = await createCommContact({
    orgId: input.orgId,
    displayName,
    firstName: nameParts.firstName,
    lastName: nameParts.lastName,
    primaryEmail: email,
    primaryPhone: phone,
    source: "inbox_create",
    notes: input.notes ?? null,
    metadataJson: {
      createdFromConversationId: input.conversationId,
      channelType: conversation.channelType
    },
    client: input.client
  });

  await linkChannelIdentityToContact({
    orgId: input.orgId,
    conversationId: input.conversationId,
    identityId: identity.id,
    contactId: contact.id,
    actorUserId: input.actorUserId,
    source: "manual",
    client: input.client
  });

  await createResolutionEvent({
    orgId: input.orgId,
    conversationId: input.conversationId,
    channelIdentityId: identity.id,
    contactId: contact.id,
    actorUserId: input.actorUserId,
    eventType: "contact_created_from_conversation",
    eventDetailJson: {
      conversationId: input.conversationId
    },
    client: input.client
  });

  await createCommAuditLog({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "communications.contact_created_from_conversation",
    entityType: "org_comm_contact",
    entityId: contact.id,
    detailJson: {
      conversationId: input.conversationId,
      identityId: identity.id
    },
    client: input.client
  });

  return contact;
}

export async function dismissConversationSuggestions(input: {
  orgId: string;
  conversationId: string;
  actorUserId: string;
  client?: SupabaseClient<any>;
}) {
  const conversation = await findConversationById(input.orgId, input.conversationId, input.client);
  if (!conversation) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  await expirePendingSuggestionsForConversation({
    orgId: input.orgId,
    conversationId: input.conversationId,
    decidedByUserId: input.actorUserId,
    client: input.client
  });

  await updateConversation({
    orgId: input.orgId,
    conversationId: input.conversationId,
    resolutionStatus: "ignored",
    client: input.client
  });

  await createResolutionEvent({
    orgId: input.orgId,
    conversationId: input.conversationId,
    channelIdentityId: conversation.channelIdentityId,
    contactId: conversation.contactId,
    actorUserId: input.actorUserId,
    eventType: "suggestions_dismissed",
    eventDetailJson: {},
    client: input.client
  });

  await createCommAuditLog({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "communications.suggestions_dismissed",
    entityType: "org_comm_conversation",
    entityId: input.conversationId,
    detailJson: {},
    client: input.client
  });
}

export async function rejectSuggestion(input: {
  orgId: string;
  conversationId: string;
  suggestionId: string;
  actorUserId: string;
  client?: SupabaseClient<any>;
}) {
  void input;
  throw new Error("SUGGESTIONS_DISABLED");
}

export async function rerunConversationSuggestions(input: {
  orgId: string;
  conversationId: string;
  actorUserId: string;
  client?: SupabaseClient<any>;
}) {
  const conversation = await findConversationById(input.orgId, input.conversationId, input.client);
  if (!conversation) {
    throw new Error("CONVERSATION_NOT_FOUND");
  }

  const identity = await getIdentityByConversation(input.orgId, input.conversationId, input.client);

  const hints = (conversation.conversationMetadata.inboundHints as InboundIdentityHints | undefined) ?? {};
  const suggestions = await generateContactMatchSuggestions({
    orgId: input.orgId,
    conversationId: input.conversationId,
    hints,
    identityNormalizedValue: identity?.normalizedValue ?? null,
    client: input.client
  });

  await createResolutionEvent({
    orgId: input.orgId,
    conversationId: input.conversationId,
    channelIdentityId: identity?.id ?? null,
    actorUserId: input.actorUserId,
    eventType: "suggestions_regenerated",
    eventDetailJson: {
      suggestionCount: suggestions.length
    },
    client: input.client
  });

  return suggestions;
}

export async function unlinkChannelIdentityFromContact(input: {
  orgId: string;
  identityId: string;
  actorUserId: string;
  client?: SupabaseClient<any>;
}) {
  const identity = await findIdentityById(input.orgId, input.identityId, input.client);
  if (!identity) {
    throw new Error("IDENTITY_NOT_FOUND");
  }

  await unlinkIdentity({
    orgId: input.orgId,
    identityId: input.identityId,
    client: input.client
  });

  await updateConversationsForIdentity({
    orgId: input.orgId,
    identityId: input.identityId,
    contactId: null,
    resolutionStatus: "unresolved",
    client: input.client
  });

  await createResolutionEvent({
    orgId: input.orgId,
    channelIdentityId: input.identityId,
    contactId: identity.contactId,
    actorUserId: input.actorUserId,
    eventType: "identity_unlinked",
    eventDetailJson: {},
    client: input.client
  });

  await createCommAuditLog({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "communications.identity_unlinked",
    entityType: "org_comm_channel_identity",
    entityId: input.identityId,
    detailJson: {
      previousContactId: identity.contactId
    },
    client: input.client
  });
}

export async function mergeContacts(input: {
  orgId: string;
  sourceContactId: string;
  targetContactId: string;
  strategy: {
    displayName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
    avatarUrl?: string | null;
    notes?: string | null;
  };
  client?: SupabaseClient<any>;
}) {
  await mergeContactsViaRpc({
    orgId: input.orgId,
    sourceContactId: input.sourceContactId,
    targetContactId: input.targetContactId,
    strategy: input.strategy,
    client: input.client
  });
}

export async function listInboxConnections(input: {
  orgId: string;
  channelType?: "facebook_messenger";
  client?: SupabaseClient<any>;
}) {
  return listChannelIntegrations(input.orgId, input.channelType, input.client);
}

export async function connectFacebookPageIntegration(input: {
  orgId: string;
  actorUserId: string;
  pageId: string;
  pageAccessToken: string;
  pageName?: string | null;
  client?: SupabaseClient<any>;
}) {
  const trimmedPageId = input.pageId.trim();
  const trimmedToken = input.pageAccessToken.trim();
  if (!trimmedPageId || !trimmedToken) {
    throw new Error("FACEBOOK_PAGE_ID_AND_TOKEN_REQUIRED");
  }

  const verifiedPage = await verifyFacebookPageAccessToken({
    pageId: trimmedPageId,
    pageAccessToken: trimmedToken
  });

  let integration;
  try {
    integration = await upsertChannelIntegration({
      orgId: input.orgId,
      channelType: "facebook_messenger",
      provider: "meta",
      providerAccountId: verifiedPage.id,
      providerAccountName: input.pageName?.trim() || verifiedPage.name || null,
      status: "active",
      connectedByUserId: input.actorUserId,
      disconnectedAt: null,
      lastError: null,
      client: input.client
    });
  } catch (error) {
    if (
      error instanceof Error &&
      (
        error.message.includes("org_comm_channel_integrations_channel_type_provider_account_id_key")
        || error.message.includes("channel_integrations_org_channel_provider_idx")
      )
    ) {
      throw new Error("FACEBOOK_PAGE_ALREADY_CONNECTED_TO_ANOTHER_ORG");
    }
    throw error;
  }

  const serviceRoleClient = createOptionalSupabaseServiceRoleClient();
  if (!serviceRoleClient) {
    throw new Error("SERVICE_ROLE_NOT_CONFIGURED");
  }

  await upsertChannelIntegrationSecret({
    orgId: input.orgId,
    integrationId: integration.id,
    encryptedAccessToken: encryptAccessToken(trimmedToken),
    tokenHint: maskToken(trimmedToken),
    client: serviceRoleClient
  });

  let webhookSubscribed = false;
  let subscribeError: string | null = null;
  try {
    webhookSubscribed = await subscribeFacebookPageWebhook({
      pageId: verifiedPage.id,
      pageAccessToken: trimmedToken
    });
  } catch (error) {
    subscribeError = error instanceof Error ? error.message : "unknown_webhook_subscribe_error";
  }

  await updateChannelIntegrationSyncState({
    orgId: input.orgId,
    integrationId: integration.id,
    lastSyncAt: new Date().toISOString(),
    lastError: subscribeError,
    status: "active",
    client: input.client
  });

  await createResolutionEvent({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    eventType: "channel_integration_connected",
    eventDetailJson: {
      channelType: "facebook_messenger",
      provider: "meta",
      providerAccountId: verifiedPage.id,
      providerAccountName: input.pageName?.trim() || verifiedPage.name || null,
      webhookSubscribed
    },
    client: input.client
  });

  await createCommAuditLog({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "communications.channel_connected",
    entityType: "org_comm_channel_integration",
    entityId: integration.id,
    detailJson: {
      channelType: "facebook_messenger",
      provider: "meta",
      providerAccountId: verifiedPage.id,
      webhookSubscribed,
      subscribeError
    },
    client: input.client
  });

  return {
    integrationId: integration.id,
    providerAccountId: verifiedPage.id,
    providerAccountName: input.pageName?.trim() || verifiedPage.name || null,
    webhookSubscribed,
    subscribeError
  };
}

export async function disconnectChannelIntegration(input: {
  orgId: string;
  integrationId: string;
  actorUserId: string;
  client?: SupabaseClient<any>;
}) {
  const integration = await markChannelIntegrationDisconnected({
    orgId: input.orgId,
    integrationId: input.integrationId,
    client: input.client
  });

  const serviceRoleClient = createOptionalSupabaseServiceRoleClient();
  if (serviceRoleClient) {
    await deleteChannelIntegrationSecret({
      orgId: input.orgId,
      integrationId: input.integrationId,
      client: serviceRoleClient
    });
  }

  await createResolutionEvent({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    eventType: "channel_integration_disconnected",
    eventDetailJson: {
      integrationId: input.integrationId,
      providerAccountId: integration.providerAccountId,
      channelType: integration.channelType
    },
    client: input.client
  });

  await createCommAuditLog({
    orgId: input.orgId,
    actorUserId: input.actorUserId,
    action: "communications.channel_disconnected",
    entityType: "org_comm_channel_integration",
    entityId: input.integrationId,
    detailJson: {
      providerAccountId: integration.providerAccountId,
      channelType: integration.channelType
    },
    client: input.client
  });
}

export async function resolveFacebookIdentityLabelForWebhook(input: {
  pageId: string;
  externalIdentityId: string;
  client?: SupabaseClient<any>;
}) {
  const integration = await findActiveChannelIntegrationByProviderAccount({
    channelType: "facebook_messenger",
    providerAccountId: input.pageId,
    client: input.client
  });
  if (!integration) {
    return {
      orgId: null,
      identityDisplayLabel: null
    };
  }

  const secret = await getChannelIntegrationSecret({
    orgId: integration.orgId,
    integrationId: integration.id,
    client: input.client
  });
  if (!secret) {
    return {
      orgId: integration.orgId,
      identityDisplayLabel: null
    };
  }

  try {
    const pageAccessToken = decryptAccessToken(secret.encryptedAccessToken);
    const displayName = await fetchFacebookMessengerUserName({
      pageAccessToken,
      userId: input.externalIdentityId
    });

    return {
      orgId: integration.orgId,
      identityDisplayLabel: displayName
    };
  } catch {
    return {
      orgId: integration.orgId,
      identityDisplayLabel: null
    };
  }
}

export function mapReasonsToLabel(reasons: ContactMatchReasonCode[]) {
  if (reasons.includes("authenticated_claim")) {
    return "Authenticated account match";
  }
  if (reasons.includes("exact_primary_email") || reasons.includes("exact_known_identity_email")) {
    return "Exact email match";
  }
  if (reasons.includes("exact_primary_phone") || reasons.includes("exact_known_identity_phone")) {
    return "Exact phone number match";
  }
  if (reasons.includes("name_similarity")) {
    return "Name similarity match";
  }
  return "Possible profile match";
}

export function resolveDirection(value: string | null | undefined): CommDirection {
  if (value === "outbound") {
    return "outbound";
  }
  if (value === "system") {
    return "system";
  }
  return "inbound";
}
