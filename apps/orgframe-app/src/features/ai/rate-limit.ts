import { getAiConfig } from "@/src/features/ai/config";
import { createSupabaseServer } from "@/src/shared/data-api/server";

export type AiRateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: string;
};

export async function consumeAiRateLimit(userId: string): Promise<AiRateLimitResult> {
  const config = getAiConfig();
  const supabase = await createSupabaseServer();
  type RateLimitRpcRow = {
    allowed: boolean;
    remaining: number;
    reset_at: string;
  };

  const { data, error } = await supabase
    .rpc("consume_ai_rate_limit", {
      input_user_id: userId,
      input_limit: config.rateLimitPerWindow,
      input_window_seconds: config.rateLimitWindowSeconds
    })
    .maybeSingle();

  if (error) {
    throw new Error(`Rate limit failed: ${error.message}`);
  }

  if (!data) {
    return {
      allowed: true,
      remaining: config.rateLimitPerWindow,
      resetAt: new Date(Date.now() + config.rateLimitWindowSeconds * 1000).toISOString()
    };
  }

  const row = data as unknown as RateLimitRpcRow;

  return {
    allowed: Boolean(row.allowed),
    remaining: Number.isFinite(row.remaining) ? Number(row.remaining) : 0,
    resetAt: typeof row.reset_at === "string" ? row.reset_at : new Date(Date.now() + config.rateLimitWindowSeconds * 1000).toISOString()
  };
}
