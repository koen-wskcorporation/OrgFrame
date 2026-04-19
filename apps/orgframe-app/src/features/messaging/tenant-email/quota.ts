import "server-only";

import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";

const DEFAULT_DAILY_CAP = Number(process.env.EMAIL_DEFAULT_DAILY_CAP ?? 1000);

export async function tryReserveSendSlot(orgId: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data, error } = await supabase
    .schema("messaging")
    .rpc("try_reserve_send_slot", {
      p_org_id: orgId,
      p_default_cap: DEFAULT_DAILY_CAP
    });

  if (error) {
    throw new Error(`Failed to reserve send slot: ${error.message}`);
  }

  return data === true;
}
