"use client";

import { useEffect, useMemo, useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { CreateModal } from "@orgframe/ui/primitives/interaction-containers";
import { Select } from "@orgframe/ui/primitives/select";
import { X } from "lucide-react";

export type ProfileCreatePayload = {
  accountUserId?: string;
  profileType: "player" | "staff";
  displayName: string;
  firstName?: string;
  lastName?: string;
  dob?: string;
};

type ProfileCreatePopupProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ProfileCreatePayload) => void;
  loading?: boolean;
  title?: string;
  subtitle?: string;
  canSetAccountUserId?: boolean;
  allowedProfileTypes?: Array<"player" | "staff">;
};

export function ProfileCreatePopup({
  open,
  onClose,
  onSubmit,
  loading = false,
  title = "Create profile",
  subtitle = "Create a player or staff profile.",
  canSetAccountUserId = true,
  allowedProfileTypes = ["player", "staff"]
}: ProfileCreatePopupProps) {
  const profileTypeOptions = useMemo(
    () =>
      allowedProfileTypes.map((value) => ({
        value,
        label: value === "player" ? "Player" : "Staff"
      })),
    [allowedProfileTypes]
  );

  const [accountUserId, setAccountUserId] = useState("");
  const [profileType, setProfileType] = useState<"player" | "staff">(allowedProfileTypes[0] ?? "player");
  const [displayName, setDisplayName] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [dob, setDob] = useState("");

  useEffect(() => {
    if (!open) {
      setAccountUserId("");
      setProfileType(allowedProfileTypes[0] ?? "player");
      setDisplayName("");
      setFirstName("");
      setLastName("");
      setDob("");
    }
  }, [allowedProfileTypes, open]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      ...(canSetAccountUserId && accountUserId.trim().length > 0 ? { accountUserId: accountUserId.trim() } : {}),
      profileType,
      displayName: displayName.trim().length > 0 ? displayName.trim() : `${firstName.trim()} ${lastName.trim()}`.trim(),
      ...(firstName.trim().length > 0 ? { firstName: firstName.trim() } : {}),
      ...(lastName.trim().length > 0 ? { lastName: lastName.trim() } : {}),
      ...(dob.trim().length > 0 ? { dob: dob.trim() } : {})
    });
  }

  return (
    <CreateModal
      footer={
        <>
          <Button disabled={loading} onClick={onClose} type="button" variant="ghost">
            <X className="h-4 w-4" />
            Cancel
          </Button>
          <Button disabled={loading} form="profile-create-form" loading={loading} type="submit">
            {loading ? "Creating..." : "Create profile"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      subtitle={subtitle}
      title={title}
    >
      <form className="grid gap-3 md:grid-cols-2" id="profile-create-form" onSubmit={submit}>
        {canSetAccountUserId ? (
          <FormField className="md:col-span-2" label="Account user id (optional)">
            <Input disabled={loading} onChange={(event) => setAccountUserId(event.target.value)} value={accountUserId} />
          </FormField>
        ) : null}
        <FormField label="Profile type">
          <Select
            disabled={loading}
            onChange={(event) => setProfileType(event.target.value as "player" | "staff")}
            options={profileTypeOptions}
            value={profileType}
          />
        </FormField>
        <FormField label="Display name">
          <Input disabled={loading} onChange={(event) => setDisplayName(event.target.value)} placeholder="Optional if first/last provided" value={displayName} />
        </FormField>
        <FormField label="First name">
          <Input disabled={loading} onChange={(event) => setFirstName(event.target.value)} value={firstName} />
        </FormField>
        <FormField label="Last name">
          <Input disabled={loading} onChange={(event) => setLastName(event.target.value)} value={lastName} />
        </FormField>
        <FormField label="DOB">
          <Input disabled={loading} onChange={(event) => setDob(event.target.value)} type="date" value={dob} />
        </FormField>
      </form>
    </CreateModal>
  );
}
