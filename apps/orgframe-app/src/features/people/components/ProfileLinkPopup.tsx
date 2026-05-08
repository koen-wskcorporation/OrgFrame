"use client";

import { useEffect, useState } from "react";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { EmailInput } from "@orgframe/ui/primitives/email-input";
import { Input } from "@orgframe/ui/primitives/input";
import { CreateModal } from "@orgframe/ui/primitives/interaction-containers";
import { Select } from "@orgframe/ui/primitives/select";
import { X } from "lucide-react";
import type { PeopleRelationshipType } from "@/src/features/people/types";

export type ProfileLinkPayload = {
  profileId: string;
  relationshipType: PeopleRelationshipType;
  email: string;
};

type ProfileLinkPopupProps = {
  open: boolean;
  onClose: () => void;
  onSubmit: (payload: ProfileLinkPayload) => void;
  loading?: boolean;
};

export function ProfileLinkPopup({ open, onClose, onSubmit, loading = false }: ProfileLinkPopupProps) {
  const [profileId, setProfileId] = useState("");
  const [relationshipType, setRelationshipType] = useState<PeopleRelationshipType>("guardian");
  const [email, setEmail] = useState("");

  useEffect(() => {
    if (!open) {
      setProfileId("");
      setRelationshipType("guardian");
      setEmail("");
    }
  }, [open]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit({
      profileId: profileId.trim(),
      relationshipType,
      email: email.trim()
    });
  }

  return (
    <CreateModal
      footer={
        <>
          <Button intent="cancel" disabled={loading} onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button disabled={loading} form="profile-link-form" loading={loading} type="submit">
            {loading ? "Linking..." : "Link profile"}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      subtitle="Link an existing profile to an account with a relationship type."
      title="Link profile"
    >
      <form className="grid gap-3" id="profile-link-form" onSubmit={submit}>
        <FormField label="Profile id">
          <Input disabled={loading} onChange={(event) => setProfileId(event.target.value)} required value={profileId} />
        </FormField>
        <FormField label="Relationship">
          <Select
            disabled={loading}
            onChange={(event) => setRelationshipType(event.target.value as PeopleRelationshipType)}
            options={[
              { value: "self", label: "Self" },
              { value: "guardian", label: "Guardian" },
              { value: "delegated_manager", label: "Delegated manager" }
            ]}
            value={relationshipType}
          />
        </FormField>
        <FormField label="Account email">
          <EmailInput disabled={loading} onChange={(event) => setEmail(event.target.value)} required value={email} />
        </FormField>
      </form>
    </CreateModal>
  );
}
