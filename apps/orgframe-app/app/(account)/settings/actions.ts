"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createCheckoutSessionForAccountPaymentMethod, removeAccountPaymentMethod, setDefaultAccountPaymentMethod } from "@/src/features/billing/service";
import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";

type AccountActionResult<TData = undefined> =
  | {
      ok: true;
      data: TData;
    }
  | {
      ok: false;
      error: string;
    };

const paymentMethodSchema = z.object({
  paymentMethodId: z.string().uuid()
});

function asError(error: string): AccountActionResult<never> {
  return {
    ok: false,
    error
  };
}

export async function createAccountPaymentMethodCheckoutFromAccountAction(): Promise<AccountActionResult<{ url: string }>> {
  try {
    const user = await getSessionUser();
    if (!user) {
      return asError("You must be signed in to add payment methods.");
    }

    const url = await createCheckoutSessionForAccountPaymentMethod({
      user,
      successPath: "/account?saved=payment_method",
      cancelPath: "/account?error=payment_method_cancelled"
    });

    return {
      ok: true,
      data: {
        url
      }
    };
  } catch {
    return asError("Unable to start payment method setup right now.");
  }
}

export async function removeAccountPaymentMethodFromAccountAction(input: z.input<typeof paymentMethodSchema>): Promise<AccountActionResult<{ removed: boolean }>> {
  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid remove payment method request.");
  }

  try {
    const user = await getSessionUser();
    if (!user) {
      return asError("You must be signed in to remove payment methods.");
    }

    await removeAccountPaymentMethod({
      userId: user.id,
      paymentMethodId: parsed.data.paymentMethodId
    });

    revalidatePath("/account");

    return {
      ok: true,
      data: {
        removed: true
      }
    };
  } catch {
    return asError("Unable to remove payment method.");
  }
}

export async function setDefaultAccountPaymentMethodFromAccountAction(input: z.input<typeof paymentMethodSchema>): Promise<AccountActionResult<{ updated: boolean }>> {
  const parsed = paymentMethodSchema.safeParse(input);
  if (!parsed.success) {
    return asError("Invalid default payment method request.");
  }

  try {
    const user = await getSessionUser();
    if (!user) {
      return asError("You must be signed in to update payment methods.");
    }

    await setDefaultAccountPaymentMethod({
      userId: user.id,
      paymentMethodId: parsed.data.paymentMethodId
    });

    revalidatePath("/account");

    return {
      ok: true,
      data: {
        updated: true
      }
    };
  } catch {
    return asError("Unable to update default payment method.");
  }
}
