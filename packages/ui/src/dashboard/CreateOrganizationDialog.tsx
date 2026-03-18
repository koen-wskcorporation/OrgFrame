"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@orgframe/ui/ui/button";
import { FormField } from "@orgframe/ui/ui/form-field";
import { Input } from "@orgframe/ui/ui/input";
import { Popup } from "@orgframe/ui/ui/popup";
import { useToast } from "@orgframe/ui/ui/toast";
import { useSiteOrigin } from "@/lib/hooks/useSiteOrigin";
import { createOrganizationAction } from "@/app/account/organizations/actions";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

type CreateOrganizationDialogProps = {
  renderTrigger?: (props: { openDialog: () => void; isPending: boolean }) => React.ReactNode;
};

export function CreateOrganizationDialog({ renderTrigger }: CreateOrganizationDialogProps = {}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const orgNameId = useId();
  const orgSlugId = useId();
  const formId = useId();
  const siteOrigin = useSiteOrigin();

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    startTransition(async () => {
      const result = await createOrganizationAction({
        orgName,
        orgSlug
      });

      if (!result.ok) {
        toast({
          title: "Unable to create organization",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      setOpen(false);
      setOrgName("");
      setOrgSlug("");
      router.push(`/${result.orgSlug}/manage`);
    });
  }

  function openDialog() {
    setOpen(true);
  }

  return (
    <>
      {renderTrigger ? (
        renderTrigger({ openDialog, isPending })
      ) : (
        <Button onClick={openDialog} size="sm" variant="secondary">
          Create organization
        </Button>
      )}

      <Popup
        footer={
          <>
            <Button disabled={isPending} onClick={() => setOpen(false)} type="button" variant="ghost">
              Cancel
            </Button>
            <Button disabled={isPending} form={formId} loading={isPending} type="submit">
              {isPending ? "Creating..." : "Create organization"}
            </Button>
          </>
        }
        onClose={() => setOpen(false)}
        open={open}
        size="md"
        subtitle="Set up a new organization workspace and become its first admin."
        title="Create organization"
      >
        <form className="space-y-3" id={formId} onSubmit={handleCreate}>
          <FormField hint="Shown across public and staff pages." htmlFor={orgNameId} label="Organization name">
            <Input
              id={orgNameId}
              maxLength={120}
              name="orgName"
              onChange={(event) => setOrgName(event.target.value)}
              required
              value={orgName}
            />
          </FormField>
          <FormField hint="Optional. Used in URLs like /my-club." htmlFor={orgSlugId} label="URL slug">
            <Input
              id={orgSlugId}
              maxLength={120}
              name="orgSlug"
              onChange={(event) => setOrgSlug(slugify(event.target.value))}
              onSlugAutoChange={setOrgSlug}
              persistentPrefix={`${siteOrigin || ""}/`}
              slugAutoSource={orgName}
              slugValidation={{ kind: "org" }}
              value={orgSlug}
            />
          </FormField>
        </form>
      </Popup>
    </>
  );
}
