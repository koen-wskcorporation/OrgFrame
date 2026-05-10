import "server-only";

import {
  createOptionalSupabaseServiceRoleClient,
  createSupabaseServer
} from "@/src/shared/data-api/server";
import type {
  PeopleProfile,
  PeopleProfileLink,
  PeopleRelationshipType
} from "@/src/features/people/types";

const PROFILE_COLUMNS =
  "id, person_user_id, org_id, profile_type, status, display_name, first_name, last_name, dob, email, sex, school, grade, avatar_path, address_json, metadata_json, created_at, updated_at";

const LINK_COLUMNS =
  "id, org_id, account_user_id, profile_id, relationship_type, can_manage, pending_invite_email, invite_status, metadata_json, created_at, updated_at";

function asObject<T = Record<string, unknown>>(value: unknown): T {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {} as T;
  }
  return value as T;
}

function mapProfile(row: any): PeopleProfile {
  return {
    id: row.id,
    personUserId: row.person_user_id ?? null,
    orgId: row.org_id ?? null,
    profileType: row.profile_type,
    status: row.status,
    displayName: row.display_name,
    firstName: row.first_name ?? null,
    lastName: row.last_name ?? null,
    dob: row.dob ?? null,
    email: row.email ?? null,
    sex: row.sex ?? null,
    school: row.school ?? null,
    grade: row.grade ?? null,
    avatarPath: row.avatar_path ?? null,
    addressJson: asObject(row.address_json),
    metadataJson: asObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapLink(row: any): PeopleProfileLink {
  return {
    id: row.id,
    orgId: row.org_id ?? null,
    accountUserId: row.account_user_id ?? null,
    profileId: row.profile_id,
    relationshipType: row.relationship_type,
    canManage: row.can_manage,
    pendingInviteEmail: row.pending_invite_email ?? null,
    inviteStatus: row.invite_status,
    metadataJson: asObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export type AccountProfileShare = {
  link: PeopleProfileLink;
  /** Full name when the link is bound to an existing account, otherwise null. */
  displayName: string | null;
};

export type AccountProfileRecord = {
  profile: PeopleProfile;
  myLink: PeopleProfileLink;
  shares: AccountProfileShare[];
  avatarUrl: string | null;
};

type AccountUserRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
};

async function fetchAccountUser(userId: string): Promise<AccountUserRow | null> {
  const service = createOptionalSupabaseServiceRoleClient();
  const client = service ?? (await createSupabaseServer());
  const { data } = await client
    .schema("people")
    .from("users")
    .select("user_id, first_name, last_name, avatar_path")
    .eq("user_id", userId)
    .maybeSingle();
  return (data ?? null) as AccountUserRow | null;
}

/**
 * Make sure the signed-in user has the non-removable "self" profile that
 * mirrors their account. Idempotent: creates the profile + self link if
 * missing, and keeps the profile's first/last/avatar in sync with the
 * account row each load. Service role required.
 */
export async function ensureSelfProfile(userId: string): Promise<void> {
  const service = createOptionalSupabaseServiceRoleClient();
  if (!service) return;

  const account = await fetchAccountUser(userId);
  const firstName = account?.first_name?.trim() || null;
  const lastName = account?.last_name?.trim() || null;
  const avatarPath = account?.avatar_path?.trim() || null;
  const displayName = [firstName, lastName].filter(Boolean).join(" ").trim() || "You";

  const { data: existingLink } = await service
    .schema("people")
    .from("profile_links")
    .select("id, profile_id")
    .eq("account_user_id", userId)
    .is("org_id", null)
    .eq("relationship_type", "self")
    .maybeSingle();

  if (existingLink?.profile_id) {
    // Keep the self profile's identity fields in sync with the account row.
    await service
      .schema("people")
      .from("profiles")
      .update({
        display_name: displayName,
        first_name: firstName,
        last_name: lastName,
        avatar_path: avatarPath
      })
      .eq("id", existingLink.profile_id);
    return;
  }

  const { data: created, error: createErr } = await service
    .schema("people")
    .from("profiles")
    .insert({
      org_id: null,
      person_user_id: userId,
      profile_type: "player",
      status: "active",
      display_name: displayName,
      first_name: firstName,
      last_name: lastName,
      avatar_path: avatarPath,
      address_json: {},
      metadata_json: { managed: "account" }
    })
    .select("id")
    .single();
  if (createErr || !created) return;

  await service
    .schema("people")
    .from("profile_links")
    .insert({
      org_id: null,
      account_user_id: userId,
      profile_id: created.id,
      relationship_type: "self",
      can_manage: true,
      invite_status: "accepted",
      metadata_json: {}
    });
}

async function resolveAvatarUrls(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const service = createOptionalSupabaseServiceRoleClient();
  const client = service ?? (await createSupabaseServer());
  await Promise.all(
    paths.map(async (path) => {
      const { data, error } = await client.storage.from("account-assets").createSignedUrl(path, 60 * 60);
      if (!error && data?.signedUrl) result.set(path, data.signedUrl);
    })
  );
  return result;
}

export async function listAccountProfiles(userId: string): Promise<AccountProfileRecord[]> {
  await ensureSelfProfile(userId);
  const supabase = await createSupabaseServer();
  const { data: linksData, error: linksError } = await supabase
    .schema("people")
    .from("profile_links")
    .select(LINK_COLUMNS)
    .eq("account_user_id", userId)
    .is("org_id", null)
    .order("created_at", { ascending: true });

  if (linksError) {
    throw new Error(linksError.message);
  }

  const myLinks = (linksData ?? []).map(mapLink);
  if (myLinks.length === 0) return [];

  const profileIds = Array.from(new Set(myLinks.map((l) => l.profileId)));
  const { data: profilesData, error: profilesError } = await supabase
    .schema("people")
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", profileIds);

  if (profilesError) throw new Error(profilesError.message);

  const profiles = (profilesData ?? []).map(mapProfile);
  const profileById = new Map(profiles.map((p) => [p.id, p] as const));

  // Pull all share links for those profiles via service role so the user sees who they shared with.
  const service = createOptionalSupabaseServiceRoleClient();
  const allLinks: PeopleProfileLink[] = service
    ? await (async () => {
        const { data, error } = await service
          .schema("people")
          .from("profile_links")
          .select(LINK_COLUMNS)
          .in("profile_id", profileIds);
        if (error) throw new Error(error.message);
        return (data ?? []).map(mapLink);
      })()
    : myLinks;

  const avatarPaths = profiles
    .map((p) => p.avatarPath)
    .filter((v): v is string => Boolean(v && v.trim().length > 0));
  const avatarUrlByPath = await resolveAvatarUrls(avatarPaths);

  // Resolve linked account display names for shared links.
  const sharedAccountIds = Array.from(
    new Set(
      allLinks
        .filter((l) => l.accountUserId && !myLinks.some((m) => m.id === l.id))
        .map((l) => l.accountUserId as string)
    )
  );
  const nameByUserId = new Map<string, string>();
  if (sharedAccountIds.length > 0 && service) {
    const { data, error } = await service
      .schema("people")
      .from("users")
      .select("user_id, first_name, last_name")
      .in("user_id", sharedAccountIds);
    if (!error) {
      for (const row of (data ?? []) as Array<{ user_id: string; first_name: string | null; last_name: string | null }>) {
        const full = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
        if (full) nameByUserId.set(row.user_id, full);
      }
    }
  }

  return myLinks
    .map((myLink) => {
      const profile = profileById.get(myLink.profileId);
      if (!profile) return null;
      const shares: AccountProfileShare[] = allLinks
        .filter((l) => l.profileId === profile.id && l.id !== myLink.id)
        .map((link) => ({
          link,
          displayName: link.accountUserId ? (nameByUserId.get(link.accountUserId) ?? null) : null
        }));
      return {
        profile,
        myLink,
        shares,
        avatarUrl: profile.avatarPath ? (avatarUrlByPath.get(profile.avatarPath) ?? null) : null
      };
    })
    .filter((x): x is AccountProfileRecord => Boolean(x));
}

export async function getAccountProfile(userId: string, profileId: string): Promise<AccountProfileRecord | null> {
  const all = await listAccountProfiles(userId);
  return all.find((r) => r.profile.id === profileId) ?? null;
}

export async function findAuthUserByEmail(email: string): Promise<{ id: string; email: string | null } | null> {
  const service = createOptionalSupabaseServiceRoleClient();
  if (!service) return null;
  const target = email.trim().toLowerCase();
  const perPage = 200;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage });
    if (error) throw new Error(error.message);
    const found = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === target);
    if (found) return { id: found.id, email: found.email ?? null };
    if (data.users.length < perPage) break;
  }
  return null;
}

export type ShareRelationshipType = Exclude<PeopleRelationshipType, "self">;
