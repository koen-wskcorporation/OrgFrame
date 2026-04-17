import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import type {
  CommChannelIntegration,
  CommChannelIdentity,
  CommChannelType,
  CommContact,
  CommConversation,
  CommDirection,
  ContactMatchReasonCode,
  CommMatchStatus,
  CommMatchSuggestion,
  CommMessage,
  CommResolutionEvent,
  CommResolutionStatus,
  CommSuggestionWithContact,
  InboxConversationDetail,
  InboxConversationListItem
} from "@/src/features/communications/types";

const contactSelect =
  "id, org_id, auth_user_id, display_name, first_name, last_name, primary_email, primary_phone, avatar_url, status, source, notes, metadata_json, merged_into_contact_id, deleted_at, created_at, updated_at";
const identitySelect =
  "id, org_id, contact_id, channel_type, external_id, external_username, normalized_value, display_label, identity_metadata, is_verified, linked_at, last_seen_at, created_at, updated_at";
const conversationSelect =
  "id, org_id, channel_type, external_thread_id, contact_id, channel_identity_id, resolution_status, subject, preview_text, last_message_at, assigned_to_user_id, archived_at, conversation_metadata, created_at, updated_at";
const messageSelect =
  "id, org_id, conversation_id, contact_id, channel_identity_id, direction, external_message_id, body_text, body_html, attachments_json, sender_label, sent_at, delivery_status, message_metadata, created_at, updated_at";
const suggestionSelect =
  "id, org_id, conversation_id, channel_identity_id, suggested_contact_id, confidence_score, confidence_reason_codes, status, created_at, decided_at, decided_by_user_id";
const eventSelect = "id, org_id, conversation_id, channel_identity_id, contact_id, actor_user_id, event_type, event_detail_json, created_at";
const integrationSelect =
  "id, org_id, channel_type, provider, provider_account_id, provider_account_name, status, connected_by_user_id, connected_at, disconnected_at, last_sync_at, last_error, config_json, encrypted_access_token, token_hint, created_at, updated_at";

type ContactRow = {
  id: string;
  org_id: string;
  auth_user_id: string | null;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null;
  primary_phone: string | null;
  avatar_url: string | null;
  status: "active" | "unresolved" | "merged" | "archived";
  source: string;
  notes: string | null;
  metadata_json: unknown;
  merged_into_contact_id: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
};

type IdentityRow = {
  id: string;
  org_id: string;
  contact_id: string | null;
  channel_type: CommChannelType;
  external_id: string;
  external_username: string | null;
  normalized_value: string | null;
  display_label: string | null;
  identity_metadata: unknown;
  is_verified: boolean;
  linked_at: string | null;
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
};

type ConversationRow = {
  id: string;
  org_id: string;
  channel_type: CommChannelType;
  external_thread_id: string | null;
  contact_id: string | null;
  channel_identity_id: string | null;
  resolution_status: CommResolutionStatus;
  subject: string | null;
  preview_text: string | null;
  last_message_at: string;
  assigned_to_user_id: string | null;
  archived_at: string | null;
  conversation_metadata: unknown;
  created_at: string;
  updated_at: string;
};

type MessageRow = {
  id: string;
  org_id: string;
  conversation_id: string;
  contact_id: string | null;
  channel_identity_id: string | null;
  direction: CommDirection;
  external_message_id: string | null;
  body_text: string;
  body_html: string | null;
  attachments_json: unknown;
  sender_label: string | null;
  sent_at: string;
  delivery_status: string | null;
  message_metadata: unknown;
  created_at: string;
  updated_at: string;
};

type SuggestionRow = {
  id: string;
  org_id: string;
  conversation_id: string;
  channel_identity_id: string;
  suggested_contact_id: string;
  confidence_score: number;
  confidence_reason_codes: unknown;
  status: CommMatchStatus;
  created_at: string;
  decided_at: string | null;
  decided_by_user_id: string | null;
};

type EventRow = {
  id: string;
  org_id: string;
  conversation_id: string | null;
  channel_identity_id: string | null;
  contact_id: string | null;
  actor_user_id: string | null;
  event_type: string;
  event_detail_json: unknown;
  created_at: string;
};

type IntegrationRow = {
  id: string;
  org_id: string;
  channel_type: CommChannelType;
  provider: string;
  provider_account_id: string;
  provider_account_name: string | null;
  status: "active" | "disconnected" | "error";
  connected_by_user_id: string | null;
  connected_at: string;
  disconnected_at: string | null;
  last_sync_at: string | null;
  last_error: string | null;
  config_json: unknown;
  encrypted_access_token?: string | null;
  token_hint?: string | null;
  created_at: string;
  updated_at: string;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as Record<string, unknown>;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asReasonCodes(value: unknown): ContactMatchReasonCode[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (typeof item !== "string") {
      return [];
    }

    return [item as ContactMatchReasonCode];
  });
}

function mapContact(row: ContactRow): CommContact {
  return {
    id: row.id,
    orgId: row.org_id,
    authUserId: row.auth_user_id,
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    primaryEmail: row.primary_email,
    primaryPhone: row.primary_phone,
    avatarUrl: row.avatar_url,
    status: row.status,
    source: row.source,
    notes: row.notes,
    metadataJson: asObject(row.metadata_json),
    mergedIntoContactId: row.merged_into_contact_id,
    deletedAt: row.deleted_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapIdentity(row: IdentityRow): CommChannelIdentity {
  return {
    id: row.id,
    orgId: row.org_id,
    contactId: row.contact_id,
    channelType: row.channel_type,
    externalId: row.external_id,
    externalUsername: row.external_username,
    normalizedValue: row.normalized_value,
    displayLabel: row.display_label,
    identityMetadata: asObject(row.identity_metadata),
    isVerified: row.is_verified,
    linkedAt: row.linked_at,
    lastSeenAt: row.last_seen_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapConversation(row: ConversationRow): CommConversation {
  return {
    id: row.id,
    orgId: row.org_id,
    channelType: row.channel_type,
    externalThreadId: row.external_thread_id,
    contactId: row.contact_id,
    channelIdentityId: row.channel_identity_id,
    resolutionStatus: row.resolution_status,
    subject: row.subject,
    previewText: row.preview_text,
    lastMessageAt: row.last_message_at,
    assignedToUserId: row.assigned_to_user_id,
    archivedAt: row.archived_at,
    conversationMetadata: asObject(row.conversation_metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapMessage(row: MessageRow): CommMessage {
  return {
    id: row.id,
    orgId: row.org_id,
    conversationId: row.conversation_id,
    contactId: row.contact_id,
    channelIdentityId: row.channel_identity_id,
    direction: row.direction,
    externalMessageId: row.external_message_id,
    bodyText: row.body_text,
    bodyHtml: row.body_html,
    attachmentsJson: asArray(row.attachments_json),
    senderLabel: row.sender_label,
    sentAt: row.sent_at,
    deliveryStatus: row.delivery_status,
    messageMetadata: asObject(row.message_metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapSuggestion(row: SuggestionRow) {
  return {
    id: row.id,
    orgId: row.org_id,
    conversationId: row.conversation_id,
    channelIdentityId: row.channel_identity_id,
    suggestedContactId: row.suggested_contact_id,
    confidenceScore: Number(row.confidence_score ?? 0),
    confidenceReasonCodes: asReasonCodes(row.confidence_reason_codes),
    status: row.status,
    createdAt: row.created_at,
    decidedAt: row.decided_at,
    decidedByUserId: row.decided_by_user_id
  };
}

function mapEvent(row: EventRow): CommResolutionEvent {
  return {
    id: row.id,
    orgId: row.org_id,
    conversationId: row.conversation_id,
    channelIdentityId: row.channel_identity_id,
    contactId: row.contact_id,
    actorUserId: row.actor_user_id,
    eventType: row.event_type,
    eventDetailJson: asObject(row.event_detail_json),
    createdAt: row.created_at
  };
}

function mapIntegration(row: IntegrationRow & { token_hint?: string | null }): CommChannelIntegration {
  return {
    id: row.id,
    orgId: row.org_id,
    channelType: row.channel_type,
    provider: row.provider,
    providerAccountId: row.provider_account_id,
    providerAccountName: row.provider_account_name,
    status: row.status,
    connectedByUserId: row.connected_by_user_id,
    connectedAt: row.connected_at,
    disconnectedAt: row.disconnected_at,
    lastSyncAt: row.last_sync_at,
    lastError: row.last_error,
    configJson: asObject(row.config_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    tokenHint: typeof row.token_hint === "string" ? row.token_hint : null
  };
}

async function getSupabase(client?: SupabaseClient<any>) {
  if (client) {
    return client;
  }
  return createSupabaseServer();
}

export async function resolveOrgIdFromSlug(orgSlug: string, client?: SupabaseClient<any>) {
  const supabase = await getSupabase(client);
  const { data, error } = await supabase.schema("orgs").from("orgs").select("id").eq("slug", orgSlug).maybeSingle();

  if (error) {
    throw new Error(`Failed to resolve org slug: ${error.message}`);
  }

  return data?.id ?? null;
}

export async function listChannelIntegrations(
  orgId: string,
  channelType?: CommChannelType,
  client?: SupabaseClient<any>
): Promise<CommChannelIntegration[]> {
  const supabase = await getSupabase(client);

  let request = supabase.schema("communications").from("channel_integrations").select(integrationSelect).eq("org_id", orgId).order("updated_at", { ascending: false });
  if (channelType) {
    request = request.eq("channel_type", channelType);
  }

  const { data, error } = await request;
  if (error) {
    throw new Error(`Failed to list channel integrations: ${error.message}`);
  }
  return (data ?? []).map((row) => mapIntegration(row as IntegrationRow));
}

export async function findActiveChannelIntegrationByProviderAccount(input: {
  channelType: CommChannelType;
  providerAccountId: string;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("channel_integrations")
    .select(integrationSelect)
    .eq("channel_type", input.channelType)
    .eq("provider_account_id", input.providerAccountId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load active integration by provider account: ${error.message}`);
  }

  return data ? mapIntegration(data as IntegrationRow) : null;
}

export async function upsertChannelIntegration(input: {
  orgId: string;
  channelType: CommChannelType;
  provider: string;
  providerAccountId: string;
  providerAccountName?: string | null;
  status: "active" | "disconnected" | "error";
  connectedByUserId?: string | null;
  disconnectedAt?: string | null;
  lastSyncAt?: string | null;
  lastError?: string | null;
  configJson?: Record<string, unknown>;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);

  const { data, error } = await supabase
    .schema("communications").from("channel_integrations")
    .upsert(
      {
        org_id: input.orgId,
        channel_type: input.channelType,
        provider: input.provider,
        provider_account_id: input.providerAccountId,
        provider_account_name: input.providerAccountName ?? null,
        status: input.status,
        connected_by_user_id: input.connectedByUserId ?? null,
        disconnected_at: input.disconnectedAt ?? null,
        last_sync_at: input.lastSyncAt ?? null,
        last_error: input.lastError ?? null,
        config_json: input.configJson ?? {},
        connected_at: input.status === "active" ? new Date().toISOString() : undefined
      },
      {
        onConflict: "org_id,channel_type,provider_account_id"
      }
    )
    .select(integrationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to upsert channel integration: ${error.message}`);
  }

  return mapIntegration(data as IntegrationRow);
}

export async function markChannelIntegrationDisconnected(input: {
  orgId: string;
  integrationId: string;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const now = new Date().toISOString();
  const { data, error } = await supabase
    .schema("communications").from("channel_integrations")
    .update({
      status: "disconnected",
      disconnected_at: now
    })
    .eq("org_id", input.orgId)
    .eq("id", input.integrationId)
    .select(integrationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to disconnect channel integration: ${error.message}`);
  }

  return mapIntegration(data as IntegrationRow);
}

export async function updateChannelIntegrationSyncState(input: {
  orgId: string;
  integrationId: string;
  lastSyncAt?: string | null;
  lastError?: string | null;
  status?: "active" | "disconnected" | "error";
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const payload: Record<string, unknown> = {};
  if (input.lastSyncAt !== undefined) payload.last_sync_at = input.lastSyncAt;
  if (input.lastError !== undefined) payload.last_error = input.lastError;
  if (input.status !== undefined) payload.status = input.status;

  const { data, error } = await supabase
    .schema("communications").from("channel_integrations")
    .update(payload)
    .eq("org_id", input.orgId)
    .eq("id", input.integrationId)
    .select(integrationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update channel integration state: ${error.message}`);
  }

  return mapIntegration(data as IntegrationRow);
}

export async function upsertChannelIntegrationSecret(input: {
  orgId: string;
  integrationId: string;
  encryptedAccessToken: string;
  tokenHint?: string | null;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { error } = await supabase
    .schema("communications").from("channel_integrations")
    .update({
      encrypted_access_token: input.encryptedAccessToken,
      token_hint: input.tokenHint ?? null
    })
    .eq("org_id", input.orgId)
    .eq("id", input.integrationId);

  if (error) {
    throw new Error(`Failed to upsert channel integration secret: ${error.message}`);
  }
}

export async function getChannelIntegrationSecret(input: { orgId: string; integrationId: string; client?: SupabaseClient<any> }) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("channel_integrations")
    .select("id, org_id, encrypted_access_token, token_hint")
    .eq("org_id", input.orgId)
    .eq("id", input.integrationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load channel integration secret: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  if (!data.encrypted_access_token) {
    return null;
  }

  return {
    integrationId: String(data.id),
    orgId: String(data.org_id),
    encryptedAccessToken: String(data.encrypted_access_token),
    tokenHint: (data.token_hint as string | null) ?? null
  };
}

export async function deleteChannelIntegrationSecret(input: { orgId: string; integrationId: string; client?: SupabaseClient<any> }) {
  const supabase = await getSupabase(input.client);
  const { error } = await supabase
    .schema("communications").from("channel_integrations")
    .update({
      encrypted_access_token: null,
      token_hint: null
    })
    .eq("org_id", input.orgId)
    .eq("id", input.integrationId);

  if (error) {
    throw new Error(`Failed to delete channel integration secret: ${error.message}`);
  }
}

export async function findCommContactById(orgId: string, contactId: string, client?: SupabaseClient<any>): Promise<CommContact | null> {
  const supabase = await getSupabase(client);
  const { data, error } = await supabase
    .schema("people").from("contacts")
    .select(contactSelect)
    .eq("org_id", orgId)
    .eq("id", contactId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load contact: ${error.message}`);
  }

  return data ? mapContact(data as ContactRow) : null;
}

export async function findCommContactByAuthUserId(orgId: string, authUserId: string, client?: SupabaseClient<any>) {
  const supabase = await getSupabase(client);
  const { data, error } = await supabase
    .schema("people").from("contacts")
    .select(contactSelect)
    .eq("org_id", orgId)
    .eq("auth_user_id", authUserId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load contact by auth user: ${error.message}`);
  }

  return data ? mapContact(data as ContactRow) : null;
}

export async function searchCommContacts(orgId: string, query: string, limit = 20, client?: SupabaseClient<any>) {
  const supabase = await getSupabase(client);
  const trimmed = query.trim();
  let request = supabase
    .schema("people").from("contacts")
    .select(contactSelect)
    .eq("org_id", orgId)
    .is("deleted_at", null)
    .neq("status", "merged")
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (trimmed.length > 0) {
    const escaped = trimmed.replace(/,/g, "");
    request = request.or(`display_name.ilike.%${escaped}%,primary_email.ilike.%${escaped}%,primary_phone.ilike.%${escaped}%`);
  }

  const { data, error } = await request;

  if (error) {
    throw new Error(`Failed to search contacts: ${error.message}`);
  }

  return (data ?? []).map((row) => mapContact(row as ContactRow));
}

export async function listMatchingContacts(input: {
  orgId: string;
  authUserId?: string | null;
  normalizedEmail?: string | null;
  normalizedPhone?: string | null;
  displayName?: string | null;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const contactsById = new Map<string, CommContact>();

  async function runAndCollect(
    query: PromiseLike<{
      data: unknown[] | null;
      error: { message: string } | null;
    }>
  ) {
    const { data, error } = await query;
    if (error) {
      throw new Error(`Failed to list matching contacts: ${error.message}`);
    }
    for (const row of data ?? []) {
      const mapped = mapContact(row as ContactRow);
      contactsById.set(mapped.id, mapped);
    }
  }

  if (input.authUserId) {
    await runAndCollect(
      supabase
        .schema("people").from("contacts")
        .select(contactSelect)
        .eq("org_id", input.orgId)
        .eq("auth_user_id", input.authUserId)
        .is("deleted_at", null)
        .neq("status", "merged")
        .limit(5)
    );
  }

  if (input.normalizedEmail) {
    await runAndCollect(
      supabase
        .schema("people").from("contacts")
        .select(contactSelect)
        .eq("org_id", input.orgId)
        .ilike("primary_email", input.normalizedEmail)
        .is("deleted_at", null)
        .neq("status", "merged")
        .limit(25)
    );
  }

  if (input.normalizedPhone) {
    await runAndCollect(
      supabase
        .schema("people").from("contacts")
        .select(contactSelect)
        .eq("org_id", input.orgId)
        .eq("primary_phone", input.normalizedPhone)
        .is("deleted_at", null)
        .neq("status", "merged")
        .limit(25)
    );
  }

  if (input.displayName && input.displayName.trim().length > 0) {
    await runAndCollect(
      supabase
        .schema("people").from("contacts")
        .select(contactSelect)
        .eq("org_id", input.orgId)
        .ilike("display_name", `%${input.displayName.trim()}%`)
        .is("deleted_at", null)
        .neq("status", "merged")
        .limit(30)
    );
  }

  if (contactsById.size < 10) {
    await runAndCollect(
      supabase
        .schema("people").from("contacts")
        .select(contactSelect)
        .eq("org_id", input.orgId)
        .is("deleted_at", null)
        .neq("status", "merged")
        .order("updated_at", { ascending: false })
        .limit(20)
    );
  }

  return [...contactsById.values()];
}

export async function createCommContact(input: {
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
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("people").from("contacts")
    .insert({
      org_id: input.orgId,
      auth_user_id: input.authUserId ?? null,
      display_name: input.displayName,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      primary_email: input.primaryEmail ?? null,
      primary_phone: input.primaryPhone ?? null,
      source: input.source,
      notes: input.notes ?? null,
      metadata_json: input.metadataJson ?? {}
    })
    .select(contactSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create contact: ${error.message}`);
  }

  return mapContact(data as ContactRow);
}

export async function updateCommContact(input: {
  orgId: string;
  contactId: string;
  displayName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  primaryEmail?: string | null;
  primaryPhone?: string | null;
  notes?: string | null;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const payload: Record<string, unknown> = {};

  if (input.displayName !== undefined) payload.display_name = input.displayName;
  if (input.firstName !== undefined) payload.first_name = input.firstName;
  if (input.lastName !== undefined) payload.last_name = input.lastName;
  if (input.primaryEmail !== undefined) payload.primary_email = input.primaryEmail;
  if (input.primaryPhone !== undefined) payload.primary_phone = input.primaryPhone;
  if (input.notes !== undefined) payload.notes = input.notes;

  const { data, error } = await supabase
    .schema("people").from("contacts")
    .update(payload)
    .eq("org_id", input.orgId)
    .eq("id", input.contactId)
    .select(contactSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update contact: ${error.message}`);
  }

  return mapContact(data as ContactRow);
}

export async function findIdentityByExternal(input: {
  orgId: string;
  channelType: CommChannelType;
  externalId: string;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("channel_identities")
    .select(identitySelect)
    .eq("org_id", input.orgId)
    .eq("channel_type", input.channelType)
    .eq("external_id", input.externalId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load identity: ${error.message}`);
  }

  return data ? mapIdentity(data as IdentityRow) : null;
}

export async function findIdentityById(orgId: string, identityId: string, client?: SupabaseClient<any>) {
  const supabase = await getSupabase(client);
  const { data, error } = await supabase
    .schema("communications").from("channel_identities")
    .select(identitySelect)
    .eq("org_id", orgId)
    .eq("id", identityId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load identity: ${error.message}`);
  }

  return data ? mapIdentity(data as IdentityRow) : null;
}

export async function upsertIdentity(input: {
  orgId: string;
  channelType: CommChannelType;
  externalId: string;
  externalUsername?: string | null;
  normalizedValue?: string | null;
  displayLabel?: string | null;
  isVerified?: boolean;
  identityMetadata?: Record<string, unknown>;
  contactId?: string | null;
  linkedAt?: string | null;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("channel_identities")
    .upsert(
      {
        org_id: input.orgId,
        channel_type: input.channelType,
        external_id: input.externalId,
        external_username: input.externalUsername ?? null,
        normalized_value: input.normalizedValue ?? null,
        display_label: input.displayLabel ?? null,
        is_verified: input.isVerified ?? false,
        identity_metadata: input.identityMetadata ?? {},
        contact_id: input.contactId ?? null,
        linked_at: input.linkedAt ?? null,
        last_seen_at: new Date().toISOString()
      },
      {
        onConflict: "org_id,channel_type,external_id"
      }
    )
    .select(identitySelect)
    .single();

  if (error) {
    throw new Error(`Failed to upsert identity: ${error.message}`);
  }

  return mapIdentity(data as IdentityRow);
}

export async function linkIdentityToContact(input: {
  orgId: string;
  identityId: string;
  contactId: string;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const timestamp = new Date().toISOString();
  const { data, error } = await supabase
    .schema("communications").from("channel_identities")
    .update({
      contact_id: input.contactId,
      linked_at: timestamp,
      last_seen_at: timestamp
    })
    .eq("org_id", input.orgId)
    .eq("id", input.identityId)
    .select(identitySelect)
    .single();

  if (error) {
    throw new Error(`Failed to link identity: ${error.message}`);
  }

  return mapIdentity(data as IdentityRow);
}

export async function unlinkIdentity(input: { orgId: string; identityId: string; client?: SupabaseClient<any> }) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("channel_identities")
    .update({
      contact_id: null,
      linked_at: null
    })
    .eq("org_id", input.orgId)
    .eq("id", input.identityId)
    .select(identitySelect)
    .single();

  if (error) {
    throw new Error(`Failed to unlink identity: ${error.message}`);
  }

  return mapIdentity(data as IdentityRow);
}

export async function findConversationById(orgId: string, conversationId: string, client?: SupabaseClient<any>) {
  const supabase = await getSupabase(client);
  const { data, error } = await supabase
    .schema("communications").from("conversations")
    .select(conversationSelect)
    .eq("org_id", orgId)
    .eq("id", conversationId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load conversation: ${error.message}`);
  }

  return data ? mapConversation(data as ConversationRow) : null;
}

export async function findConversationByExternalThread(input: {
  orgId: string;
  channelType: CommChannelType;
  externalThreadId: string;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("conversations")
    .select(conversationSelect)
    .eq("org_id", input.orgId)
    .eq("channel_type", input.channelType)
    .eq("external_thread_id", input.externalThreadId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load conversation by thread: ${error.message}`);
  }

  return data ? mapConversation(data as ConversationRow) : null;
}

export async function findMostRecentConversationByIdentity(input: {
  orgId: string;
  channelIdentityId: string;
  channelType: CommChannelType;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("conversations")
    .select(conversationSelect)
    .eq("org_id", input.orgId)
    .eq("channel_type", input.channelType)
    .eq("channel_identity_id", input.channelIdentityId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load conversation by identity: ${error.message}`);
  }

  return data ? mapConversation(data as ConversationRow) : null;
}

export async function createConversation(input: {
  orgId: string;
  channelType: CommChannelType;
  externalThreadId?: string | null;
  contactId?: string | null;
  channelIdentityId?: string | null;
  resolutionStatus: CommResolutionStatus;
  subject?: string | null;
  previewText?: string | null;
  conversationMetadata?: Record<string, unknown>;
  lastMessageAt?: string;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("conversations")
    .insert({
      org_id: input.orgId,
      channel_type: input.channelType,
      external_thread_id: input.externalThreadId ?? null,
      contact_id: input.contactId ?? null,
      channel_identity_id: input.channelIdentityId ?? null,
      resolution_status: input.resolutionStatus,
      subject: input.subject ?? null,
      preview_text: input.previewText ?? null,
      conversation_metadata: input.conversationMetadata ?? {},
      last_message_at: input.lastMessageAt ?? new Date().toISOString()
    })
    .select(conversationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to create conversation: ${error.message}`);
  }

  return mapConversation(data as ConversationRow);
}

export async function updateConversation(input: {
  orgId: string;
  conversationId: string;
  contactId?: string | null;
  channelIdentityId?: string | null;
  resolutionStatus?: CommResolutionStatus;
  subject?: string | null;
  previewText?: string | null;
  lastMessageAt?: string;
  conversationMetadata?: Record<string, unknown>;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const payload: Record<string, unknown> = {};

  if (input.contactId !== undefined) payload.contact_id = input.contactId;
  if (input.channelIdentityId !== undefined) payload.channel_identity_id = input.channelIdentityId;
  if (input.resolutionStatus !== undefined) payload.resolution_status = input.resolutionStatus;
  if (input.subject !== undefined) payload.subject = input.subject;
  if (input.previewText !== undefined) payload.preview_text = input.previewText;
  if (input.lastMessageAt !== undefined) payload.last_message_at = input.lastMessageAt;
  if (input.conversationMetadata !== undefined) payload.conversation_metadata = input.conversationMetadata;

  const { data, error } = await supabase
    .schema("communications").from("conversations")
    .update(payload)
    .eq("org_id", input.orgId)
    .eq("id", input.conversationId)
    .select(conversationSelect)
    .single();

  if (error) {
    throw new Error(`Failed to update conversation: ${error.message}`);
  }

  return mapConversation(data as ConversationRow);
}

export async function upsertInboundMessage(input: {
  orgId: string;
  conversationId: string;
  contactId?: string | null;
  channelIdentityId?: string | null;
  direction: CommDirection;
  externalMessageId?: string | null;
  bodyText: string;
  bodyHtml?: string | null;
  attachmentsJson?: unknown[];
  senderLabel?: string | null;
  sentAt: string;
  deliveryStatus?: string | null;
  messageMetadata?: Record<string, unknown>;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase
    .schema("communications").from("messages")
    .upsert(
      {
        org_id: input.orgId,
        conversation_id: input.conversationId,
        contact_id: input.contactId ?? null,
        channel_identity_id: input.channelIdentityId ?? null,
        direction: input.direction,
        external_message_id: input.externalMessageId ?? null,
        body_text: input.bodyText,
        body_html: input.bodyHtml ?? null,
        attachments_json: input.attachmentsJson ?? [],
        sender_label: input.senderLabel ?? null,
        sent_at: input.sentAt,
        delivery_status: input.deliveryStatus ?? null,
        message_metadata: input.messageMetadata ?? {}
      },
      {
        onConflict: "org_id,conversation_id,external_message_id"
      }
    )
    .select(messageSelect)
    .single();

  if (error) {
    throw new Error(`Failed to upsert message: ${error.message}`);
  }

  return mapMessage(data as MessageRow);
}

export async function replaceConversationSuggestions(input: {
  orgId: string;
  conversationId: string;
  channelIdentityId: string;
  suggestions: Array<{
    suggestedContactId: string;
    confidenceScore: number;
    confidenceReasonCodes: ContactMatchReasonCode[];
  }>;
  client?: SupabaseClient<any>;
}): Promise<CommMatchSuggestion[]> {
  void input;
  return [];
}

export async function setSuggestionStatus(input: {
  orgId: string;
  suggestionId: string;
  status: CommMatchStatus;
  decidedByUserId?: string | null;
  client?: SupabaseClient<any>;
}): Promise<CommMatchSuggestion> {
  void input;
  throw new Error("SUGGESTIONS_DISABLED");
}

export async function getConversationSuggestions(orgId: string, conversationId: string, client?: SupabaseClient<any>): Promise<CommSuggestionWithContact[]> {
  void orgId;
  void conversationId;
  void client;
  return [];
}

export async function createResolutionEvent(input: {
  orgId: string;
  conversationId?: string | null;
  channelIdentityId?: string | null;
  contactId?: string | null;
  actorUserId?: string | null;
  eventType: string;
  eventDetailJson?: Record<string, unknown>;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { error } = await supabase.schema("communications").from("resolution_events").insert({
    org_id: input.orgId,
    conversation_id: input.conversationId ?? null,
    channel_identity_id: input.channelIdentityId ?? null,
    contact_id: input.contactId ?? null,
    actor_user_id: input.actorUserId ?? null,
    event_type: input.eventType,
    event_detail_json: input.eventDetailJson ?? {}
  });

  if (error) {
    throw new Error(`Failed to create resolution event: ${error.message}`);
  }
}

export async function createCommAuditLog(input: {
  orgId: string;
  actorUserId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  detailJson?: Record<string, unknown>;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { error } = await supabase.schema("ai").from("audit_logs").insert({
    org_id: input.orgId,
    actor_user_id: input.actorUserId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId ?? null,
    detail_json: input.detailJson ?? {}
  });

  if (error) {
    throw new Error(`Failed to write communications audit log: ${error.message}`);
  }
}

export async function mergeContactsViaRpc(input: {
  orgId: string;
  sourceContactId: string;
  targetContactId: string;
  strategy: Record<string, unknown>;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { data, error } = await supabase.rpc("org_comm_merge_contacts", {
    input_org_id: input.orgId,
    input_source_contact_id: input.sourceContactId,
    input_target_contact_id: input.targetContactId,
    input_strategy: input.strategy
  });

  if (error) {
    throw new Error(`Failed to merge contacts: ${error.message}`);
  }

  return data;
}

export async function listInboxConversations(orgId: string, limit = 100, client?: SupabaseClient<any>): Promise<InboxConversationListItem[]> {
  const supabase = await getSupabase(client);
  const { data, error } = await supabase
    .schema("communications").from("conversations")
    .select(conversationSelect)
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("last_message_at", { ascending: false })
    .limit(limit);

  if (error) {
    throw new Error(`Failed to list inbox conversations: ${error.message}`);
  }

  const conversations = (data ?? []).map((row) => mapConversation(row as ConversationRow));
  if (conversations.length === 0) {
    return [];
  }

  const identityIds = [...new Set(conversations.map((item) => item.channelIdentityId).filter(Boolean) as string[])];
  const contactIds = [...new Set(conversations.map((item) => item.contactId).filter(Boolean) as string[])];
  const conversationIds = conversations.map((item) => item.id);

  const [identityRows, contactRows] = await Promise.all([
    identityIds.length > 0
      ? supabase.schema("communications").from("channel_identities").select(identitySelect).eq("org_id", orgId).in("id", identityIds)
      : Promise.resolve({ data: [], error: null }),
    contactIds.length > 0
      ? supabase.schema("people").from("contacts").select(contactSelect).eq("org_id", orgId).in("id", contactIds)
      : Promise.resolve({ data: [], error: null })
  ]);

  if (identityRows.error) {
    throw new Error(`Failed to load conversation identities: ${identityRows.error.message}`);
  }
  if (contactRows.error) {
    throw new Error(`Failed to load conversation contacts: ${contactRows.error.message}`);
  }
  const identitiesById = new Map((identityRows.data ?? []).map((row) => [row.id as string, mapIdentity(row as IdentityRow)]));
  const contactsById = new Map((contactRows.data ?? []).map((row) => [row.id as string, mapContact(row as ContactRow)]));
  void conversationIds;

  return conversations.map((conversation) => ({
    conversation,
    identity: conversation.channelIdentityId ? identitiesById.get(conversation.channelIdentityId) ?? null : null,
    contact: conversation.contactId ? contactsById.get(conversation.contactId) ?? null : null,
    pendingSuggestionCount: 0
  }));
}

export async function getInboxConversationDetail(orgId: string, conversationId: string, client?: SupabaseClient<any>): Promise<InboxConversationDetail | null> {
  const supabase = await getSupabase(client);
  const conversation = await findConversationById(orgId, conversationId, supabase);

  if (!conversation) {
    return null;
  }

  const [identity, contact, messagesRows, suggestions, eventsRows] = await Promise.all([
    conversation.channelIdentityId ? findIdentityById(orgId, conversation.channelIdentityId, supabase) : Promise.resolve(null),
    conversation.contactId ? findCommContactById(orgId, conversation.contactId, supabase) : Promise.resolve(null),
    supabase
      .schema("communications").from("messages")
      .select(messageSelect)
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .order("sent_at", { ascending: true }),
    getConversationSuggestions(orgId, conversationId, supabase),
    supabase
      .schema("communications").from("resolution_events")
      .select(eventSelect)
      .eq("org_id", orgId)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(50)
  ]);

  if (messagesRows.error) {
    throw new Error(`Failed to load conversation messages: ${messagesRows.error.message}`);
  }

  if (eventsRows.error) {
    throw new Error(`Failed to load resolution history: ${eventsRows.error.message}`);
  }

  return {
    conversation,
    identity,
    contact,
    messages: (messagesRows.data ?? []).map((row) => mapMessage(row as MessageRow)),
    suggestions,
    history: (eventsRows.data ?? []).map((row) => mapEvent(row as EventRow))
  };
}

export async function listIdentityConversations(orgId: string, identityId: string, client?: SupabaseClient<any>) {
  const supabase = await getSupabase(client);
  const { data, error } = await supabase
    .schema("communications").from("conversations")
    .select(conversationSelect)
    .eq("org_id", orgId)
    .eq("channel_identity_id", identityId)
    .order("last_message_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to list identity conversations: ${error.message}`);
  }

  return (data ?? []).map((row) => mapConversation(row as ConversationRow));
}

export async function updateConversationsForIdentity(input: {
  orgId: string;
  identityId: string;
  contactId: string | null;
  resolutionStatus: CommResolutionStatus;
  client?: SupabaseClient<any>;
}) {
  const supabase = await getSupabase(input.client);
  const { error } = await supabase
    .schema("communications").from("conversations")
    .update({
      contact_id: input.contactId,
      resolution_status: input.resolutionStatus
    })
    .eq("org_id", input.orgId)
    .eq("channel_identity_id", input.identityId);

  if (error) {
    throw new Error(`Failed to update conversations for identity: ${error.message}`);
  }
}

export async function expirePendingSuggestionsForConversation(input: {
  orgId: string;
  conversationId: string;
  decidedByUserId?: string | null;
  client?: SupabaseClient<any>;
}) {
  void input;
}

export async function rejectAllOtherPendingSuggestions(input: {
  orgId: string;
  conversationId: string;
  acceptedContactId: string;
  decidedByUserId?: string | null;
  client?: SupabaseClient<any>;
}) {
  void input;
}

export async function acceptPendingSuggestionsForConversationContact(input: {
  orgId: string;
  conversationId: string;
  contactId: string;
  decidedByUserId?: string | null;
  client?: SupabaseClient<any>;
}) {
  void input;
}

export async function getIdentityByConversation(orgId: string, conversationId: string, client?: SupabaseClient<any>) {
  const conversation = await findConversationById(orgId, conversationId, client);
  if (!conversation || !conversation.channelIdentityId) {
    return null;
  }

  return findIdentityById(orgId, conversation.channelIdentityId, client);
}

export async function listResolutionEventsForConversation(orgId: string, conversationId: string, client?: SupabaseClient<any>) {
  const supabase = await getSupabase(client);
  const { data, error } = await supabase
    .schema("communications").from("resolution_events")
    .select(eventSelect)
    .eq("org_id", orgId)
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    throw new Error(`Failed to list resolution events: ${error.message}`);
  }

  return (data ?? []).map((row) => mapEvent(row as EventRow));
}
