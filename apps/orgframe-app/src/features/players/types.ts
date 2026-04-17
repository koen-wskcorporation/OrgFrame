export type PlayerProfile = {
  id: string;
  ownerUserId: string;
  firstName: string;
  lastName: string;
  preferredName: string | null;
  dateOfBirth: string | null;
  gender: string | null;
  jerseySize: string | null;
  medicalNotes: string | null;
  metadataJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type PlayerGuardian = {
  id: string;
  playerId: string;
  guardianUserId: string;
  relationship: string | null;
  canManage: boolean;
  createdAt: string;
};

export type PlayerPickerItem = {
  id: string;
  label: string;
  subtitle: string | null;
};
