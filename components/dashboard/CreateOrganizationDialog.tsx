"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { useToast } from "@/components/ui/toast";
import { useSiteOrigin } from "@/lib/hooks/useSiteOrigin";
import { createOrganizationAction } from "@/app/account/organizations/actions";

export function CreateOrganizationDialog() {
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
      router.push(`/${result.orgSlug}/tools/manage`);
    });
  }

  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="secondary">
        Create organization
      </Button>

      <Panel
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
              onChange={(event) => setOrgSlug(event.target.value)}
              persistentPrefix={`${siteOrigin || ""}/`}
              slugValidation={{ kind: "org" }}
              value={orgSlug}
            />
          </FormField>
        </form>
      </Panel>
    </>
  );
}
