"use client";

import { useTransition } from "react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";
import { Chip } from "@orgframe/ui/primitives/chip";
import { useToast } from "@orgframe/ui/primitives/toast";
import { Plus } from "lucide-react";
import type { AccountPaymentMethod } from "@/src/features/billing/types";
import {
  createAccountPaymentMethodCheckoutFromAccountAction,
  removeAccountPaymentMethodFromAccountAction,
  setDefaultAccountPaymentMethodFromAccountAction
} from "@/app/(account)/settings/actions";

export function AccountPaymentMethodsCard({ paymentMethods }: { paymentMethods: AccountPaymentMethod[] }) {
  const { toast } = useToast();
  const [isPending, startTransition] = useTransition();

  function runAsync(action: () => Promise<void>) {
    startTransition(() => {
      void action();
    });
  }

  function handleAddPaymentMethod() {
    runAsync(async () => {
      const result = await createAccountPaymentMethodCheckoutFromAccountAction();
      if (!result.ok) {
        toast({ title: "Unable to add payment method", description: result.error, variant: "destructive" });
        return;
      }

      window.location.assign(result.data.url);
    });
  }

  function handleSetDefault(paymentMethodId: string) {
    runAsync(async () => {
      const result = await setDefaultAccountPaymentMethodFromAccountAction({ paymentMethodId });
      if (!result.ok) {
        toast({ title: "Unable to set default", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "Default payment method updated", variant: "success" });
      window.location.reload();
    });
  }

  function handleRemove(paymentMethodId: string) {
    runAsync(async () => {
      const result = await removeAccountPaymentMethodFromAccountAction({ paymentMethodId });
      if (!result.ok) {
        toast({ title: "Unable to remove payment method", description: result.error, variant: "destructive" });
        return;
      }

      toast({ title: "Payment method removed", variant: "success" });
      window.location.reload();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Saved Payment Methods</CardTitle>
        <CardDescription>These are tied to your account profile and reusable wherever your account can pay.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Alert variant="info">Cards are collected securely by Stripe in a hosted flow, then managed here.</Alert>

        {paymentMethods.length === 0 ? <Alert variant="info">No payment methods saved yet.</Alert> : null}

        {paymentMethods.map((method) => (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-control border bg-surface-muted px-3 py-2" key={method.id}>
            <div>
              <p className="text-sm font-semibold text-text">
                {(method.brand ?? "Card").toUpperCase()} {method.last4 ? `•••• ${method.last4}` : ""}
              </p>
              <p className="text-xs text-text-muted">
                {method.expMonth && method.expYear ? `Exp ${String(method.expMonth).padStart(2, "0")}/${method.expYear}` : "No expiry on file"}
              </p>
            </div>

            <div className="flex items-center gap-2">
              {method.isDefault ? <Chip color="green" size="compact">Default</Chip> : null}
              {!method.isDefault ? (
                <Button disabled={isPending} onClick={() => handleSetDefault(method.id)} size="sm" variant="secondary">
                  Set default
                </Button>
              ) : null}
              <Button disabled={isPending} onClick={() => handleRemove(method.id)} size="sm" variant="ghost">
                Remove
              </Button>
            </div>
          </div>
        ))}

        <Button disabled={isPending} onClick={handleAddPaymentMethod}>
          <Plus className="h-4 w-4" />
          Add Payment Method
        </Button>
      </CardContent>
    </Card>
  );
}
