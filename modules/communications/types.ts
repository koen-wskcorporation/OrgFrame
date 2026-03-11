export type CommChannelType = "email" | "sms" | "facebook_messenger" | "website_chat" | "instagram" | "whatsapp" | "other";

export type CommResolutionStatus = "resolved" | "unresolved" | "suggested" | "ignored";

export type CommDirection = "inbound" | "outbound" | "system";

export type CommMatchStatus = "pending" | "accepted" | "rejected" | "expired" | "deferred";

export type CommChannelIntegrationStatus = "active" | "disconnected" | "error";

export type ContactMatchReasonCode =
  | "authenticated_claim"
  | "exact_primary_email"
  | "exact_primary_phone"
  | "exact_known_identity_email"
  | "exact_known_identity_phone"
  | "name_similarity"
  | "weak_display_name";

export type CommContact = {
  id: string;
  orgId: string;
  authUserId: string | null;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  primaryEmail: string | null;
  primaryPhone: string | null;
  avatarUrl: string | null;
  status: "active" | "unresolved" | "merged" | "archived";
  source: string;
  notes: string | null;
  metadataJson: Record<string, unknown>;
  mergedIntoContactId: string | null;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommChannelIdentity = {
  id: string;
  orgId: string;
  contactId: string | null;
  channelType: CommChannelType;
  externalId: string;
  externalUsername: string | null;
  normalizedValue: string | null;
  displayLabel: string | null;
  identityMetadata: Record<string, unknown>;
  isVerified: boolean;
  linkedAt: string | null;
  lastSeenAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CommConversation = {
  id: string;
  orgId: string;
  channelType: CommChannelType;
  externalThreadId: string | null;
  contactId: string | null;
  channelIdentityId: string | null;
  resolutionStatus: CommResolutionStatus;
  subject: string | null;
  previewText: string | null;
  lastMessageAt: string;
  assignedToUserId: string | null;
  archivedAt: string | null;
  conversationMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CommMessage = {
  id: string;
  orgId: string;
  conversationId: string;
  contactId: string | null;
  channelIdentityId: string | null;
  direction: CommDirection;
  externalMessageId: string | null;
  bodyText: string;
  bodyHtml: string | null;
  attachmentsJson: unknown[];
  senderLabel: string | null;
  sentAt: string;
  deliveryStatus: string | null;
  messageMetadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CommMatchSuggestion = {
  id: string;
  orgId: string;
  conversationId: string;
  channelIdentityId: string;
  suggestedContactId: string;
  confidenceScore: number;
  confidenceReasonCodes: ContactMatchReasonCode[];
  status: CommMatchStatus;
  createdAt: string;
  decidedAt: string | null;
  decidedByUserId: string | null;
};

export type CommResolutionEvent = {
  id: string;
  orgId: string;
  conversationId: string | null;
  channelIdentityId: string | null;
  contactId: string | null;
  actorUserId: string | null;
  eventType: string;
  eventDetailJson: Record<string, unknown>;
  createdAt: string;
};

export type CommChannelIntegration = {
  id: string;
  orgId: string;
  channelType: CommChannelType;
  provider: string;
  providerAccountId: string;
  providerAccountName: string | null;
  status: CommChannelIntegrationStatus;
  connectedByUserId: string | null;
  connectedAt: string;
  disconnectedAt: string | null;
  lastSyncAt: string | null;
  lastError: string | null;
  configJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  tokenHint: string | null;
};

export type CommSuggestionWithContact = {
  suggestion: CommMatchSuggestion;
  contact: CommContact;
};

export type InboxConversationListItem = {
  conversation: CommConversation;
  identity: CommChannelIdentity | null;
  contact: CommContact | null;
  pendingSuggestionCount: number;
};

export type InboxConversationDetail = {
  conversation: CommConversation;
  identity: CommChannelIdentity | null;
  contact: CommContact | null;
  messages: CommMessage[];
  suggestions: CommSuggestionWithContact[];
  history: CommResolutionEvent[];
};

export type InboxWorkspaceReadModel = {
  conversations: InboxConversationListItem[];
  selectedConversation: InboxConversationDetail | null;
};

export type InboundIdentityHints = {
  email?: string | null;
  phone?: string | null;
  displayName?: string | null;
  authUserId?: string | null;
  metadata?: Record<string, unknown>;
};

export type InboundIngressPayload = {
  orgId: string;
  channelType: CommChannelType;
  externalIdentityId: string;
  externalThreadId: string | null;
  externalMessageId: string | null;
  direction: CommDirection;
  bodyText: string;
  bodyHtml: string | null;
  senderLabel: string | null;
  sentAt: string;
  identityExternalUsername: string | null;
  identityDisplayLabel: string | null;
  identityNormalizedValue: string | null;
  identityIsVerified: boolean;
  identityMetadata: Record<string, unknown>;
  messageMetadata: Record<string, unknown>;
  hints: InboundIdentityHints;
};

export type ContactCandidate = {
  contact: CommContact;
  score: number;
  reasons: ContactMatchReasonCode[];
};
