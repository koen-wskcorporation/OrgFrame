import { createSupabaseServer } from "@/lib/supabase/server";
import { createInboxItems } from "@/modules/calendar/db/queries";

async function listTeamStaffRecipients(teamId: string): Promise<string[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("program_team_staff")
    .select("user_id")
    .eq("team_id", teamId);

  if (error) {
    throw new Error(`Failed to load team staff recipients: ${error.message}`);
  }

  return Array.from(new Set((data ?? []).map((row) => row.user_id).filter((value): value is string => typeof value === "string")));
}

async function listOrgAdminRecipients(orgId: string): Promise<string[]> {
  const supabase = await createSupabaseServer();
  const { data, error } = await supabase
    .from("org_memberships")
    .select("user_id")
    .eq("org_id", orgId)
    .eq("role", "admin");

  if (error) {
    throw new Error(`Failed to load org admin recipients: ${error.message}`);
  }

  return Array.from(new Set((data ?? []).map((row) => row.user_id).filter((value): value is string => typeof value === "string")));
}

function uniqueRecipients(...lists: string[][]) {
  return Array.from(new Set(lists.flat().filter(Boolean)));
}

export async function notifyInviteSent(input: {
  orgId: string;
  occurrenceId: string;
  hostTeamId: string;
  invitedTeamId: string;
  actorUserId: string;
  title: string;
}) {
  const [invitedStaff, hostStaff] = await Promise.all([listTeamStaffRecipients(input.invitedTeamId), listTeamStaffRecipients(input.hostTeamId)]);
  const recipients = uniqueRecipients(invitedStaff, hostStaff).filter((userId) => userId !== input.actorUserId);

  await createInboxItems(
    recipients.map((recipientUserId) => ({
      orgId: input.orgId,
      recipientUserId,
      itemType: "calendar.invite.sent",
      title: input.title,
      body: "A team practice invite is waiting for your response.",
      href: null,
      payloadJson: {
        occurrenceId: input.occurrenceId,
        invitedTeamId: input.invitedTeamId,
        hostTeamId: input.hostTeamId
      },
      createdBy: input.actorUserId
    }))
  );
}

export async function notifyInviteResponded(input: {
  orgId: string;
  occurrenceId: string;
  hostTeamId: string;
  invitedTeamId: string;
  actorUserId: string;
  response: "accepted" | "declined";
  title: string;
}) {
  const [hostStaff, orgAdmins] = await Promise.all([listTeamStaffRecipients(input.hostTeamId), listOrgAdminRecipients(input.orgId)]);
  const recipients = uniqueRecipients(hostStaff, orgAdmins).filter((userId) => userId !== input.actorUserId);

  await createInboxItems(
    recipients.map((recipientUserId) => ({
      orgId: input.orgId,
      recipientUserId,
      itemType: `calendar.invite.${input.response}`,
      title: input.title,
      body: `An invited team has ${input.response} the shared practice invite.`,
      href: null,
      payloadJson: {
        occurrenceId: input.occurrenceId,
        invitedTeamId: input.invitedTeamId,
        hostTeamId: input.hostTeamId,
        response: input.response
      },
      createdBy: input.actorUserId
    }))
  );
}

export async function notifyOccurrenceCancelled(input: {
  orgId: string;
  occurrenceId: string;
  hostTeamId: string;
  actorUserId: string;
  title: string;
}) {
  const [hostStaff, orgAdmins] = await Promise.all([listTeamStaffRecipients(input.hostTeamId), listOrgAdminRecipients(input.orgId)]);
  const recipients = uniqueRecipients(hostStaff, orgAdmins).filter((userId) => userId !== input.actorUserId);

  await createInboxItems(
    recipients.map((recipientUserId) => ({
      orgId: input.orgId,
      recipientUserId,
      itemType: "calendar.occurrence.cancelled",
      title: input.title,
      body: "A shared practice booking was cancelled.",
      href: null,
      payloadJson: {
        occurrenceId: input.occurrenceId,
        hostTeamId: input.hostTeamId
      },
      createdBy: input.actorUserId
    }))
  );
}
