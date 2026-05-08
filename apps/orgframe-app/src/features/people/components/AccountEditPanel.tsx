"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { EmailInput } from "@orgframe/ui/primitives/email-input";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { useToast } from "@orgframe/ui/primitives/toast";
import { updateAccountDetailsAction } from "@/src/features/core/account/actions";
import { EditableAvatar } from "@/src/features/core/account/components/EditableAvatar";
import { saveProfilePhoto } from "@/src/features/core/account/components/saveProfilePhoto";
import { AccountAuditTab } from "@/src/features/audit/components/AccountAuditTab";

type SavedAccount = {
  userId: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  avatarPath: string | null;
};

type AccountEditPanelProps = {
  open: boolean;
  onClose: () => void;
  orgSlug?: string;
  targetUserId?: string;
  email?: string | null;
  initialFirstName?: string | null;
  initialLastName?: string | null;
  initialAvatarPath?: string | null;
  initialAvatarUrl?: string | null;
  panelKey?: string;
  onSaved?: (account: SavedAccount) => void;
};

export function AccountEditPanel({
  open,
  onClose,
  orgSlug,
  targetUserId,
  email,
  initialFirstName,
  initialLastName,
  initialAvatarPath,
  initialAvatarUrl,
  panelKey,
  onSaved
}: AccountEditPanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();

  const [firstName, setFirstName] = useState(initialFirstName ?? "");
  const [lastName, setLastName] = useState(initialLastName ?? "");
  const [avatarPath, setAvatarPath] = useState(initialAvatarPath ?? "");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl ?? null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstName(initialFirstName ?? "");
    setLastName(initialLastName ?? "");
    setAvatarPath(initialAvatarPath ?? "");
    setAvatarUrl(initialAvatarUrl ?? null);
    setErrorMessage(null);
  }, [initialAvatarPath, initialAvatarUrl, initialFirstName, initialLastName, open]);

  const previewName = [firstName, lastName].filter(Boolean).join(" ").trim() || email?.trim() || "Account";

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);

    startSaving(async () => {
      const result = await updateAccountDetailsAction({
        ...(orgSlug ? { orgSlug } : {}),
        ...(targetUserId ? { targetUserId } : {}),
        firstName,
        lastName,
        avatarPath: avatarPath ?? ""
      });

      if (!result.ok) {
        setErrorMessage(result.error);
        toast({ title: "Unable to save account", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "Account updated", variant: "success" });
      onSaved?.(result.data.account);
      onClose();
      router.refresh();
    });
  }

  return (
    <Panel
      footer={
        <>
          <Button intent="cancel" disabled={isSaving} onClick={onClose} type="button" variant="ghost">Cancel</Button>
          <Button disabled={isSaving} form="account-edit-panel-form" loading={isSaving} type="submit">
            {isSaving ? "Saving..." : "Save account"}
          </Button>
        </>
      }
      headerAvatarAlt={previewName}
      headerAvatarSlot={
        <EditableAvatar
          ariaLabel="Change profile picture"
          disabled={isSaving}
          name={previewName}
          onSelect={async (result) => {
            const asset = await saveProfilePhoto(result, {
              ...(orgSlug ? { orgSlug } : {}),
              ...(targetUserId ? { targetUserId } : {})
            });
            setAvatarPath(asset.path);
            setAvatarUrl(asset.publicUrl);
          }}
          sizePx={44}
          src={avatarUrl}
        />
      }
      headerShowAvatar
      onClose={onClose}
      open={open}
      panelKey={panelKey ?? "account-edit"}
      subtitle="Update account name and profile picture."
      title="Edit account"
    >
      <form className="space-y-4" id="account-edit-panel-form" onSubmit={handleSubmit}>
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        <FormField label="Email">
          <EmailInput disabled readOnly value={email ?? ""} />
        </FormField>

        <div className="grid gap-3 md:grid-cols-2">
          <FormField label="First name">
            <Input disabled={isSaving} onChange={(event) => setFirstName(event.target.value)} value={firstName} />
          </FormField>
          <FormField label="Last name">
            <Input disabled={isSaving} onChange={(event) => setLastName(event.target.value)} value={lastName} />
          </FormField>
        </div>
      </form>

      {orgSlug && targetUserId ? (
        <div className="mt-6 space-y-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-text-muted">
            Audit log
          </h3>
          <AccountAuditTab orgSlug={orgSlug} userId={targetUserId} />
        </div>
      ) : null}
    </Panel>
  );
}
