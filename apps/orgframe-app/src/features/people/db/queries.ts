import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseServer } from "@/src/shared/data-api/server";
import type {
  PeopleDirectoryResult,
  PeopleProfile,
  PeopleProfileAddress,
  PeopleProfileLink,
  PeopleProfileStatus,
  PeopleProfileType,
  PeopleRelationshipType,
  PeopleInviteStatus
} from "@/src/features/people/types";

const PROFILE_COLUMNS =
  "id, person_user_id, org_id, profile_type, status, display_name, first_name, last_name, dob, email, sex, school, grade, avatar_path, address_json, metadata_json, created_at, updated_at";

type ProfileRow = {
  id: string;
  person_user_id: string | null;
  org_id: string | null;
  profile_type: PeopleProfileType;
  status: PeopleProfileStatus;
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  dob: string | null;
  email: string | null;
  sex: string | null;
  school: string | null;
  grade: string | null;
  avatar_path: string | null;
  address_json: unknown;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

type LinkRow = {
  id: string;
  org_id: string | null;
  account_user_id: string | null;
  profile_id: string;
  relationship_type: PeopleRelationshipType;
  can_manage: boolean;
  pending_invite_email: string | null;
  invite_status: PeopleInviteStatus;
  metadata_json: unknown;
  created_at: string;
  updated_at: string;
};

const LINK_COLUMNS =
  "id, org_id, account_user_id, profile_id, relationship_type, can_manage, pending_invite_email, invite_status, metadata_json, created_at, updated_at";

type MembershipRow = {
  id: string;
  user_id: string;
  role: string;
  created_at: string | null;
};

type UserProfileRow = {
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_path: string | null;
};

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return value as Record<string, unknown>;
}

function mapProfile(row: ProfileRow): PeopleProfile {
  return {
    id: row.id,
    personUserId: row.person_user_id,
    orgId: row.org_id,
    profileType: row.profile_type,
    status: row.status,
    displayName: row.display_name,
    firstName: row.first_name,
    lastName: row.last_name,
    dob: row.dob,
    email: row.email,
    sex: row.sex,
    school: row.school,
    grade: row.grade,
    avatarPath: row.avatar_path,
    addressJson: asObject(row.address_json) as PeopleProfileAddress,
    metadataJson: asObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapLink(row: LinkRow): PeopleProfileLink {
  return {
    id: row.id,
    orgId: row.org_id,
    accountUserId: row.account_user_id,
    profileId: row.profile_id,
    relationshipType: row.relationship_type,
    canManage: row.can_manage,
    pendingInviteEmail: row.pending_invite_email,
    inviteStatus: row.invite_status,
    metadataJson: asObject(row.metadata_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function listProfilesForAccount(userId: string): Promise<Array<{ profile: PeopleProfile; links: PeopleProfileLink[] }>> {
  const supabase = await createSupabaseServer();
  const { data: linksData, error: linksError } = await supabase
    .schema("people")
    .from("profile_links")
    .select(LINK_COLUMNS)
    .eq("account_user_id", userId)
    .order("created_at", { ascending: true });

  if (linksError) {
    throw new Error(`Failed to list profile links: ${linksError.message}`);
  }

  const links = (linksData ?? []).map((row) => mapLink(row as LinkRow));
  if (links.length === 0) {
    return [];
  }

  const profileIds = Array.from(new Set(links.map((link) => link.profileId)));
  const { data: profilesData, error: profilesError } = await supabase
    .schema("people")
    .from("profiles")
    .select(PROFILE_COLUMNS)
    .in("id", profileIds);

  if (profilesError) {
    throw new Error(`Failed to list profiles: ${profilesError.message}`);
  }

  const profilesById = new Map((profilesData ?? []).map((row) => {
    const profile = mapProfile(row as ProfileRow);
    return [profile.id, profile] as const;
  }));

  return profileIds
    .map((profileId) => {
      const profile = profilesById.get(profileId);
      if (!profile) {
        return null;
      }

      return {
        profile,
        links: links.filter((link) => link.profileId === profileId)
      };
    })
    .filter((item): item is { profile: PeopleProfile; links: PeopleProfileLink[] } => Boolean(item));
}

export async function listPeopleDirectoryForOrg(input: {
  orgId: string;
  page?: number;
  pageSize?: number;
  supabase?: SupabaseClient<any>;
}): Promise<PeopleDirectoryResult> {
  const page = input.page && input.page > 0 ? input.page : 1;
  const pageSize = input.pageSize && input.pageSize > 0 ? Math.min(input.pageSize, 100) : 25;
  const start = (page - 1) * pageSize;
  const end = start + pageSize - 1;

  const supabase = input.supabase ?? (await createSupabaseServer());
  const { data: membershipsData, error: membershipsError, count } = await supabase
    .schema("orgs")
    .from("memberships")
    .select("id, user_id, role, created_at", { count: "exact" })
    .eq("org_id", input.orgId)
    .order("created_at", { ascending: true })
    .range(start, end);

  if (membershipsError) {
    throw new Error(`Failed to list memberships: ${membershipsError.message}`);
  }

  const memberships = (membershipsData ?? []) as MembershipRow[];
  const accountIds = memberships.map((membership) => membership.user_id);

  const noAccountSentinel = ["00000000-0000-0000-0000-000000000000"];
  const accountIdFilter = accountIds.length > 0 ? accountIds : noAccountSentinel;

  // Pull both org-scoped links AND each member's account-scoped links
  // (org_id IS NULL). The account-scoped links are where each user's
  // self-profile + dependents live — those are the "profile" the user
  // sees in /profiles, and the org directory should surface them too.
  const [orgLinksRes, accountLinksRes] = await Promise.all([
    supabase
      .schema("people")
      .from("profile_links")
      .select(LINK_COLUMNS)
      .eq("org_id", input.orgId)
      .in("account_user_id", accountIdFilter),
    supabase
      .schema("people")
      .from("profile_links")
      .select(LINK_COLUMNS)
      .is("org_id", null)
      .in("account_user_id", accountIdFilter)
  ]);

  if (orgLinksRes.error) {
    throw new Error(`Failed to list profile links: ${orgLinksRes.error.message}`);
  }
  if (accountLinksRes.error) {
    throw new Error(`Failed to list account-scoped profile links: ${accountLinksRes.error.message}`);
  }

  const orgLinks = (orgLinksRes.data ?? []).map((row) => mapLink(row as LinkRow));
  const accountLinks = (accountLinksRes.data ?? []).map((row) => mapLink(row as LinkRow));
  const links = [...orgLinks, ...accountLinks];
  const profileIds = Array.from(new Set(links.map((link) => link.profileId)));
  const userProfiles =
    accountIds.length === 0
      ? []
      : await (async () => {
          const { data, error } = await supabase
            .schema("people")
            .from("users")
            .select("user_id, first_name, last_name, avatar_path")
            .in("user_id", accountIds);

          if (error) {
            throw new Error(`Failed to list account profiles: ${error.message}`);
          }

          return (data ?? []) as UserProfileRow[];
        })();

  // Fetch every linked profile by id — both org-scoped and account-scoped
  // (org_id IS NULL) — since `links` now contains both kinds. The link
  // tying each profile to its account already lives in `profile_links`.
  const profiles =
    profileIds.length === 0
      ? []
      : await (async () => {
          const { data, error } = await supabase
            .schema("people")
            .from("profiles")
            .select(PROFILE_COLUMNS)
            .in("id", profileIds);

          if (error) {
            throw new Error(`Failed to list profiles: ${error.message}`);
          }

          return (data ?? []).map((row) => mapProfile(row as ProfileRow));
        })();

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile] as const));
  const userProfilesById = new Map(userProfiles.map((profile) => [profile.user_id, profile] as const));

  const accounts = memberships.map((membership) => {
    const userProfile = userProfilesById.get(membership.user_id) ?? null;
    const linked = links.filter((link) => link.accountUserId === membership.user_id);
    const linkedProfileIds = Array.from(new Set(linked.map((link) => link.profileId)));

    return {
      userId: membership.user_id,
      email: null,
      phone: null,
      firstName: userProfile?.first_name ?? null,
      lastName: userProfile?.last_name ?? null,
      avatarPath: userProfile?.avatar_path ?? null,
      avatarUrl: null,
      role: membership.role,
      status: "active" as const,
      joinedAt: membership.created_at,
      lastActivityAt: membership.created_at,
      profiles: linkedProfileIds
        .map((profileId) => {
          const profile = profilesById.get(profileId);
          if (!profile) {
            return null;
          }

          return {
            profile,
            links: linked
              .filter((link) => link.profileId === profileId)
              .sort((a, b) => {
                if (a.relationshipType === "self") return -1;
                if (b.relationshipType === "self") return 1;
                return a.relationshipType.localeCompare(b.relationshipType);
              })
          };
        })
        .filter((item): item is { profile: PeopleProfile; links: PeopleProfileLink[] } => Boolean(item))
    };
  });

  return {
    accounts,
    totalAccounts: count ?? accounts.length,
    page,
    pageSize
  };
}

export async function createProfileRecord(input: {
  orgId: string | null;
  personUserId: string | null;
  profileType: PeopleProfileType;
  status?: PeopleProfileStatus;
  displayName: string;
  firstName?: string | null;
  lastName?: string | null;
  dob?: string | null;
  email?: string | null;
  sex?: string | null;
  school?: string | null;
  grade?: string | null;
  avatarPath?: string | null;
  addressJson?: PeopleProfileAddress;
  metadataJson?: Record<string, unknown>;
  supabase?: SupabaseClient<any>;
}): Promise<PeopleProfile> {
  const supabase = input.supabase ?? (await createSupabaseServer());
  const { data, error } = await supabase
    .schema("people")
    .from("profiles")
    .insert({
      org_id: input.orgId,
      person_user_id: input.personUserId,
      profile_type: input.profileType,
      status: input.status ?? "draft",
      display_name: input.displayName,
      first_name: input.firstName ?? null,
      last_name: input.lastName ?? null,
      dob: input.dob ?? null,
      email: input.email ?? null,
      sex: input.sex ?? null,
      school: input.school ?? null,
      grade: input.grade ?? null,
      avatar_path: input.avatarPath ?? null,
      address_json: input.addressJson ?? {},
      metadata_json: input.metadataJson ?? {}
    })
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to create profile: ${error.message}`);
  }

  return mapProfile(data as ProfileRow);
}

export async function updateProfileRecord(input: {
  profileId: string;
  displayName?: string;
  firstName?: string | null;
  lastName?: string | null;
  dob?: string | null;
  email?: string | null;
  sex?: string | null;
  school?: string | null;
  grade?: string | null;
  avatarPath?: string | null;
  addressJson?: PeopleProfileAddress;
  metadataJson?: Record<string, unknown>;
  supabase?: SupabaseClient<any>;
}): Promise<PeopleProfile> {
  const supabase = input.supabase ?? (await createSupabaseServer());
  const { data, error } = await supabase
    .schema("people")
    .from("profiles")
    .update({
      ...(input.displayName !== undefined ? { display_name: input.displayName } : {}),
      ...(input.firstName !== undefined ? { first_name: input.firstName } : {}),
      ...(input.lastName !== undefined ? { last_name: input.lastName } : {}),
      ...(input.dob !== undefined ? { dob: input.dob } : {}),
      ...(input.email !== undefined ? { email: input.email } : {}),
      ...(input.sex !== undefined ? { sex: input.sex } : {}),
      ...(input.school !== undefined ? { school: input.school } : {}),
      ...(input.grade !== undefined ? { grade: input.grade } : {}),
      ...(input.avatarPath !== undefined ? { avatar_path: input.avatarPath } : {}),
      ...(input.addressJson !== undefined ? { address_json: input.addressJson } : {}),
      ...(input.metadataJson !== undefined ? { metadata_json: input.metadataJson } : {})
    })
    .eq("id", input.profileId)
    .select(PROFILE_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to update profile: ${error.message}`);
  }

  return mapProfile(data as ProfileRow);
}

export async function linkProfileRecord(input: {
  orgId: string | null;
  accountUserId: string | null;
  profileId: string;
  relationshipType: PeopleRelationshipType;
  canManage?: boolean;
  pendingInviteEmail?: string | null;
  inviteStatus?: PeopleInviteStatus;
  metadataJson?: Record<string, unknown>;
  supabase?: SupabaseClient<any>;
}): Promise<PeopleProfileLink> {
  const supabase = input.supabase ?? (await createSupabaseServer());
  const { data, error } = await supabase
    .schema("people")
    .from("profile_links")
    .upsert(
      {
        org_id: input.orgId,
        account_user_id: input.accountUserId,
        profile_id: input.profileId,
        relationship_type: input.relationshipType,
        can_manage: input.canManage ?? true,
        pending_invite_email: input.pendingInviteEmail ?? null,
        invite_status: input.inviteStatus ?? "accepted",
        metadata_json: input.metadataJson ?? {}
      },
      {
        onConflict: "org_id,account_user_id,profile_id,relationship_type"
      }
    )
    .select(LINK_COLUMNS)
    .single();

  if (error) {
    throw new Error(`Failed to link profile: ${error.message}`);
  }

  return mapLink(data as LinkRow);
}

export async function transitionProfileStatusRecord(input: {
  profileId: string;
  nextStatus: PeopleProfileStatus;
  source?: string;
  detailJson?: Record<string, unknown>;
}): Promise<PeopleProfile> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase.rpc("transition_profile_status", {
    input_profile_id: input.profileId,
    input_next_status: input.nextStatus,
    input_source: input.source ?? "manual",
    input_detail: input.detailJson ?? {}
  });

  if (error) {
    throw new Error(`Failed to transition profile status: ${error.message}`);
  }

  return mapProfile(data as ProfileRow);
}
