"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Loader2, UserPlus } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Avatar } from "@orgframe/ui/primitives/avatar";
import { Button } from "@orgframe/ui/primitives/button";
import { Checkbox } from "@orgframe/ui/primitives/checkbox";
import { EmailInput } from "@orgframe/ui/primitives/email-input";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Panel } from "@orgframe/ui/primitives/panel";
import { PhoneInput } from "@orgframe/ui/primitives/phone-input";
import { Select, type SelectOption } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { createAccountAction, lookupAccountByEmailAction, type AccountLookupResult } from "@/src/features/people/actions";
import { listOrgRolesAction, type OrgRoleDefinition } from "@/src/features/people/roles/actions";
import { type OrgRole } from "@/src/features/core/access";
import { EditableAvatar } from "@/src/features/core/account/components/EditableAvatar";
import { uploadAccountImage } from "@/src/features/files/uploads/uploadAccountImage";

type AccountCreatePanelProps = {
  open: boolean;
  onClose: () => void;
  orgSlug: string;
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LookupState =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "result"; data: AccountLookupResult }
  | { kind: "error"; message: string };

export function AccountCreatePanel({ open, onClose, orgSlug }: AccountCreatePanelProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [isSaving, startSaving] = useTransition();

  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState<OrgRole>("member");
  const [avatarPath, setAvatarPath] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [sendInvite, setSendInvite] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lookup, setLookup] = useState<LookupState>({ kind: "idle" });
  const lookupSeqRef = useRef(0);
  const [roleOptions, setRoleOptions] = useState<SelectOption[]>([
    { value: "member", label: "Member" },
    { value: "admin", label: "Admin" }
  ]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    listOrgRolesAction({ orgSlug }).then((result) => {
      if (cancelled || !result.ok) return;
      const sorted: OrgRoleDefinition[] = [...result.data.roles].sort((a, b) => {
        if (a.source !== b.source) return a.source === "default" ? -1 : 1;
        return a.label.localeCompare(b.label);
      });
      setRoleOptions(sorted.map((r) => ({ value: r.roleKey, label: r.label })));
    });
    return () => {
      cancelled = true;
    };
  }, [open, orgSlug]);

  useEffect(() => {
    if (open) return;
    setEmail("");
    setFirstName("");
    setLastName("");
    setPhone("");
    setRole("member");
    setAvatarPath("");
    setAvatarUrl(null);
    setSendInvite(true);
    setErrorMessage(null);
    setLookup({ kind: "idle" });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setLookup({ kind: "idle" });
      return;
    }

    setLookup({ kind: "checking" });
    const seq = ++lookupSeqRef.current;
    const handle = window.setTimeout(async () => {
      const result = await lookupAccountByEmailAction({ orgSlug, email: trimmed });
      if (seq !== lookupSeqRef.current) return;
      if (!result.ok) {
        setLookup({ kind: "error", message: result.error });
        return;
      }
      setLookup({ kind: "result", data: result.data });
    }, 400);

    return () => {
      window.clearTimeout(handle);
    };
  }, [email, orgSlug, open]);

  const isExistingAccount = lookup.kind === "result" && lookup.data.status === "existing";
  const isNewAccount = lookup.kind === "result" && lookup.data.status === "new";
  const isAlreadyMember = lookup.kind === "result" && lookup.data.status === "existing_member";

  const previewName = isExistingAccount
    ? [
        (lookup.kind === "result" && lookup.data.status === "existing" && lookup.data.firstName) || "",
        (lookup.kind === "result" && lookup.data.status === "existing" && lookup.data.lastName) || ""
      ]
        .filter(Boolean)
        .join(" ")
        .trim() || email.trim() || "Existing account"
    : [firstName, lastName].filter(Boolean).join(" ").trim() || email.trim() || "New account";

  const submitDisabled = isSaving || isAlreadyMember || lookup.kind === "checking" || email.trim().length === 0;

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitDisabled) return;
    setErrorMessage(null);

    startSaving(async () => {
      const result = await createAccountAction({
        orgSlug,
        email,
        ...(isExistingAccount
          ? {}
          : {
              firstName,
              lastName,
              phone,
              avatarPath,
              sendInvite
            }),
        role
      });

      if (!result.ok) {
        setErrorMessage(result.error);
        toast({ title: "Unable to add account", description: result.error, variant: "destructive" });
        return;
      }

      toast({
        title: isExistingAccount ? "Account added to org" : "Account created",
        variant: "success"
      });
      onClose();
      router.refresh();
    });
  }

  const headerAvatarSlot = isExistingAccount ? (
    <Avatar alt={previewName} name={previewName} sizePx={44} src={lookup.kind === "result" && lookup.data.status === "existing" ? lookup.data.avatarUrl : null} />
  ) : (
    <EditableAvatar
      ariaLabel="Choose profile picture"
      disabled={isSaving}
      name={previewName}
      onSelect={async (result) => {
        const asset = await uploadAccountImage({
          file: result.file,
          purpose: "profile-photo",
          crop: result.crop,
          width: result.width,
          height: result.height
        });
        setAvatarPath(asset.path);
        setAvatarUrl(asset.publicUrl);
      }}
      sizePx={44}
      src={avatarUrl}
    />
  );

  return (
    <Panel
      footer={
        <Button disabled={submitDisabled} form="account-create-form" loading={isSaving} type="submit">
          {isSaving ? "Saving..." : isExistingAccount ? "Add to org" : "Add account"}
        </Button>
      }
      headerAvatarAlt={previewName}
      headerAvatarSlot={headerAvatarSlot}
      headerShowAvatar
      onClose={onClose}
      open={open}
      panelKey="people-add-account"
      subtitle="Add an existing OrgFrame account to this org, or create a new one."
      title={previewName}
    >
      <form className="space-y-4" id="account-create-form" onSubmit={handleSubmit}>
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}

        <FormField
          hint={
            lookup.kind === "checking"
              ? "Checking OrgFrame for this email..."
              : "Enter their email — we'll see if they already have an OrgFrame account."
          }
          label="Email"
        >
          <EmailInput
            disabled={isSaving}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="parent@example.com"
            required
            value={email}
          />
        </FormField>

        {lookup.kind === "checking" ? (
          <div className="flex items-center gap-2 text-sm text-text-muted">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Looking up account...</span>
          </div>
        ) : null}

        {lookup.kind === "error" ? <Alert variant="warning">{lookup.message}</Alert> : null}

        {isAlreadyMember ? (
          <Alert variant="warning">This email is already a member of this organization.</Alert>
        ) : null}

        {isExistingAccount && lookup.kind === "result" && lookup.data.status === "existing" ? (
          <Alert variant="info">
            <div className="flex items-start gap-3">
              <Avatar
                alt={previewName}
                name={previewName}
                sizePx={36}
                src={lookup.data.avatarUrl}
              />
              <div className="space-y-0.5">
                <p className="font-semibold">Found existing OrgFrame account</p>
                <p className="text-sm text-text-muted">
                  {[lookup.data.firstName, lookup.data.lastName].filter(Boolean).join(" ").trim() || email}
                </p>
                <p className="text-xs text-text-muted">They&apos;ll be added to this org with the role below.</p>
              </div>
            </div>
          </Alert>
        ) : null}

        {isNewAccount ? (
          <Alert variant="success">
            <div className="flex items-start gap-2">
              <UserPlus className="mt-0.5 h-4 w-4" />
              <div>
                <p className="font-semibold">No OrgFrame account yet</p>
                <p className="text-sm">A new account will be created and added to this org.</p>
              </div>
            </div>
          </Alert>
        ) : null}

        {!isExistingAccount && !isAlreadyMember ? (
          <>
            <div className="grid gap-3 md:grid-cols-2">
              <FormField label="First name">
                <Input disabled={isSaving} onChange={(event) => setFirstName(event.target.value)} value={firstName} />
              </FormField>
              <FormField label="Last name">
                <Input disabled={isSaving} onChange={(event) => setLastName(event.target.value)} value={lastName} />
              </FormField>
            </div>

            <FormField hint="Optional. Used for SMS notifications." label="Phone number">
              <PhoneInput disabled={isSaving} onChange={setPhone} value={phone} />
            </FormField>
          </>
        ) : null}

        <FormField hint="Controls what this account can do in the org." label="Role">
          <Select disabled={isSaving} onChange={(event) => setRole(event.target.value)} options={roleOptions} value={role} />
        </FormField>

        {isNewAccount ? (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={sendInvite}
              disabled={isSaving}
              onCheckedChange={(checked) => setSendInvite(Boolean(checked))}
            />
            <span>Send an email invite so they can set their password</span>
          </label>
        ) : null}

        {isExistingAccount ? (
          <p className="flex items-center gap-2 text-xs text-text-muted">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Their existing name and profile picture will be used.
          </p>
        ) : null}
      </form>
    </Panel>
  );
}
