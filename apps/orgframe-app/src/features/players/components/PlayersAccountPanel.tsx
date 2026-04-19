"use client";

import { Pencil, Plus, X } from "lucide-react";
import { useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Badge } from "@orgframe/ui/primitives/badge";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { ContextPanel, CreateModal } from "@orgframe/ui/primitives/interaction-containers";
import { Repeater } from "@orgframe/ui/primitives/repeater";
import { Select } from "@orgframe/ui/primitives/select";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { useToast } from "@orgframe/ui/primitives/toast";
import { PersonCard } from "@orgframe/ui/primitives/person-card";
import { createPlayerAction, linkGuardianByEmailAction, updatePlayerAction } from "@/src/features/players/actions";
import type { PlayerGuardian, PlayerProfile } from "@/src/features/players/types";
import { ProfileCreatePopup, type ProfileCreatePayload } from "@/src/features/people/components/ProfileCreatePopup";

type PlayerWithGuardians = {
  player: PlayerProfile;
  guardians: PlayerGuardian[];
};

type PlayersAccountPanelProps = {
  currentUserId: string;
  initialPlayers: PlayerWithGuardians[];
};

type PlayerDraft = {
  firstName: string;
  lastName: string;
  preferredName: string;
  dateOfBirth: string;
  gender: string;
  jerseySize: string;
  medicalNotes: string;
};

const GENDER_PRESET_OPTIONS = [
  { value: "", label: "Select gender" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "non-binary", label: "Non-binary" },
  { value: "other", label: "Other" }
] as const;

const GUARDIAN_RELATIONSHIP_PRESET_OPTIONS = [
  { value: "", label: "Select relationship" },
  { value: "parent", label: "Parent" },
  { value: "legal guardian", label: "Legal guardian" },
  { value: "grandparent", label: "Grandparent" },
  { value: "sibling", label: "Sibling" },
  { value: "relative", label: "Relative" },
  { value: "family friend", label: "Family friend" },
  { value: "other", label: "Other (custom)" }
] as const;

function isPresetGender(value: string) {
  return value === "male" || value === "female" || value === "non-binary";
}

function createDraft(player?: PlayerProfile): PlayerDraft {
  return {
    firstName: player?.firstName ?? "",
    lastName: player?.lastName ?? "",
    preferredName: player?.preferredName ?? "",
    dateOfBirth: player?.dateOfBirth ?? "",
    gender: player?.gender ?? "",
    jerseySize: player?.jerseySize ?? "",
    medicalNotes: player?.medicalNotes ?? ""
  };
}

function sortPlayers(players: PlayerWithGuardians[]) {
  return [...players].sort((a, b) => {
    const aName = `${a.player.lastName} ${a.player.firstName}`.toLowerCase();
    const bName = `${b.player.lastName} ${b.player.firstName}`.toLowerCase();
    return aName.localeCompare(bName);
  });
}

export function PlayersAccountPanel({ currentUserId, initialPlayers }: PlayersAccountPanelProps) {
  const { toast } = useToast();

  const [players, setPlayers] = useState<PlayerWithGuardians[]>(() => sortPlayers(initialPlayers));
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isLinkGuardianOpen, setIsLinkGuardianOpen] = useState(false);
  const [editingPlayerId, setEditingPlayerId] = useState<string | null>(null);

  const [editDraftState, setEditDraftState] = useState<PlayerDraft>(() => createDraft());
  const [editGenderMode, setEditGenderMode] = useState<string>("");
  const [guardianLinkPlayerId, setGuardianLinkPlayerId] = useState<string | null>(null);
  const [guardianLinkEmail, setGuardianLinkEmail] = useState("");
  const [guardianRelationshipMode, setGuardianRelationshipMode] = useState<string>("");
  const [guardianRelationshipValue, setGuardianRelationshipValue] = useState("");

  const [isCreating, startCreating] = useTransition();
  const [isSavingEdit, setIsSavingEdit] = useState(false);
  const [isLinkingGuardian, setIsLinkingGuardian] = useState(false);

  const sortedPlayers = useMemo(() => sortPlayers(players), [players]);

  const editingPlayer = useMemo(() => {
    if (!editingPlayerId) {
      return null;
    }
    return sortedPlayers.find((item) => item.player.id === editingPlayerId)?.player ?? null;
  }, [editingPlayerId, sortedPlayers]);

  const editingPlayerWithGuardians = useMemo(() => {
    if (!editingPlayerId) {
      return null;
    }
    return sortedPlayers.find((item) => item.player.id === editingPlayerId) ?? null;
  }, [editingPlayerId, sortedPlayers]);

  function openEdit(player: PlayerProfile) {
    const nextMode = player.gender && !isPresetGender(player.gender) ? "other" : (player.gender ?? "");
    setEditingPlayerId(player.id);
    setEditDraftState(createDraft(player));
    setEditGenderMode(nextMode);
    setIsEditOpen(true);
  }

  function closeCreate() {
    if (isCreating) {
      return;
    }
    setIsCreateOpen(false);
  }

  function closeEdit() {
    if (isSavingEdit) {
      return;
    }
    setIsEditOpen(false);
    setEditingPlayerId(null);
    setEditDraftState(createDraft());
    setEditGenderMode("");
  }

  function openGuardianLinkDialog(playerId: string) {
    setGuardianLinkPlayerId(playerId);
    setGuardianLinkEmail("");
    setGuardianRelationshipMode("");
    setGuardianRelationshipValue("");
    setIsLinkGuardianOpen(true);
  }

  function closeGuardianLinkDialog() {
    if (isLinkingGuardian) {
      return;
    }

    setIsLinkGuardianOpen(false);
    setGuardianLinkPlayerId(null);
    setGuardianLinkEmail("");
    setGuardianRelationshipMode("");
    setGuardianRelationshipValue("");
  }

  function updatePlayerInState(updatedPlayer: PlayerProfile) {
    setPlayers((current) =>
      current.map((item) =>
        item.player.id === updatedPlayer.id
          ? {
              ...item,
              player: updatedPlayer
            }
          : item
      )
    );
  }

  function handleCreateProfile(payload: ProfileCreatePayload) {
    startCreating(async () => {
      const result = await createPlayerAction({
        firstName: payload.firstName ?? payload.displayName.split(" ")[0] ?? "",
        lastName: payload.lastName ?? payload.displayName.split(" ").slice(1).join(" ") ?? "Profile",
        dateOfBirth: payload.dob
      });

      if (!result.ok) {
        toast({
          title: "Unable to create player",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setPlayers((current) =>
        sortPlayers([
          ...current,
          {
            player: result.data.player,
            guardians: []
          }
        ])
      );

      toast({
        title: "Player created",
        variant: "success"
      });
      closeCreate();
    });
  }

  function handleUpdatePlayer(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!editingPlayerId) {
      return;
    }

    setIsSavingEdit(true);

    void (async () => {
      const result = await updatePlayerAction({
        playerId: editingPlayerId,
        ...editDraftState
      });

      setIsSavingEdit(false);

      if (!result.ok) {
        toast({
          title: "Unable to update player",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      updatePlayerInState(result.data.player);

      toast({
        title: "Player updated",
        variant: "success"
      });
      closeEdit();
    })();
  }

  function handleLinkGuardian() {
    if (!guardianLinkPlayerId) {
      return;
    }

    setIsLinkingGuardian(true);

    void (async () => {
      const result = await linkGuardianByEmailAction({
        playerId: guardianLinkPlayerId,
        email: guardianLinkEmail,
        relationship: guardianRelationshipValue
      });

      setIsLinkingGuardian(false);

      if (!result.ok) {
        toast({
          title: "Unable to link guardian",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setPlayers((current) =>
        current.map((item) => {
          if (item.player.id !== guardianLinkPlayerId) {
            return item;
          }

          return {
            ...item,
            guardians: [...item.guardians, result.data.guardian]
          };
        })
      );

      toast({
        title: "Guardian linked",
        variant: "success"
      });
      closeGuardianLinkDialog();
    })();
  }

  return (
    <div className="ui-stack-page">
      <Card>
        <CardHeader className="p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle>Players</CardTitle>
              <CardDescription>Add and manage player profiles for registrations.</CardDescription>
            </div>
            <Button onClick={() => setIsCreateOpen(true)} type="button">
              <Plus className="h-4 w-4" />
              Add player
            </Button>
          </div>
        </CardHeader>
      </Card>

      {sortedPlayers.length === 0 ? <Alert variant="info">No players yet. Add your first player.</Alert> : null}

      <Repeater
        getItemKey={(item) => item.player.id}
        getSearchValue={(item) =>
          `${item.player.firstName} ${item.player.lastName} ${item.player.preferredName ?? ""} ${item.player.dateOfBirth ?? ""} ${item.player.gender ?? ""}`
        }
        items={sortedPlayers}
        searchPlaceholder="Search players"
        renderItem={({ item }) => {
          const myGuardianLink = item.guardians.find((guardian) => guardian.guardianUserId === currentUserId);
          const relationshipToMe = myGuardianLink?.relationship ?? "Unspecified";
          const isSelf = Boolean(myGuardianLink && myGuardianLink.relationship === "self");

          return (
            <PersonCard
              actions={
                <Button onClick={() => openEdit(item.player)} type="button" variant="secondary">
                  <Pencil className="h-4 w-4" />
                  Edit
                </Button>
              }
              badges={[
                <Badge key="type" variant="neutral">
                  Player Profile
                </Badge>,
                ...(isSelf
                  ? [
                      <Badge key="you" variant="success">
                        You
                      </Badge>
                    ]
                  : [])
              ]}
              name={`${item.player.firstName} ${item.player.lastName}`}
              subtitle={item.player.preferredName ? `Preferred: ${item.player.preferredName}` : "Linked profile"}
              sections={[
                {
                  key: "identity",
                  title: "Identity",
                  content: (
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="font-semibold">DOB:</span> {item.player.dateOfBirth ?? "Not set"}
                      </p>
                      <p>
                        <span className="font-semibold">Gender:</span> {item.player.gender ?? "Not set"}
                      </p>
                    </div>
                  )
                },
                {
                  key: "relationships",
                  title: "Relationships",
                  content: (
                    <div className="space-y-2 text-sm">
                      <p>
                        <span className="font-semibold">Relationship to you:</span> {relationshipToMe}
                      </p>
                      <p>
                        <span className="font-semibold">Guardians linked:</span> {item.guardians.length}
                      </p>
                    </div>
                  )
                }
              ]}
            >
                <div className="space-y-2 text-sm">
                  <p className="text-xs text-text-muted">Profile ID: {item.player.id}</p>
                </div>
            </PersonCard>
          );
        }}
      />

      <ProfileCreatePopup
        allowedProfileTypes={["player"]}
        canSetAccountUserId={false}
        loading={isCreating}
        onClose={closeCreate}
        onSubmit={handleCreateProfile}
        open={isCreateOpen}
        subtitle="Create a new player profile for registration."
        title="Add profile"
      />

      <ContextPanel
        footer={
          <>
            <Button disabled={isSavingEdit} onClick={closeEdit} type="button" variant="ghost">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button disabled={isSavingEdit} form="edit-player-form" loading={isSavingEdit} type="submit">
              {isSavingEdit ? "Saving..." : "Save player"}
            </Button>
          </>
        }
        onClose={closeEdit}
        open={isEditOpen}
        subtitle={editingPlayer ? `${editingPlayer.firstName} ${editingPlayer.lastName}` : "Update player details."}
        title="Edit player"
      >
        <form className="grid gap-3 md:grid-cols-2" id="edit-player-form" onSubmit={handleUpdatePlayer}>
          <FormField label="First name">
            <Input onChange={(event) => setEditDraftState((current) => ({ ...current, firstName: event.target.value }))} required value={editDraftState.firstName} />
          </FormField>
          <FormField label="Last name">
            <Input onChange={(event) => setEditDraftState((current) => ({ ...current, lastName: event.target.value }))} required value={editDraftState.lastName} />
          </FormField>
          <FormField label="Date of birth">
            <Input disabled value={editDraftState.dateOfBirth || "Not set"} />
          </FormField>
          <FormField label="Gender">
            <Select
              onChange={(event) => {
                const mode = event.target.value;
                setEditGenderMode(mode);

                if (mode === "other" || mode === "") {
                  if (mode === "") {
                    setEditDraftState((current) => ({ ...current, gender: "" }));
                  }
                  return;
                }

                setEditDraftState((current) => ({ ...current, gender: mode }));
              }}
              options={GENDER_PRESET_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={editGenderMode}
            />
          </FormField>
          {editGenderMode === "other" ? (
            <FormField label="Gender (other)">
              <Input onChange={(event) => setEditDraftState((current) => ({ ...current, gender: event.target.value }))} value={editDraftState.gender} />
            </FormField>
          ) : null}
          <FormField label="Jersey size">
            <Input onChange={(event) => setEditDraftState((current) => ({ ...current, jerseySize: event.target.value }))} value={editDraftState.jerseySize} />
          </FormField>
          <FormField className="md:col-span-2" label="Medical notes">
            <Textarea className="min-h-[90px]" onChange={(event) => setEditDraftState((current) => ({ ...current, medicalNotes: event.target.value }))} value={editDraftState.medicalNotes} />
          </FormField>
          <div className="space-y-2 md:col-span-2">
            <p className="text-sm font-semibold text-text">Guardians</p>
            {editingPlayerWithGuardians && editingPlayerWithGuardians.guardians.length === 0 ? <Alert variant="info">No guardians linked.</Alert> : null}
            {editingPlayerWithGuardians?.guardians.map((guardian) => (
              <div className="rounded-control border bg-surface px-3 py-2 text-xs text-text-muted" key={guardian.id}>
                <p>User ID: {guardian.guardianUserId}</p>
                <p>
                  Relationship: {guardian.relationship ?? "Unspecified"} · {guardian.canManage ? "Can manage" : "Read only"}
                </p>
              </div>
            ))}
            {editingPlayerId ? (
              <Button onClick={() => openGuardianLinkDialog(editingPlayerId)} type="button" variant="secondary">
                Link guardian
              </Button>
            ) : null}
          </div>
        </form>
      </ContextPanel>

      <CreateModal
        footer={
          <>
            <Button disabled={isLinkingGuardian} onClick={closeGuardianLinkDialog} type="button" variant="ghost">
              <X className="h-4 w-4" />
              Cancel
            </Button>
            <Button
              disabled={!guardianLinkPlayerId || !guardianLinkEmail || isLinkingGuardian}
              loading={isLinkingGuardian}
              onClick={handleLinkGuardian}
              type="button"
            >
              {isLinkingGuardian ? "Linking..." : "Link guardian"}
            </Button>
          </>
        }
        onClose={closeGuardianLinkDialog}
        open={isLinkGuardianOpen}
        subtitle="Invite an existing account to access this player and set their relationship."
        title="Link guardian"
      >
        <div className="space-y-3">
          <FormField label="Guardian account email">
            <Input onChange={(event) => setGuardianLinkEmail(event.target.value)} required type="email" value={guardianLinkEmail} />
          </FormField>
          <FormField label="Relationship to player">
            <Select
              onChange={(event) => {
                const mode = event.target.value;
                setGuardianRelationshipMode(mode);

                if (mode === "other" || mode === "") {
                  if (mode === "") {
                    setGuardianRelationshipValue("");
                  }
                  return;
                }

                setGuardianRelationshipValue(mode);
              }}
              options={GUARDIAN_RELATIONSHIP_PRESET_OPTIONS.map((option) => ({ value: option.value, label: option.label }))}
              value={guardianRelationshipMode}
            />
          </FormField>
          {guardianRelationshipMode === "other" ? (
            <FormField label="Relationship (custom)">
              <Input onChange={(event) => setGuardianRelationshipValue(event.target.value)} value={guardianRelationshipValue} />
            </FormField>
          ) : null}
        </div>
      </CreateModal>
    </div>
  );
}
