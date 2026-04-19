"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Select } from "@orgframe/ui/primitives/select";
import { useToast } from "@orgframe/ui/primitives/toast";
import { useSiteOrigin } from "@/src/features/core/dashboard/hooks/useSiteOrigin";
import { ORG_TYPE_OPTIONS } from "@/src/shared/org/orgTypes";
import { createOrganizationAction } from "@/app/(account)/settings/organizations/actions";

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

export function CreateOrganizationForm() {
  const router = useRouter();
  const [orgName, setOrgName] = useState("");
  const [orgSlug, setOrgSlug] = useState("");
  const [orgType, setOrgType] = useState("");
  const [isPending, startTransition] = useTransition();
  const { toast } = useToast();
  const orgNameId = useId();
  const orgSlugId = useId();
  const orgTypeId = useId();
  const siteOrigin = useSiteOrigin();
  let subdomainPrefix = "https://";
  let subdomainSuffix = "";
  if (siteOrigin) {
    try {
      const parsed = new URL(siteOrigin);
      subdomainPrefix = `${parsed.protocol}//`;
      subdomainSuffix = `.${parsed.host}`;
    } catch {
      // fall back to defaults
    }
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (isPending) {
      return;
    }

    startTransition(async () => {
      const result = await createOrganizationAction({ orgName, orgSlug, orgType });

      if (!result.ok) {
        toast({
          title: "Unable to create organization",
          description: result.error,
          variant: "destructive"
        });
        return;
      }

      router.push(`/${result.orgSlug}/manage`);
    });
  }

  return (
    <form className="space-y-4" onSubmit={handleCreate}>
      <FormField hint="Shown across public and staff pages." htmlFor={orgNameId} label="Organization name">
        <Input
          autoFocus
          id={orgNameId}
          maxLength={120}
          name="orgName"
          onChange={(event) => setOrgName(event.target.value)}
          placeholder="Acme Athletics"
          required
          value={orgName}
        />
      </FormField>
      <FormField hint="Your workspace's web address. You can connect a custom domain later." htmlFor={orgSlugId} label="Subdomain">
        <Input
          id={orgSlugId}
          maxLength={60}
          name="orgSubdomain"
          onChange={(event) => setOrgSlug(slugify(event.target.value))}
          onSlugAutoChange={setOrgSlug}
          persistentPrefix={subdomainPrefix}
          persistentSuffix={subdomainSuffix}
          slugAutoSource={orgName}
          slugValidation={{ kind: "org" }}
          value={orgSlug}
        />
      </FormField>

      <FormField hint="Optional. Helps tailor features for your organization." htmlFor={orgTypeId} label="Organization type">
        <Select
          id={orgTypeId}
          name="orgType"
          onChange={(event) => setOrgType(event.target.value)}
          options={[{ label: "Not specified", value: "" }, ...ORG_TYPE_OPTIONS]}
          value={orgType}
        />
      </FormField>

      <Button className="w-full" disabled={isPending} loading={isPending} type="submit">
        {isPending ? "Creating..." : "Create Organization"}
      </Button>
    </form>
  );
}
