"use client";

import { useMemo, useState, useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Textarea } from "@orgframe/ui/primitives/textarea";
import { useToast } from "@orgframe/ui/primitives/toast";
import type { OrgPaymentLink } from "@/src/features/billing/types";
import { useOrgSharePopup } from "@/src/features/org-share/OrgShareProvider";
import type { SharePermission, ShareTarget } from "@/src/features/org-share/types";
import { createOrgPaymentLinkAction, setOrgPaymentLinkActiveAction, updateOrgPaymentLinkSharingAction } from "./actions";

function formatCurrency(amountCents: number, currency: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: currency.toUpperCase()
  }).format(amountCents / 100);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function parseLinkSharing(link: OrgPaymentLink): { targets: ShareTarget[]; permission: SharePermission } {
  const sharing = link.metadataJson?.sharing;
  if (!sharing || typeof sharing !== "object") {
    return {
      targets: [],
      permission: "view"
    };
  }

  const candidate = sharing as {
    permission?: string;
    targets?: unknown[];
  };

  const targets = Array.isArray(candidate.targets)
    ? candidate.targets
        .map((target) => {
          if (!target || typeof target !== "object") {
            return null;
          }

          const next = target as Record<string, unknown>;
          if (typeof next.id !== "string" || typeof next.type !== "string" || typeof next.label !== "string") {
            return null;
          }

          const mapped: ShareTarget = {
            id: next.id,
            type: next.type as ShareTarget["type"],
            label: next.label
          };
          if (typeof next.subtitle === "string") {
            mapped.subtitle = next.subtitle;
          }
          return mapped;
        })
        .filter((target): target is ShareTarget => target !== null)
    : [];

  const permission: SharePermission =
    candidate.permission === "edit" || candidate.permission === "comment" || candidate.permission === "view"
      ? candidate.permission
      : "view";

  return {
    targets,
    permission
  };
}

export function PaymentLinksManager({
  orgSlug,
  initialLinks
}: {
  orgSlug: string;
  initialLinks: OrgPaymentLink[];
}) {
  const { toast } = useToast();
  const { openShare } = useOrgSharePopup();
  const [isPending, startTransition] = useTransition();
  const [links, setLinks] = useState<OrgPaymentLink[]>(initialLinks);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [successMessage, setSuccessMessage] = useState("");
  const [amountDollars, setAmountDollars] = useState("25.00");

  const columns = useMemo<DataTableColumn<OrgPaymentLink>[]>(
    () => [
      {
        key: "title",
        label: "Title",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => (
          <div className="space-y-1">
            <p className="font-medium">{row.title}</p>
            <p className="text-xs text-text-muted">{row.description ?? "No description"}</p>
          </div>
        ),
        renderSearchValue: (row) => `${row.title} ${row.description ?? ""}`,
        renderSortValue: (row) => row.title
      },
      {
        key: "amount",
        label: "Amount",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => formatCurrency(row.amountCents, row.currency),
        renderSortValue: (row) => row.amountCents
      },
      {
        key: "status",
        label: "Status",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => (row.isActive ? "Active" : "Paused"),
        renderSearchValue: (row) => (row.isActive ? "active" : "paused"),
        renderSortValue: (row) => (row.isActive ? 1 : 0)
      },
      {
        key: "url",
        label: "Payment URL",
        defaultVisible: true,
        sortable: false,
        renderCell: (row) => <span className="font-mono text-xs text-text-muted">{`/${orgSlug}/pay/${row.slug}`}</span>,
        renderSearchValue: (row) => row.slug
      },
      {
        key: "created",
        label: "Created",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => formatDate(row.createdAt),
        renderSortValue: (row) => row.createdAt
      }
    ],
    [orgSlug]
  );

  function refreshLinkState(updated: OrgPaymentLink) {
    setLinks((current) => current.map((link) => (link.id === updated.id ? updated : link)));
  }

  function handleCopy(path: string) {
    startTransition(() => {
      void (async () => {
        const absoluteUrl = `${window.location.origin}${path}`;
        await navigator.clipboard.writeText(absoluteUrl);
        toast({
          title: "Payment link copied",
          description: absoluteUrl,
          variant: "success"
        });
      })();
    });
  }

  function handleToggle(link: OrgPaymentLink, nextActive: boolean) {
    startTransition(() => {
      void (async () => {
        const result = await setOrgPaymentLinkActiveAction({
          orgSlug,
          linkId: link.id,
          isActive: nextActive
        });

        if (!result.ok) {
          toast({
            title: "Unable to update link",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        refreshLinkState({
          ...link,
          isActive: result.data.isActive
        });
        toast({
          title: result.data.isActive ? "Link activated" : "Link paused",
          variant: "success"
        });
      })();
    });
  }

  function handleShare(link: OrgPaymentLink) {
    const parsed = parseLinkSharing(link);
    const path = `/${orgSlug}/pay/${link.slug}`;

    void openShare({
      title: "Share payment link",
      subtitle: "Select recipients for this payment link.",
      allowedTypes: ["person", "admin", "group"],
      initialTargets: parsed.targets,
      initialPermission: parsed.permission,
      showPermissionControl: true,
      primaryActionLabel: "Save sharing",
      selectedLabel: "Recipients",
      onApply: async (payload) => {
        const result = await updateOrgPaymentLinkSharingAction({
          orgSlug,
          linkId: link.id,
          permission: payload.permission,
          targets: payload.targets
        });

        if (!result.ok) {
          toast({
            title: "Unable to update sharing",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        refreshLinkState(result.data.link);
        toast({
          title: "Sharing updated",
          description: `Use Copy URL to quickly share ${window.location.origin}${path}.`,
          variant: "success"
        });
      }
    });
  }

  function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    startTransition(() => {
      void (async () => {
        const numericAmount = Number.parseFloat(amountDollars);
        if (!Number.isFinite(numericAmount) || numericAmount < 0.5) {
          toast({
            title: "Invalid amount",
            description: "Enter a valid USD amount of at least $0.50.",
            variant: "destructive"
          });
          return;
        }

        const result = await createOrgPaymentLinkAction({
          orgSlug,
          title,
          description,
          amountDollars: numericAmount,
          successMessage
        });

        if (!result.ok) {
          toast({
            title: "Unable to create link",
            description: result.error,
            variant: "destructive"
          });
          return;
        }

        const createdLink = result.data.link;
        const path = `/${orgSlug}/pay/${createdLink.slug}`;
        setLinks((current) => [createdLink, ...current]);
        setTitle("");
        setDescription("");
        setSuccessMessage("");
        setAmountDollars("25.00");

        toast({
          title: "Payment link created",
          description: `${window.location.origin}${path}`,
          variant: "success"
        });
      })();
    });
  }

  return (
    <div className="space-y-4">
      <form className="grid gap-3 rounded-control border bg-surface-muted p-3 md:grid-cols-2" onSubmit={handleCreate}>
        <FormField label="Title">
          <Input onChange={(event) => setTitle(event.target.value)} required value={title} />
        </FormField>

        <FormField hint="USD only for v1" label="Amount (USD)">
          <Input min="0.50" onChange={(event) => setAmountDollars(event.target.value)} required step="0.01" type="number" value={amountDollars} />
        </FormField>

        <FormField className="md:col-span-2" label="Description">
          <Textarea className="min-h-[80px]" onChange={(event) => setDescription(event.target.value)} value={description} />
        </FormField>

        <FormField className="md:col-span-2" hint="Shown after successful payment." label="Success message (optional)">
          <Input onChange={(event) => setSuccessMessage(event.target.value)} value={successMessage} />
        </FormField>

        <div className="md:col-span-2">
          <Button disabled={isPending} type="submit">
            Create payment link
          </Button>
        </div>
      </form>

      <DataTable
        ariaLabel="Payment links"
        columns={columns}
        data={links}
        defaultSort={{ columnKey: "created", direction: "desc" }}
        emptyState={<Alert variant="info">No payment links created yet.</Alert>}
        renderRowActions={(row) => (
          <div className="flex items-center gap-2">
            <Button disabled={isPending} onClick={() => handleShare(row)} size="sm" type="button" variant="secondary">
              Share
            </Button>
            <Button disabled={isPending} onClick={() => handleCopy(`/${orgSlug}/pay/${row.slug}`)} size="sm" type="button" variant="secondary">
              Copy URL
            </Button>
            <Button
              disabled={isPending}
              onClick={() => handleToggle(row, !row.isActive)}
              size="sm"
              type="button"
              variant={row.isActive ? "ghost" : "secondary"}
            >
              {row.isActive ? "Pause" : "Activate"}
            </Button>
          </div>
        )}
        rowActionsLabel="Actions"
        rowKey={(row) => row.id}
        searchPlaceholder="Search payment links..."
        storageKey={`payments-links:${orgSlug}`}
      />
    </div>
  );
}
