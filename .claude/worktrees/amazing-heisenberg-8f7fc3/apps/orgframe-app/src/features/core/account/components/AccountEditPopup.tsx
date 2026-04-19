"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { CreateModal } from "@orgframe/ui/primitives/interaction-containers";
import { AssetTile } from "@orgframe/ui/primitives/asset-tile";
import { useToast } from "@orgframe/ui/primitives/toast";
import { updateAccountDetailsAction } from "@/src/features/core/account/actions";

type AccountEditPopupProps = {
  open: boolean;
  onClose: () => void;
  orgSlug?: string;
  targetUserId?: string;
  email?: string | null;
  initialFirstName?: string | null;
  initialLastName?: string | null;
  initialAvatarPath?: string | null;
  initialAvatarUrl?: string | null;
  title?: string;
  subtitle?: string;
  submitLabel?: string;
  onSaved?: (account: { userId: string; email: string | null; firstName: string | null; lastName: string | null; avatarPath: string | null }) => void;
};

function buildDisplayName(firstName: string, lastName: string, email: string | null | undefined) {
  const fullName = [firstName, lastName].filter(Boolean).join(" ").trim();
  if (fullName.length > 0) {
    return fullName;
  }
  return email?.trim() || "Account";
}

export function AccountEditPopup({
  open,
  onClose,
  orgSlug,
  targetUserId,
  email,
  initialFirstName,
  initialLastName,
  initialAvatarPath,
  initialAvatarUrl,
  title = "Edit account details",
  subtitle = "Update account name and profile image.",
  submitLabel = "Save account",
  onSaved
}: AccountEditPopupProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();

  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName, setLastName] = useState(initialLastName ?? "");
  const [avatarPath, setAvatarPath] = useState(initialAvatarPath ?? "");

  useEffect(() => {
    if (!open) {
      return;
    }

    setFirstName(initialFirstName ?? "");
    setLastName(initialLastName ?? "");
    setAvatarPath(initialAvatarPath ?? "");
  }, [initialAvatarPath, initialFirstName, initialLastName, open]);

  const previewName = buildDisplayName(firstName, lastName, email);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const avatarPathInput = formData.get("avatarPath");
    const submittedAvatarPath = typeof avatarPathInput === "string" ? avatarPathInput : avatarPath;

    startSaving(async () => {
      const result = await updateAccountDetailsAction({
        ...(orgSlug ? { orgSlug } : {}),
        ...(targetUserId ? { targetUserId } : {}),
        firstName,
        lastName,
        avatarPath: submittedAvatarPath
      });

      if (!result.ok) {
        toast({
          title: "Unable to save account",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      toast({ title: "Account updated", variant: "success" });
      onSaved?.(result.data.account);
      onClose();
      router.refresh();
    });
  }

  return (
    <CreateModal
      footer={
        <>
          <Button disabled={isSaving} onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button disabled={isSaving} form="account-edit-form" loading={isSaving} type="submit">
            {isSaving ? "Saving..." : submitLabel}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      subtitle={subtitle}
      title={title}
    >
      <form className="grid gap-3 md:grid-cols-2" id="account-edit-form" onSubmit={handleSubmit}>
        <FormField className="md:col-span-2" label="Account email">
          <Input disabled readOnly value={email ?? "No email available"} />
        </FormField>
        <FormField label="First name">
          <Input disabled={isSaving} onChange={(event) => setFirstName(event.target.value)} value={firstName} />
        </FormField>
        <FormField label="Last name">
          <Input disabled={isSaving} onChange={(event) => setLastName(event.target.value)} value={lastName} />
        </FormField>
        <FormField className="md:col-span-2" label="Profile picture">
          <AssetTile
            constraints={{
              accept: "image/*",
              maxSizeMB: 5,
              aspect: "square",
              recommendedPx: { w: 640, h: 640 }
            }}
            emptyLabel="Upload profile picture"
            fit="contain"
            initialPath={avatarPath || null}
            initialUrl={initialAvatarUrl}
            kind="account"
            name="avatarPath"
            onChange={(asset) => setAvatarPath(asset.path)}
            onRemove={() => setAvatarPath("")}
            previewAlt={`${previewName} avatar`}
            purpose="profile-photo"
            specificationText="PNG, JPG, WEBP, HEIC, or SVG"
            title="Profile picture"
          />
        </FormField>
      </form>
    </CreateModal>
  );
}
