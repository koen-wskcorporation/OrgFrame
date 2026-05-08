"use client";

import { useMemo } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Chip } from "@orgframe/ui/primitives/chip";
import { DataTable, type DataTableColumn } from "@orgframe/ui/primitives/data-table";
import type { OrgPaymentTransaction } from "@/src/features/billing/types";

function formatCurrency(value: number | null) {
  if (typeof value !== "number") {
    return "-";
  }

  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(value);
}

function formatDate(value: string | null) {
  if (!value) {
    return "-";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(date);
}

function statusChip(status: string | null) {
  const normalized = (status ?? "").toLowerCase();
  if (normalized === "paid" || normalized === "succeeded" || normalized === "successful" || normalized === "complete") {
    return (
      <Chip color="green">
        {status ?? "paid"}
      </Chip>
    );
  }

  if (normalized === "failed" || normalized === "canceled" || normalized === "cancelled" || normalized === "expired") {
    return (
      <Chip color="red">
        {status ?? "failed"}
      </Chip>
    );
  }

  if (normalized === "pending" || normalized === "processing" || normalized === "open") {
    return (
      <Chip color="yellow">
        {status ?? "pending"}
      </Chip>
    );
  }

  return (
    <Chip color="neutral">
      {status ?? "unknown"}
    </Chip>
  );
}

export function PaymentsTransactionsTable({ transactions }: { transactions: OrgPaymentTransaction[] }) {
  const columns = useMemo<DataTableColumn<OrgPaymentTransaction>[]>(
    () => [
      {
        key: "paymentDate",
        label: "Date",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => formatDate(row.paymentDate ?? row.createdAt),
        renderSearchValue: (row) => row.paymentDate ?? row.createdAt,
        renderSortValue: (row) => row.paymentDate ?? row.createdAt
      },
      {
        key: "paymentStatus",
        label: "Status",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => statusChip(row.paymentStatus),
        renderSearchValue: (row) => row.paymentStatus ?? "",
        renderSortValue: (row) => row.paymentStatus ?? ""
      },
      {
        key: "paymentAmount",
        label: "Amount",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => <span className="font-medium">{formatCurrency(row.paymentAmount)}</span>,
        renderSearchValue: (row) => String(row.paymentAmount ?? ""),
        renderSortValue: (row) => row.paymentAmount ?? 0
      },
      {
        key: "paidRegistrationFee",
        label: "Registration Fee",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => formatCurrency(row.paidRegistrationFee),
        renderSearchValue: (row) => String(row.paidRegistrationFee ?? ""),
        renderSortValue: (row) => row.paidRegistrationFee ?? 0
      },
      {
        key: "paidCcFee",
        label: "Card Fee",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => formatCurrency(row.paidCcFee),
        renderSearchValue: (row) => String(row.paidCcFee ?? ""),
        renderSortValue: (row) => row.paidCcFee ?? 0
      },
      {
        key: "orderId",
        label: "Order ID",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => <span className="font-mono text-xs text-text-muted">{row.orderId ?? "-"}</span>,
        renderSearchValue: (row) => row.orderId ?? "",
        renderSortValue: (row) => row.orderId ?? ""
      },
      {
        key: "sourcePaymentKey",
        label: "Source Payment Key",
        defaultVisible: true,
        sortable: true,
        renderCell: (row) => <span className="font-mono text-xs text-text-muted">{row.sourcePaymentKey ?? "-"}</span>,
        renderSearchValue: (row) => row.sourcePaymentKey ?? "",
        renderSortValue: (row) => row.sourcePaymentKey ?? ""
      }
    ],
    []
  );

  return (
    <DataTable
      ariaLabel="Payment transactions"
      columns={columns}
      data={transactions}
      defaultSort={{ columnKey: "paymentDate", direction: "desc" }}
      emptyState={<Alert variant="info">No payment transactions found for this organization yet.</Alert>}
      rowKey={(row) => row.id}
      searchPlaceholder="Search transactions..."
      storageKey="payments-transactions"
    />
  );
}
