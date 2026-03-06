"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Chip } from "@/components/ui/chip";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import type { ProgramNode, ProgramTeamMember, ProgramTeamStaff, ProgramTeamSummary } from "@/modules/programs/types";
import {
  addTeamMemberAction,
  addTeamStaffAction,
  getTeamDetailAction,
  removeTeamMemberAction,
  removeTeamStaffAction,
  updateTeamMemberAction,
  updateTeamProfileAction
} from "@/modules/programs/teams/actions";
import type { ProgramTeamDetail } from "@/modules/programs/teams/types";

type TeamDetailPanelProps = {
  orgSlug: string;
  teamId: string | null;
  open: boolean;
  canWrite: boolean;
  nodes: ProgramNode[];
  onClose: () => void;
  onSummaryChange?: (update: { teamId: string; team: ProgramTeamSummary["team"]; memberCount: number; staffCount: number }) => void;
};

type RosterDraft = {
  status: ProgramTeamMember["status"];
  role: ProgramTeamMember["role"];
  jerseyNumber: string;
  position: string;
  notes: string;
};

type StaffDraft = {
  role: ProgramTeamStaff["role"];
  isPrimary: boolean;
  notes: string;
};

const rosterStatusOptions = [
  { value: "active", label: "Active" },
  { value: "pending", label: "Pending" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "removed", label: "Removed" }
];

const rosterRoleOptions = [
  { value: "player", label: "Player" },
  { value: "alternate", label: "Alternate" },
  { value: "guest", label: "Guest" }
];

const staffRoleOptions = [
  { value: "head_coach", label: "Head coach" },
  { value: "assistant_coach", label: "Assistant coach" },
  { value: "manager", label: "Manager" },
  { value: "trainer", label: "Trainer" },
  { value: "volunteer", label: "Volunteer" }
];

export function TeamDetailPanel({ orgSlug, teamId, open, canWrite, nodes, onClose, onSummaryChange }: TeamDetailPanelProps) {
  const { toast } = useToast();
  const [detail, setDetail] = useState<ProgramTeamDetail | null>(null);
  const [activeTab, setActiveTab] = useState<"roster" | "staff" | "settings">("roster");
  const [isLoading, startLoading] = useTransition();
  const [isSaving, startSaving] = useTransition();

  const [rosterDrafts, setRosterDrafts] = useState<Record<string, RosterDraft>>({});
  const [staffDrafts, setStaffDrafts] = useState<Record<string, StaffDraft>>({});

  const [newMemberPlayerId, setNewMemberPlayerId] = useState("");
  const [newMemberStatus, setNewMemberStatus] = useState<ProgramTeamMember["status"]>("active");
  const [newMemberRole, setNewMemberRole] = useState<ProgramTeamMember["role"]>("player");
  const [newStaffUserId, setNewStaffUserId] = useState("");
  const [newStaffRole, setNewStaffRole] = useState<ProgramTeamStaff["role"]>("assistant_coach");
  const [newStaffPrimary, setNewStaffPrimary] = useState(false);

  const [settingsDraft, setSettingsDraft] = useState({
    status: "active",
    teamCode: "",
    levelLabel: "",
    ageGroup: "",
    gender: "",
    colorPrimary: "",
    colorSecondary: "",
    homeFacilityId: "",
    notes: ""
  });

  const nodeById = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const divisionName = useMemo(() => {
    if (!detail?.node.parentId) {
      return "";
    }
    return nodeById.get(detail.node.parentId)?.name ?? "";
  }, [detail?.node.parentId, nodeById]);

  useEffect(() => {
    if (!open || !teamId) {
      setDetail(null);
      return;
    }

    startLoading(async () => {
      const result = await getTeamDetailAction({ orgSlug, teamId });
      if (!result.ok) {
        toast({
          title: "Unable to load team",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setDetail(result.data);
      setActiveTab("roster");
    });
  }, [open, teamId, orgSlug, toast]);

  useEffect(() => {
    if (!detail) {
      return;
    }

    setRosterDrafts(() =>
      Object.fromEntries(
        detail.roster.map((member) => [
          member.id,
          {
            status: member.status,
            role: member.role,
            jerseyNumber: member.jerseyNumber ?? "",
            position: member.position ?? "",
            notes: member.notes ?? ""
          }
        ])
      )
    );

    setStaffDrafts(() =>
      Object.fromEntries(
        detail.staff.map((staff) => [
          staff.id,
          {
            role: staff.role,
            isPrimary: staff.isPrimary,
            notes: staff.notes ?? ""
          }
        ])
      )
    );

    setSettingsDraft({
      status: detail.team.status,
      teamCode: detail.team.teamCode ?? "",
      levelLabel: detail.team.levelLabel ?? "",
      ageGroup: detail.team.ageGroup ?? "",
      gender: detail.team.gender ?? "",
      colorPrimary: detail.team.colorPrimary ?? "",
      colorSecondary: detail.team.colorSecondary ?? "",
      homeFacilityId: detail.team.homeFacilityId ?? "",
      notes: detail.team.notes ?? ""
    });
  }, [detail]);

  useEffect(() => {
    if (!detail || !onSummaryChange) {
      return;
    }

    const memberCount = detail.roster.filter((member) => member.status !== "removed").length;
    const staffCount = detail.staff.length;
    onSummaryChange({
      teamId: detail.team.id,
      team: detail.team,
      memberCount,
      staffCount
    });
  }, [detail, onSummaryChange]);

  function updateRosterDraft(memberId: string, next: Partial<RosterDraft>) {
    setRosterDrafts((current) => ({
      ...current,
      [memberId]: {
        ...current[memberId],
        ...next
      }
    }));
  }

  function updateStaffDraft(staffId: string, next: Partial<StaffDraft>) {
    setStaffDrafts((current) => ({
      ...current,
      [staffId]: {
        ...current[staffId],
        ...next
      }
    }));
  }

  async function handleSaveMember(memberId: string) {
    if (!detail) {
      return;
    }

    const draft = rosterDrafts[memberId];
    if (!draft) {
      return;
    }

    startSaving(async () => {
      const result = await updateTeamMemberAction({
        orgSlug,
        memberId,
        status: draft.status,
        role: draft.role,
        jerseyNumber: draft.jerseyNumber || null,
        position: draft.position || null,
        notes: draft.notes || null
      });

      if (!result.ok) {
        toast({
          title: "Unable to update roster",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setDetail((current) =>
        current
          ? {
              ...current,
              roster: current.roster.map((member) => (member.id === result.data.member.id ? { ...member, ...result.data.member } : member))
            }
          : current
      );

      toast({
        title: "Roster updated",
        variant: "success"
      });
    });
  }

  async function handleRemoveMember(memberId: string) {
    if (!detail) {
      return;
    }

    startSaving(async () => {
      const result = await removeTeamMemberAction({ orgSlug, memberId });
      if (!result.ok) {
        toast({
          title: "Unable to remove roster entry",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setDetail((current) =>
        current
          ? {
              ...current,
              roster: current.roster.map((member) => (member.id === memberId ? { ...member, status: "removed" } : member))
            }
          : current
      );

      toast({
        title: "Roster entry removed",
        variant: "success"
      });
    });
  }

  async function handleAddMember() {
    if (!detail || !newMemberPlayerId) {
      return;
    }

    const candidate = detail.rosterCandidates.find((item) => item.playerId === newMemberPlayerId);

    startSaving(async () => {
      const result = await addTeamMemberAction({
        orgSlug,
        teamId: detail.team.id,
        playerId: newMemberPlayerId,
        registrationId: candidate?.registrationId ?? null,
        status: newMemberStatus,
        role: newMemberRole
      });

      if (!result.ok) {
        toast({
          title: "Unable to add player",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      const player = candidate
        ? {
            id: candidate.playerId,
            label: candidate.label,
            subtitle: candidate.subtitle,
            dateOfBirth: null
          }
        : { id: result.data.member.playerId, label: "Player", subtitle: null, dateOfBirth: null };

      setDetail((current) =>
        current
          ? {
              ...current,
              roster: [
                ...current.roster,
                {
                  ...result.data.member,
                  player
                }
              ],
              rosterCandidates: current.rosterCandidates.filter((item) => item.playerId !== newMemberPlayerId)
            }
          : current
      );

      setNewMemberPlayerId("");
      setNewMemberStatus("active");
      setNewMemberRole("player");

      toast({
        title: "Player added",
        variant: "success"
      });
    });
  }

  async function handleSaveStaff(staffId: string) {
    if (!detail) {
      return;
    }

    const draft = staffDrafts[staffId];
    if (!draft) {
      return;
    }

    const staff = detail.staff.find((item) => item.id === staffId);
    if (!staff) {
      return;
    }

    startSaving(async () => {
      const result = await addTeamStaffAction({
        orgSlug,
        teamId: detail.team.id,
        userId: staff.userId,
        role: draft.role,
        isPrimary: draft.isPrimary,
        notes: draft.notes || null
      });

      if (!result.ok) {
        toast({
          title: "Unable to update staff",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setDetail((current) =>
        current
          ? {
              ...current,
              staff: current.staff.map((member) => (member.id === staffId ? { ...member, ...result.data.staff } : member))
            }
          : current
      );

      toast({
        title: "Staff updated",
        variant: "success"
      });
    });
  }

  async function handleRemoveStaff(staffId: string) {
    startSaving(async () => {
      const result = await removeTeamStaffAction({ orgSlug, staffId });
      if (!result.ok) {
        toast({
          title: "Unable to remove staff",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setDetail((current) =>
        current
          ? {
              ...current,
              staff: current.staff.filter((member) => member.id !== staffId)
            }
          : current
      );

      toast({
        title: "Staff removed",
        variant: "success"
      });
    });
  }

  async function handleAddStaff() {
    if (!detail || !newStaffUserId) {
      return;
    }

    startSaving(async () => {
      const result = await addTeamStaffAction({
        orgSlug,
        teamId: detail.team.id,
        userId: newStaffUserId,
        role: newStaffRole,
        isPrimary: newStaffPrimary
      });

      if (!result.ok) {
        toast({
          title: "Unable to add staff",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      const staffCandidate = detail.staffCandidates.find((candidate) => candidate.userId === newStaffUserId);

      setDetail((current) =>
        current
          ? {
              ...current,
              staff: [
                ...current.staff,
                {
                  ...result.data.staff,
                  email: staffCandidate?.email ?? null
                }
              ]
            }
          : current
      );

      setNewStaffUserId("");
      setNewStaffRole("assistant_coach");
      setNewStaffPrimary(false);

      toast({
        title: "Staff added",
        variant: "success"
      });
    });
  }

  async function handleSaveSettings() {
    if (!detail) {
      return;
    }

    startSaving(async () => {
      const result = await updateTeamProfileAction({
        orgSlug,
        teamId: detail.team.id,
        status: settingsDraft.status,
        teamCode: settingsDraft.teamCode || null,
        levelLabel: settingsDraft.levelLabel || null,
        ageGroup: settingsDraft.ageGroup || null,
        gender: settingsDraft.gender || null,
        colorPrimary: settingsDraft.colorPrimary || null,
        colorSecondary: settingsDraft.colorSecondary || null,
        homeFacilityId: settingsDraft.homeFacilityId || null,
        notes: settingsDraft.notes || null
      });

      if (!result.ok) {
        toast({
          title: "Unable to save settings",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setDetail((current) =>
        current
          ? {
              ...current,
              team: result.data.team
            }
          : current
      );

      toast({
        title: "Team settings saved",
        variant: "success"
      });
    });
  }

  const tabItems = [
    { value: "roster", label: "Roster" },
    { value: "staff", label: "Staff" },
    { value: "settings", label: "Settings" }
  ] as const;

  return (
    <Panel
      onClose={onClose}
      open={open}
      subtitle={divisionName ? `Division: ${divisionName}` : ""}
      title={detail?.node.name ?? "Team"}
    >
      {isLoading && !detail ? <p className="text-sm text-text-muted">Loading team details...</p> : null}
      {!detail && !isLoading ? <Alert variant="info">Select a team to view details.</Alert> : null}

      {detail ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            {tabItems.map((item) => (
              <button
                className={
                  item.value === activeTab
                    ? "rounded-control border border-border bg-surface-muted px-2 py-1 text-xs font-semibold text-text"
                    : "rounded-control border border-border bg-surface px-2 py-1 text-xs font-semibold text-text-muted hover:text-text"
                }
                key={item.value}
                onClick={() => setActiveTab(item.value)}
                type="button"
              >
                {item.label}
              </button>
            ))}
            <Chip>{detail.team.status}</Chip>
          </div>

          {activeTab === "roster" ? (
            <div className="space-y-3">
              {!canWrite ? <Alert variant="info">You have read-only access to roster details.</Alert> : null}

              {canWrite ? (
                <div className="rounded-control border bg-surface-muted p-3">
                  <p className="text-sm font-semibold text-text">Add player</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <Select
                      onChange={(event) => setNewMemberPlayerId(event.target.value)}
                      options={[
                        { value: "", label: "Select player" },
                        ...detail.rosterCandidates.map((candidate) => ({
                          value: candidate.playerId,
                          label: `${candidate.label}${candidate.subtitle ? ` (${candidate.subtitle})` : ""} · ${candidate.registrationStatus}`
                        }))
                      ]}
                      value={newMemberPlayerId}
                    />
                    <Select
                      onChange={(event) => setNewMemberStatus(event.target.value as ProgramTeamMember["status"])}
                      options={rosterStatusOptions}
                      value={newMemberStatus}
                    />
                    <Select
                      onChange={(event) => setNewMemberRole(event.target.value as ProgramTeamMember["role"])}
                      options={rosterRoleOptions}
                      value={newMemberRole}
                    />
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button disabled={!newMemberPlayerId} onClick={handleAddMember} size="sm" type="button">
                      Add player
                    </Button>
                  </div>
                </div>
              ) : null}

              {detail.roster.length === 0 ? <Alert variant="info">No roster entries yet.</Alert> : null}

              {detail.roster.map((member) => {
                const draft = rosterDrafts[member.id] ?? {
                  status: member.status,
                  role: member.role,
                  jerseyNumber: member.jerseyNumber ?? "",
                  position: member.position ?? "",
                  notes: member.notes ?? ""
                };

                return (
                  <div className="rounded-control border bg-surface p-3" key={member.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-text">{member.player.label}</p>
                        {member.player.subtitle ? <p className="text-xs text-text-muted">{member.player.subtitle}</p> : null}
                      </div>
                      <Chip>{member.status}</Chip>
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <FormField label="Status">
                        <Select
                          disabled={!canWrite}
                          onChange={(event) => updateRosterDraft(member.id, { status: event.target.value as ProgramTeamMember["status"] })}
                          options={rosterStatusOptions}
                          value={draft.status}
                        />
                      </FormField>
                      <FormField label="Role">
                        <Select
                          disabled={!canWrite}
                          onChange={(event) => updateRosterDraft(member.id, { role: event.target.value as ProgramTeamMember["role"] })}
                          options={rosterRoleOptions}
                          value={draft.role}
                        />
                      </FormField>
                      <FormField label="Jersey">
                        <Input
                          disabled={!canWrite}
                          onChange={(event) => updateRosterDraft(member.id, { jerseyNumber: event.target.value })}
                          value={draft.jerseyNumber}
                        />
                      </FormField>
                      <FormField label="Position">
                        <Input
                          disabled={!canWrite}
                          onChange={(event) => updateRosterDraft(member.id, { position: event.target.value })}
                          value={draft.position}
                        />
                      </FormField>
                    </div>
                    <FormField className="mt-3" label="Notes">
                      <Textarea
                        disabled={!canWrite}
                        onChange={(event) => updateRosterDraft(member.id, { notes: event.target.value })}
                        value={draft.notes}
                      />
                    </FormField>
                    {canWrite ? (
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button onClick={() => handleSaveMember(member.id)} size="sm" type="button" variant="secondary">
                          Save
                        </Button>
                        <Button onClick={() => handleRemoveMember(member.id)} size="sm" type="button" variant="ghost">
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {activeTab === "staff" ? (
            <div className="space-y-3">
              {!canWrite ? <Alert variant="info">You have read-only access to staff assignments.</Alert> : null}

              {canWrite ? (
                <div className="rounded-control border bg-surface-muted p-3">
                  <p className="text-sm font-semibold text-text">Add staff</p>
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <Select
                      onChange={(event) => setNewStaffUserId(event.target.value)}
                      options={[
                        { value: "", label: "Select staff" },
                        ...detail.staffCandidates.map((candidate) => ({
                          value: candidate.userId,
                          label: candidate.email ? `${candidate.email} (${candidate.role})` : `${candidate.userId} (${candidate.role})`
                        }))
                      ]}
                      value={newStaffUserId}
                    />
                    <Select
                      onChange={(event) => setNewStaffRole(event.target.value as ProgramTeamStaff["role"])}
                      options={staffRoleOptions}
                      value={newStaffRole}
                    />
                    <label className="ui-inline-toggle">
                      <Checkbox checked={newStaffPrimary} onChange={(event) => setNewStaffPrimary(event.target.checked)} />
                      Primary
                    </label>
                  </div>
                  <div className="mt-2 flex justify-end">
                    <Button disabled={!newStaffUserId} onClick={handleAddStaff} size="sm" type="button">
                      Add staff
                    </Button>
                  </div>
                </div>
              ) : null}

              {detail.staff.length === 0 ? <Alert variant="info">No staff assigned yet.</Alert> : null}

              {detail.staff.map((staff) => {
                const draft = staffDrafts[staff.id] ?? {
                  role: staff.role,
                  isPrimary: staff.isPrimary,
                  notes: staff.notes ?? ""
                };

                return (
                  <div className="rounded-control border bg-surface p-3" key={staff.id}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-semibold text-text">{staff.email ?? staff.userId}</p>
                        <p className="text-xs text-text-muted">{staff.role.replace("_", " ")}</p>
                      </div>
                      {staff.isPrimary ? <Chip>Primary</Chip> : null}
                    </div>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <FormField label="Role">
                        <Select
                          disabled={!canWrite}
                          onChange={(event) => updateStaffDraft(staff.id, { role: event.target.value as ProgramTeamStaff["role"] })}
                          options={staffRoleOptions}
                          value={draft.role}
                        />
                      </FormField>
                      <label className={cn("ui-inline-toggle", !canWrite && "opacity-60")}>
                        <Checkbox
                          checked={draft.isPrimary}
                          disabled={!canWrite}
                          onChange={(event) => updateStaffDraft(staff.id, { isPrimary: event.target.checked })}
                        />
                        Primary
                      </label>
                    </div>
                    <FormField className="mt-3" label="Notes">
                      <Textarea
                        disabled={!canWrite}
                        onChange={(event) => updateStaffDraft(staff.id, { notes: event.target.value })}
                        value={draft.notes}
                      />
                    </FormField>
                    {canWrite ? (
                      <div className="mt-3 flex flex-wrap justify-end gap-2">
                        <Button onClick={() => handleSaveStaff(staff.id)} size="sm" type="button" variant="secondary">
                          Save
                        </Button>
                        <Button onClick={() => handleRemoveStaff(staff.id)} size="sm" type="button" variant="ghost">
                          Remove
                        </Button>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          {activeTab === "settings" ? (
            <div className="space-y-3">
              <div className="rounded-control border bg-surface-muted p-3 text-sm text-text">
                <p className="font-semibold">Team node</p>
                <p>{detail.node.name}</p>
                <p className="text-xs text-text-muted">Slug: {detail.node.slug}</p>
              </div>

              <FormField label="Status">
                <Select
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, status: event.target.value }))}
                  options={[
                    { value: "active", label: "Active" },
                    { value: "archived", label: "Archived" }
                  ]}
                  value={settingsDraft.status}
                />
              </FormField>

              <FormField label="Team code">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, teamCode: event.target.value }))}
                  value={settingsDraft.teamCode}
                />
              </FormField>

              <FormField label="Level label">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, levelLabel: event.target.value }))}
                  value={settingsDraft.levelLabel}
                />
              </FormField>

              <FormField label="Age group">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, ageGroup: event.target.value }))}
                  value={settingsDraft.ageGroup}
                />
              </FormField>

              <FormField label="Gender">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, gender: event.target.value }))}
                  value={settingsDraft.gender}
                />
              </FormField>

              <FormField label="Primary color">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, colorPrimary: event.target.value }))}
                  value={settingsDraft.colorPrimary}
                />
              </FormField>

              <FormField label="Secondary color">
                <Input
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, colorSecondary: event.target.value }))}
                  value={settingsDraft.colorSecondary}
                />
              </FormField>

              <FormField label="Home facility">
                <Select
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, homeFacilityId: event.target.value }))}
                  options={[
                    { value: "", label: "No facility" },
                    ...detail.facilities.map((facility) => ({
                      value: facility.id,
                      label: facility.status === "archived" ? `${facility.name} (archived)` : facility.name
                    }))
                  ]}
                  value={settingsDraft.homeFacilityId}
                />
              </FormField>

              <FormField label="Notes">
                <Textarea
                  disabled={!canWrite}
                  onChange={(event) => setSettingsDraft((current) => ({ ...current, notes: event.target.value }))}
                  value={settingsDraft.notes}
                />
              </FormField>

              {canWrite ? (
                <div className="flex justify-end">
                  <Button onClick={handleSaveSettings} type="button" variant="secondary">
                    Save settings
                  </Button>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
