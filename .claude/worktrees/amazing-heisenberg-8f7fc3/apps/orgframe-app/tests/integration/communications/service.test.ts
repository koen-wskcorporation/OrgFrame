import assert from "node:assert/strict";
import { before, beforeEach, describe, it, mock } from "node:test";
import type {
  CommChannelIdentity,
  CommChannelType,
  CommContact,
  CommConversation,
  CommMatchSuggestion,
  CommMessage,
  CommResolutionEvent,
  CommResolutionStatus,
  CommSuggestionWithContact,
  ContactMatchReasonCode,
  InboundIngressPayload
} from "@/src/features/communications/types";

type MergeStrategy = {
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  avatarUrl?: string | null;
  notes?: string | null;
};

type MockState = ReturnType<typeof createMockState>;

function createMockState() {
  let idCounter = 0;
  let tsCounter = 0;

  const contacts: CommContact[] = [];
  const identities: CommChannelIdentity[] = [];
  const conversations: CommConversation[] = [];
  const messages: CommMessage[] = [];
  const suggestions: CommMatchSuggestion[] = [];
  const events: CommResolutionEvent[] = [];
  const audits: Array<Record<string, unknown>> = [];
  const merges: Array<Record<string, unknown>> = [];

  function nextId(prefix: string) {
    idCounter += 1;
    return `${prefix}-${idCounter}`;
  }

  function nextTs() {
    const date = new Date(Date.UTC(2026, 0, 1, 0, 0, tsCounter));
    tsCounter += 1;
    return date.toISOString();
  }

  function reset() {
    idCounter = 0;
    tsCounter = 0;
    contacts.length = 0;
    identities.length = 0;
    conversations.length = 0;
    messages.length = 0;
    suggestions.length = 0;
    events.length = 0;
    audits.length = 0;
    merges.length = 0;
  }

  function seedContact(input: {
    orgId: string;
    displayName: string;
    primaryEmail?: string | null;
    primaryPhone?: string | null;
    authUserId?: string | null;
  }) {
    const now = nextTs();
    const contact: CommContact = {
      id: nextId("contact"),
      orgId: input.orgId,
      authUserId: input.authUserId ?? null,
      displayName: input.displayName,
      firstName: null,
      lastName: null,
      primaryEmail: input.primaryEmail ?? null,
      primaryPhone: input.primaryPhone ?? null,
      avatarUrl: null,
      status: "active",
      source: "seed",
      notes: null,
      metadataJson: {},
      mergedIntoContactId: null,
      deletedAt: null,
      createdAt: now,
      updatedAt: now
    };
    contacts.push(contact);
    return contact;
  }

  function seedIdentity(input: {
    orgId: string;
    channelType: CommChannelType;
    externalId: string;
    contactId?: string | null;
    normalizedValue?: string | null;
    displayLabel?: string | null;
  }) {
    const now = nextTs();
    const identity: CommChannelIdentity = {
      id: nextId("identity"),
      orgId: input.orgId,
      contactId: input.contactId ?? null,
      channelType: input.channelType,
      externalId: input.externalId,
      externalUsername: null,
      normalizedValue: input.normalizedValue ?? null,
      displayLabel: input.displayLabel ?? null,
      identityMetadata: {},
      isVerified: false,
      linkedAt: input.contactId ? now : null,
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now
    };
    identities.push(identity);
    return identity;
  }

  function seedConversation(input: {
    orgId: string;
    channelType: CommChannelType;
    channelIdentityId?: string | null;
    contactId?: string | null;
    resolutionStatus?: CommResolutionStatus;
  }) {
    const now = nextTs();
    const conversation: CommConversation = {
      id: nextId("conversation"),
      orgId: input.orgId,
      channelType: input.channelType,
      externalThreadId: null,
      contactId: input.contactId ?? null,
      channelIdentityId: input.channelIdentityId ?? null,
      resolutionStatus: input.resolutionStatus ?? "unresolved",
      subject: null,
      previewText: null,
      lastMessageAt: now,
      assignedToUserId: null,
      archivedAt: null,
      conversationMetadata: {},
      createdAt: now,
      updatedAt: now
    };
    conversations.push(conversation);
    return conversation;
  }

  function seedMessage(input: {
    orgId: string;
    conversationId: string;
    contactId?: string | null;
    channelIdentityId?: string | null;
    bodyText?: string;
  }) {
    const now = nextTs();
    const message: CommMessage = {
      id: nextId("message"),
      orgId: input.orgId,
      conversationId: input.conversationId,
      contactId: input.contactId ?? null,
      channelIdentityId: input.channelIdentityId ?? null,
      direction: "inbound",
      externalMessageId: null,
      bodyText: input.bodyText ?? "hello",
      bodyHtml: null,
      attachmentsJson: [],
      senderLabel: null,
      sentAt: now,
      deliveryStatus: null,
      messageMetadata: {},
      createdAt: now,
      updatedAt: now
    };
    messages.push(message);
    return message;
  }

  return {
    contacts,
    identities,
    conversations,
    messages,
    suggestions,
    events,
    audits,
    merges,
    reset,
    nextId,
    nextTs,
    seedContact,
    seedIdentity,
    seedConversation,
    seedMessage
  };
}

function createQueriesMock(state: MockState) {
  return {
    findIdentityByExternal: async (input: {
      orgId: string;
      channelType: CommChannelType;
      externalId: string;
    }) =>
      state.identities.find(
        (row) =>
          row.orgId === input.orgId && row.channelType === input.channelType && row.externalId === input.externalId
      ) ?? null,

    upsertIdentity: async (input: {
      orgId: string;
      channelType: CommChannelType;
      externalId: string;
      externalUsername?: string | null;
      normalizedValue?: string | null;
      displayLabel?: string | null;
      isVerified?: boolean;
      identityMetadata?: Record<string, unknown>;
    }) => {
      const existing = state.identities.find(
        (row) =>
          row.orgId === input.orgId && row.channelType === input.channelType && row.externalId === input.externalId
      );
      const now = state.nextTs();
      if (existing) {
        existing.externalUsername = input.externalUsername ?? existing.externalUsername;
        existing.normalizedValue = input.normalizedValue ?? existing.normalizedValue;
        existing.displayLabel = input.displayLabel ?? existing.displayLabel;
        existing.isVerified = input.isVerified ?? existing.isVerified;
        existing.identityMetadata = {
          ...existing.identityMetadata,
          ...(input.identityMetadata ?? {})
        };
        existing.lastSeenAt = now;
        existing.updatedAt = now;
        return existing;
      }

      const created: CommChannelIdentity = {
        id: state.nextId("identity"),
        orgId: input.orgId,
        contactId: null,
        channelType: input.channelType,
        externalId: input.externalId,
        externalUsername: input.externalUsername ?? null,
        normalizedValue: input.normalizedValue ?? null,
        displayLabel: input.displayLabel ?? null,
        identityMetadata: input.identityMetadata ?? {},
        isVerified: input.isVerified ?? false,
        linkedAt: null,
        lastSeenAt: now,
        createdAt: now,
        updatedAt: now
      };
      state.identities.push(created);
      return created;
    },

    findCommContactById: async (orgId: string, contactId: string) =>
      state.contacts.find((row) => row.orgId === orgId && row.id === contactId && row.deletedAt === null) ?? null,

    listMatchingContacts: async (input: {
      orgId: string;
      authUserId?: string | null;
      normalizedEmail?: string | null;
      normalizedPhone?: string | null;
      displayName?: string | null;
    }) => {
      const byId = new Map<string, CommContact>();
      const scoped = state.contacts.filter((row) => row.orgId === input.orgId && row.deletedAt === null && row.status !== "merged");

      if (input.authUserId) {
        for (const contact of scoped) {
          if (contact.authUserId === input.authUserId) {
            byId.set(contact.id, contact);
          }
        }
      }
      if (input.normalizedEmail) {
        for (const contact of scoped) {
          if ((contact.primaryEmail ?? "").toLowerCase() === input.normalizedEmail.toLowerCase()) {
            byId.set(contact.id, contact);
          }
        }
      }
      if (input.normalizedPhone) {
        for (const contact of scoped) {
          if (contact.primaryPhone === input.normalizedPhone) {
            byId.set(contact.id, contact);
          }
        }
      }
      if (input.displayName) {
        const query = input.displayName.toLowerCase();
        for (const contact of scoped) {
          if (contact.displayName.toLowerCase().includes(query)) {
            byId.set(contact.id, contact);
          }
        }
      }

      if (byId.size < 10) {
        for (const contact of scoped) {
          byId.set(contact.id, contact);
          if (byId.size >= 20) {
            break;
          }
        }
      }

      return [...byId.values()];
    },

    findConversationByExternalThread: async (input: {
      orgId: string;
      channelType: CommChannelType;
      externalThreadId: string;
    }) =>
      state.conversations.find(
        (row) =>
          row.orgId === input.orgId &&
          row.channelType === input.channelType &&
          row.externalThreadId === input.externalThreadId
      ) ?? null,

    findMostRecentConversationByIdentity: async (input: {
      orgId: string;
      channelIdentityId: string;
      channelType: CommChannelType;
    }) =>
      state.conversations
        .filter(
          (row) =>
            row.orgId === input.orgId &&
            row.channelIdentityId === input.channelIdentityId &&
            row.channelType === input.channelType &&
            row.archivedAt === null
        )
        .sort((left, right) => right.lastMessageAt.localeCompare(left.lastMessageAt))[0] ?? null,

    createConversation: async (input: {
      orgId: string;
      channelType: CommChannelType;
      externalThreadId?: string | null;
      contactId?: string | null;
      channelIdentityId?: string | null;
      resolutionStatus: CommResolutionStatus;
      previewText?: string | null;
      lastMessageAt: string;
      conversationMetadata?: Record<string, unknown>;
    }) => {
      const now = state.nextTs();
      const created: CommConversation = {
        id: state.nextId("conversation"),
        orgId: input.orgId,
        channelType: input.channelType,
        externalThreadId: input.externalThreadId ?? null,
        contactId: input.contactId ?? null,
        channelIdentityId: input.channelIdentityId ?? null,
        resolutionStatus: input.resolutionStatus,
        subject: null,
        previewText: input.previewText ?? null,
        lastMessageAt: input.lastMessageAt,
        assignedToUserId: null,
        archivedAt: null,
        conversationMetadata: input.conversationMetadata ?? {},
        createdAt: now,
        updatedAt: now
      };
      state.conversations.push(created);
      return created;
    },

    updateConversation: async (input: {
      orgId: string;
      conversationId: string;
      contactId?: string | null;
      channelIdentityId?: string | null;
      resolutionStatus?: CommResolutionStatus;
      previewText?: string | null;
      lastMessageAt?: string;
      conversationMetadata?: Record<string, unknown>;
    }) => {
      const conversation = state.conversations.find(
        (row) => row.orgId === input.orgId && row.id === input.conversationId
      );
      if (!conversation) {
        throw new Error("CONVERSATION_NOT_FOUND");
      }
      conversation.contactId = input.contactId ?? conversation.contactId;
      conversation.channelIdentityId = input.channelIdentityId ?? conversation.channelIdentityId;
      conversation.resolutionStatus = input.resolutionStatus ?? conversation.resolutionStatus;
      conversation.previewText = input.previewText ?? conversation.previewText;
      conversation.lastMessageAt = input.lastMessageAt ?? conversation.lastMessageAt;
      if (input.conversationMetadata) {
        conversation.conversationMetadata = input.conversationMetadata;
      }
      conversation.updatedAt = state.nextTs();
      return conversation;
    },

    upsertInboundMessage: async (input: {
      orgId: string;
      conversationId: string;
      contactId?: string | null;
      channelIdentityId?: string | null;
      direction: "inbound" | "outbound" | "system";
      externalMessageId?: string | null;
      bodyText: string;
      bodyHtml?: string | null;
      senderLabel?: string | null;
      sentAt: string;
      messageMetadata?: Record<string, unknown>;
    }) => {
      if (input.externalMessageId) {
        const existing = state.messages.find(
          (row) =>
            row.orgId === input.orgId &&
            row.conversationId === input.conversationId &&
            row.externalMessageId === input.externalMessageId
        );
        if (existing) {
          return existing;
        }
      }

      const now = state.nextTs();
      const created: CommMessage = {
        id: state.nextId("message"),
        orgId: input.orgId,
        conversationId: input.conversationId,
        contactId: input.contactId ?? null,
        channelIdentityId: input.channelIdentityId ?? null,
        direction: input.direction,
        externalMessageId: input.externalMessageId ?? null,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml ?? null,
        attachmentsJson: [],
        senderLabel: input.senderLabel ?? null,
        sentAt: input.sentAt,
        deliveryStatus: null,
        messageMetadata: input.messageMetadata ?? {},
        createdAt: now,
        updatedAt: now
      };
      state.messages.push(created);
      return created;
    },

    replaceConversationSuggestions: async (input: {
      orgId: string;
      conversationId: string;
      channelIdentityId: string;
      suggestions: Array<{
        suggestedContactId: string;
        confidenceScore: number;
        confidenceReasonCodes: ContactMatchReasonCode[];
      }>;
    }) => {
      for (let index = state.suggestions.length - 1; index >= 0; index -= 1) {
        const row = state.suggestions[index];
        if (row.orgId === input.orgId && row.conversationId === input.conversationId && row.status === "pending") {
          state.suggestions.splice(index, 1);
        }
      }

      const now = state.nextTs();
      const created = input.suggestions.map((row) => {
        const suggestion: CommMatchSuggestion = {
          id: state.nextId("suggestion"),
          orgId: input.orgId,
          conversationId: input.conversationId,
          channelIdentityId: input.channelIdentityId,
          suggestedContactId: row.suggestedContactId,
          confidenceScore: row.confidenceScore,
          confidenceReasonCodes: row.confidenceReasonCodes,
          status: "pending",
          createdAt: now,
          decidedAt: null,
          decidedByUserId: null
        };
        state.suggestions.push(suggestion);
        return suggestion;
      });

      return created;
    },

    expirePendingSuggestionsForConversation: async (input: {
      orgId: string;
      conversationId: string;
      decidedByUserId?: string | null;
    }) => {
      const now = state.nextTs();
      for (const row of state.suggestions) {
        if (row.orgId === input.orgId && row.conversationId === input.conversationId && row.status === "pending") {
          row.status = "expired";
          row.decidedAt = now;
          row.decidedByUserId = input.decidedByUserId ?? null;
        }
      }
    },

    createResolutionEvent: async (input: {
      orgId: string;
      conversationId?: string | null;
      channelIdentityId?: string | null;
      contactId?: string | null;
      actorUserId?: string | null;
      eventType: string;
      eventDetailJson?: Record<string, unknown>;
    }) => {
      const event: CommResolutionEvent = {
        id: state.nextId("event"),
        orgId: input.orgId,
        conversationId: input.conversationId ?? null,
        channelIdentityId: input.channelIdentityId ?? null,
        contactId: input.contactId ?? null,
        actorUserId: input.actorUserId ?? null,
        eventType: input.eventType,
        eventDetailJson: input.eventDetailJson ?? {},
        createdAt: state.nextTs()
      };
      state.events.push(event);
    },

    createCommAuditLog: async (input: {
      orgId: string;
      actorUserId: string;
      action: string;
      entityType: string;
      entityId: string;
      detailJson?: Record<string, unknown>;
    }) => {
      state.audits.push({
        id: state.nextId("audit"),
        orgId: input.orgId,
        actorUserId: input.actorUserId,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        detailJson: input.detailJson ?? {},
        createdAt: state.nextTs()
      });
    },

    findConversationById: async (orgId: string, conversationId: string) =>
      state.conversations.find((row) => row.orgId === orgId && row.id === conversationId) ?? null,

    findIdentityById: async (orgId: string, identityId: string) =>
      state.identities.find((row) => row.orgId === orgId && row.id === identityId) ?? null,

    linkIdentityToContact: async (input: { orgId: string; identityId: string; contactId: string }) => {
      const identity = state.identities.find((row) => row.orgId === input.orgId && row.id === input.identityId);
      if (!identity) {
        throw new Error("IDENTITY_NOT_FOUND");
      }
      identity.contactId = input.contactId;
      identity.linkedAt = state.nextTs();
      identity.updatedAt = state.nextTs();
      return identity;
    },

    updateConversationsForIdentity: async (input: {
      orgId: string;
      identityId: string;
      contactId?: string | null;
      resolutionStatus: CommResolutionStatus;
    }) => {
      for (const conversation of state.conversations) {
        if (conversation.orgId === input.orgId && conversation.channelIdentityId === input.identityId) {
          conversation.contactId = input.contactId ?? null;
          conversation.resolutionStatus = input.resolutionStatus;
          conversation.updatedAt = state.nextTs();
        }
      }
    },

    acceptPendingSuggestionsForConversationContact: async (input: {
      orgId: string;
      conversationId: string;
      contactId: string;
      decidedByUserId?: string | null;
    }) => {
      const now = state.nextTs();
      for (const suggestion of state.suggestions) {
        if (
          suggestion.orgId === input.orgId &&
          suggestion.conversationId === input.conversationId &&
          suggestion.suggestedContactId === input.contactId &&
          suggestion.status === "pending"
        ) {
          suggestion.status = "accepted";
          suggestion.decidedAt = now;
          suggestion.decidedByUserId = input.decidedByUserId ?? null;
        }
      }
    },

    rejectAllOtherPendingSuggestions: async (input: {
      orgId: string;
      conversationId: string;
      acceptedContactId: string;
      decidedByUserId?: string | null;
    }) => {
      const now = state.nextTs();
      for (const suggestion of state.suggestions) {
        if (
          suggestion.orgId === input.orgId &&
          suggestion.conversationId === input.conversationId &&
          suggestion.suggestedContactId !== input.acceptedContactId &&
          suggestion.status === "pending"
        ) {
          suggestion.status = "rejected";
          suggestion.decidedAt = now;
          suggestion.decidedByUserId = input.decidedByUserId ?? null;
        }
      }
    },

    setSuggestionStatus: async (input: {
      orgId: string;
      suggestionId: string;
      status: CommMatchSuggestion["status"];
      decidedByUserId?: string | null;
    }) => {
      const suggestion = state.suggestions.find((row) => row.orgId === input.orgId && row.id === input.suggestionId);
      if (!suggestion) {
        throw new Error("SUGGESTION_NOT_FOUND");
      }
      suggestion.status = input.status;
      suggestion.decidedAt = state.nextTs();
      suggestion.decidedByUserId = input.decidedByUserId ?? null;
      return suggestion;
    },

    getConversationSuggestions: async (orgId: string, conversationId: string): Promise<CommSuggestionWithContact[]> => {
      return state.suggestions
        .filter(
          (row) =>
            row.orgId === orgId &&
            row.conversationId === conversationId &&
            ["pending", "accepted", "rejected", "deferred"].includes(row.status)
        )
        .map((suggestion) => {
          const contact = state.contacts.find((item) => item.id === suggestion.suggestedContactId && item.orgId === orgId);
          if (!contact) {
            return null;
          }
          return {
            suggestion,
            contact
          };
        })
        .filter((item): item is CommSuggestionWithContact => item !== null);
    },

    getIdentityByConversation: async (orgId: string, conversationId: string) => {
      const conversation = state.conversations.find((row) => row.orgId === orgId && row.id === conversationId);
      if (!conversation?.channelIdentityId) {
        return null;
      }
      return state.identities.find((row) => row.orgId === orgId && row.id === conversation.channelIdentityId) ?? null;
    },

    unlinkIdentity: async (input: { orgId: string; identityId: string }) => {
      const identity = state.identities.find((row) => row.orgId === input.orgId && row.id === input.identityId);
      if (!identity) {
        throw new Error("IDENTITY_NOT_FOUND");
      }
      identity.contactId = null;
      identity.linkedAt = null;
      identity.updatedAt = state.nextTs();
      return identity;
    },

    createCommContact: async (input: {
      orgId: string;
      displayName: string;
      firstName?: string | null;
      lastName?: string | null;
      primaryEmail?: string | null;
      primaryPhone?: string | null;
      source: string;
      notes?: string | null;
      metadataJson?: Record<string, unknown>;
      authUserId?: string | null;
    }) => {
      const now = state.nextTs();
      const contact: CommContact = {
        id: state.nextId("contact"),
        orgId: input.orgId,
        authUserId: input.authUserId ?? null,
        displayName: input.displayName,
        firstName: input.firstName ?? null,
        lastName: input.lastName ?? null,
        primaryEmail: input.primaryEmail ?? null,
        primaryPhone: input.primaryPhone ?? null,
        avatarUrl: null,
        status: "active",
        source: input.source,
        notes: input.notes ?? null,
        metadataJson: input.metadataJson ?? {},
        mergedIntoContactId: null,
        deletedAt: null,
        createdAt: now,
        updatedAt: now
      };
      state.contacts.push(contact);
      return contact;
    },

    mergeContactsViaRpc: async (input: {
      orgId: string;
      sourceContactId: string;
      targetContactId: string;
      strategy: MergeStrategy;
    }) => {
      const source = state.contacts.find((row) => row.orgId === input.orgId && row.id === input.sourceContactId);
      const target = state.contacts.find((row) => row.orgId === input.orgId && row.id === input.targetContactId);
      if (!source || !target) {
        throw new Error("CONTACT_NOT_FOUND");
      }
      if (source.mergedIntoContactId) {
        throw new Error("SOURCE_ALREADY_MERGED");
      }

      target.displayName = input.strategy.displayName ?? target.displayName;
      target.firstName = input.strategy.firstName ?? target.firstName;
      target.lastName = input.strategy.lastName ?? target.lastName;
      target.primaryEmail = input.strategy.primaryEmail ?? target.primaryEmail;
      target.primaryPhone = input.strategy.primaryPhone ?? target.primaryPhone;
      target.notes = input.strategy.notes ?? target.notes;
      target.updatedAt = state.nextTs();

      for (let index = state.identities.length - 1; index >= 0; index -= 1) {
        const identity = state.identities[index];
        if (identity.orgId !== input.orgId || identity.contactId !== source.id) {
          continue;
        }
        const collision = state.identities.find(
          (candidate) =>
            candidate.orgId === input.orgId &&
            candidate.contactId === target.id &&
            candidate.channelType === identity.channelType &&
            candidate.externalId === identity.externalId
        );
        if (collision) {
          state.identities.splice(index, 1);
        } else {
          identity.contactId = target.id;
          identity.linkedAt = state.nextTs();
          identity.updatedAt = state.nextTs();
        }
      }

      for (const conversation of state.conversations) {
        if (conversation.orgId === input.orgId && conversation.contactId === source.id) {
          conversation.contactId = target.id;
          conversation.updatedAt = state.nextTs();
        }
      }

      for (const message of state.messages) {
        if (message.orgId === input.orgId && message.contactId === source.id) {
          message.contactId = target.id;
          message.updatedAt = state.nextTs();
        }
      }

      for (const suggestion of state.suggestions) {
        if (suggestion.orgId === input.orgId && suggestion.suggestedContactId === source.id) {
          suggestion.suggestedContactId = target.id;
        }
      }

      for (const event of state.events) {
        if (event.orgId === input.orgId && event.contactId === source.id) {
          event.contactId = target.id;
        }
      }

      source.status = "merged";
      source.mergedIntoContactId = target.id;
      source.deletedAt = state.nextTs();
      source.updatedAt = state.nextTs();

      state.merges.push({
        id: state.nextId("merge"),
        orgId: input.orgId,
        sourceContactId: source.id,
        targetContactId: target.id,
        strategy: input.strategy
      });
    }
  };
}

const state = createMockState();
mock.module("@/src/features/communications/db/queries", { namedExports: createQueriesMock(state) });
let service!: typeof import("@/src/features/communications/service");

function inboundPayload(overrides: Partial<InboundIngressPayload>): InboundIngressPayload {
  return {
    orgId: overrides.orgId ?? "org-1",
    channelType: overrides.channelType ?? "facebook_messenger",
    externalIdentityId: overrides.externalIdentityId ?? "sender-1",
    externalThreadId: overrides.externalThreadId ?? "thread-1",
    externalMessageId: overrides.externalMessageId ?? "message-1",
    direction: overrides.direction ?? "inbound",
    bodyText: overrides.bodyText ?? "hello",
    bodyHtml: overrides.bodyHtml ?? null,
    senderLabel: overrides.senderLabel ?? "Sender",
    sentAt: overrides.sentAt ?? state.nextTs(),
    identityExternalUsername: overrides.identityExternalUsername ?? null,
    identityDisplayLabel: overrides.identityDisplayLabel ?? "Sender",
    identityNormalizedValue: overrides.identityNormalizedValue ?? null,
    identityIsVerified: overrides.identityIsVerified ?? false,
    identityMetadata: overrides.identityMetadata ?? {},
    messageMetadata: overrides.messageMetadata ?? {},
    hints: overrides.hints ?? {}
  };
}

beforeEach(() => {
  state.reset();
});

before(async () => {
  service = await import("@/src/features/communications/service");
});

describe("communications identity resolution service", () => {
  it("exact identity match resolves conversation automatically", async () => {
    const contact = state.seedContact({ orgId: "org-1", displayName: "Pat Rivers", primaryEmail: "pat@example.com" });
    state.seedIdentity({
      orgId: "org-1",
      channelType: "facebook_messenger",
      externalId: "fb-123",
      contactId: contact.id,
      displayLabel: "Pat FB"
    });

    const result = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "facebook_messenger",
        externalIdentityId: "fb-123",
        identityDisplayLabel: "Pat FB",
        hints: { displayName: "Pat Rivers" }
      })
    );

    assert.equal(result.contact?.id, contact.id);
    assert.equal(result.conversation.resolutionStatus, "resolved");
    assert.equal(result.suggestions.length, 0);
  });

  it("exact normalized email auto-links only when top candidate is unique", async () => {
    const unique = state.seedContact({ orgId: "org-1", displayName: "Sam Unique", primaryEmail: "sam@example.com" });
    state.seedContact({ orgId: "org-1", displayName: "Another Contact", primaryEmail: "other@example.com" });

    const autoLinked = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "email",
        externalIdentityId: "email-sam",
        identityNormalizedValue: "sam@example.com",
        hints: { email: "sam@example.com", displayName: "Sam Unique" }
      })
    );

    assert.equal(autoLinked.contact?.id, unique.id);
    const linkedIdentity = state.identities.find((row) => row.id === autoLinked.identity.id);
    assert.equal(linkedIdentity?.contactId, unique.id);

    state.reset();
    state.seedContact({ orgId: "org-1", displayName: "Dup One", primaryEmail: "dup@example.com" });
    state.seedContact({ orgId: "org-1", displayName: "Dup Two", primaryEmail: "dup@example.com" });

    const ambiguous = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "email",
        externalIdentityId: "email-dup",
        identityNormalizedValue: "dup@example.com",
        hints: { email: "dup@example.com" }
      })
    );

    assert.equal(ambiguous.contact, null);
    assert.notEqual(ambiguous.conversation.resolutionStatus, "resolved");
    assert.equal(ambiguous.suggestions.length, 2);
    assert.equal(ambiguous.identity.contactId, null);
  });

  it("weak display-name-only match does not auto-link", async () => {
    state.seedContact({ orgId: "org-1", displayName: "Jordan Parent" });

    const result = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "website_chat",
        externalIdentityId: "chat-weak-1",
        hints: { displayName: "Jordan Parent" }
      })
    );

    assert.equal(result.contact, null);
    assert.equal(result.identity.contactId, null);
    assert.equal(result.conversation.resolutionStatus, "suggested");
    assert.ok(result.suggestions.length > 0);
  });

  it("unresolved inbound retains unlinked identity and pending suggestions", async () => {
    state.seedContact({ orgId: "org-1", displayName: "Alex Carter" });

    const result = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "sms",
        externalIdentityId: "sms-unknown",
        hints: { displayName: "Alex Carter" }
      })
    );

    assert.equal(result.contact, null);
    assert.equal(result.identity.contactId, null);
    assert.equal(result.conversation.resolutionStatus, "suggested");
    const pending = state.suggestions.filter(
      (row) => row.conversationId === result.conversation.id && row.status === "pending"
    );
    assert.ok(pending.length > 0);
  });

  it("manual link persists identity mapping and future inbound auto-resolves", async () => {
    const contact = state.seedContact({ orgId: "org-1", displayName: "Taylor Parent", primaryPhone: "+15551230000" });

    const first = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "sms",
        externalIdentityId: "sms-55",
        externalThreadId: "sms-thread",
        hints: { displayName: "Taylor Parent" }
      })
    );
    assert.equal(first.contact, null);

    await service.linkChannelIdentityToContact({
      orgId: "org-1",
      conversationId: first.conversation.id,
      identityId: first.identity.id,
      contactId: contact.id,
      actorUserId: "staff-1",
      source: "manual"
    });

    const second = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "sms",
        externalIdentityId: "sms-55",
        externalThreadId: "sms-thread",
        externalMessageId: "message-2",
        bodyText: "follow up"
      })
    );

    assert.equal(second.contact?.id, contact.id);
    assert.equal(second.conversation.resolutionStatus, "resolved");
  });

  it("create-contact-from-conversation creates contact, links identity, and resolves conversation", async () => {
    const unresolved = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "website_chat",
        externalIdentityId: "chat-lead",
        hints: { displayName: "Casey New", email: "casey@example.com", phone: "+1 (555) 444-3322" }
      })
    );

    const contact = await service.createContactFromConversation({
      orgId: "org-1",
      conversationId: unresolved.conversation.id,
      actorUserId: "staff-1",
      displayName: "Casey New",
      email: "casey@example.com",
      phone: "+1 (555) 444-3322"
    });

    assert.equal(contact.displayName, "Casey New");
    const identity = state.identities.find((row) => row.id === unresolved.identity.id);
    const conversation = state.conversations.find((row) => row.id === unresolved.conversation.id);
    assert.equal(identity?.contactId, contact.id);
    assert.equal(conversation?.contactId, contact.id);
    assert.equal(conversation?.resolutionStatus, "resolved");
  });

  it("merge reassigns identities, conversations, and messages and soft-retires source", async () => {
    const source = state.seedContact({ orgId: "org-1", displayName: "Source Person", primaryEmail: "source@example.com" });
    const target = state.seedContact({ orgId: "org-1", displayName: "Target Person", primaryEmail: "target@example.com" });
    const sourceIdentity = state.seedIdentity({
      orgId: "org-1",
      channelType: "sms",
      externalId: "sms-source",
      contactId: source.id
    });
    const conversation = state.seedConversation({
      orgId: "org-1",
      channelType: "sms",
      channelIdentityId: sourceIdentity.id,
      contactId: source.id,
      resolutionStatus: "resolved"
    });
    state.seedMessage({
      orgId: "org-1",
      conversationId: conversation.id,
      contactId: source.id,
      channelIdentityId: sourceIdentity.id
    });

    await service.mergeContacts({
      orgId: "org-1",
      sourceContactId: source.id,
      targetContactId: target.id,
      strategy: {
        displayName: "Canonical Name"
      }
    });

    const updatedConversation = state.conversations.find((row) => row.id === conversation.id);
    const movedIdentity = state.identities.find((row) => row.id === sourceIdentity.id);
    const updatedSource = state.contacts.find((row) => row.id === source.id);
    const updatedTarget = state.contacts.find((row) => row.id === target.id);

    assert.equal(updatedConversation?.contactId, target.id);
    assert.equal(movedIdentity?.contactId, target.id);
    assert.equal(updatedSource?.status, "merged");
    assert.equal(updatedSource?.mergedIntoContactId, target.id);
    assert.ok(updatedSource?.deletedAt);
    assert.equal(updatedTarget?.displayName, "Canonical Name");
  });

  it("org isolation prevents cross-org links", async () => {
    const foreignContact = state.seedContact({ orgId: "org-2", displayName: "Other Org Contact" });
    const unresolved = await service.resolveInboundIdentity(
      inboundPayload({
        orgId: "org-1",
        channelType: "facebook_messenger",
        externalIdentityId: "fb-isolation"
      })
    );

    await assert.rejects(
      service.linkChannelIdentityToContact({
        orgId: "org-1",
        conversationId: unresolved.conversation.id,
        identityId: unresolved.identity.id,
        contactId: foreignContact.id,
        actorUserId: "staff-1",
        source: "manual"
      }),
      /CONTACT_NOT_FOUND/
    );
  });

  it("merge handles duplicate channel identity collisions safely", async () => {
    const source = state.seedContact({ orgId: "org-1", displayName: "Dup Source" });
    const target = state.seedContact({ orgId: "org-1", displayName: "Dup Target" });
    state.seedIdentity({
      orgId: "org-1",
      channelType: "email",
      externalId: "dup@example.com",
      contactId: source.id
    });
    state.seedIdentity({
      orgId: "org-1",
      channelType: "email",
      externalId: "dup@example.com",
      contactId: target.id
    });

    await service.mergeContacts({
      orgId: "org-1",
      sourceContactId: source.id,
      targetContactId: target.id,
      strategy: {}
    });

    const duplicates = state.identities.filter(
      (row) =>
        row.orgId === "org-1" &&
        row.channelType === "email" &&
        row.externalId === "dup@example.com" &&
        row.contactId === target.id
    );
    assert.equal(duplicates.length, 1);
  });

  it("writes audit and resolution history for admin actions", async () => {
    const contact = state.seedContact({ orgId: "org-1", displayName: "Audit Contact" });

    const unresolved = await service.resolveInboundIdentity(
      inboundPayload({
        channelType: "website_chat",
        externalIdentityId: "chat-audit",
        hints: { displayName: "Audit Contact" }
      })
    );

    const suggestion = state.suggestions.find((row) => row.conversationId === unresolved.conversation.id);
    assert.ok(suggestion);

    await service.rejectSuggestion({
      orgId: "org-1",
      conversationId: unresolved.conversation.id,
      suggestionId: suggestion!.id,
      actorUserId: "staff-1"
    });

    await service.linkChannelIdentityToContact({
      orgId: "org-1",
      conversationId: unresolved.conversation.id,
      identityId: unresolved.identity.id,
      contactId: contact.id,
      actorUserId: "staff-1",
      source: "manual"
    });

    await service.unlinkChannelIdentityFromContact({
      orgId: "org-1",
      identityId: unresolved.identity.id,
      actorUserId: "staff-1"
    });

    await service.dismissConversationSuggestions({
      orgId: "org-1",
      conversationId: unresolved.conversation.id,
      actorUserId: "staff-1"
    });

    await service.createContactFromConversation({
      orgId: "org-1",
      conversationId: unresolved.conversation.id,
      actorUserId: "staff-1",
      displayName: "Audit Created"
    });

    const actions = state.audits.map((row) => row.action);
    assert.ok(actions.includes("communications.suggestion_rejected"));
    assert.ok(actions.includes("communications.identity_linked"));
    assert.ok(actions.includes("communications.identity_unlinked"));
    assert.ok(actions.includes("communications.suggestions_dismissed"));
    assert.ok(actions.includes("communications.contact_created_from_conversation"));

    const eventTypes = state.events.map((row) => row.eventType);
    assert.ok(eventTypes.includes("suggestion_rejected"));
    assert.ok(eventTypes.includes("identity_linked"));
    assert.ok(eventTypes.includes("identity_unlinked"));
    assert.ok(eventTypes.includes("contact_created_from_conversation"));
  });
});
