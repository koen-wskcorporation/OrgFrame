import { buildAIContext } from "@/src/features/ai/context/buildAIContext";
import { normalizeAIContextError } from "@/src/features/ai/context/errors";
import type { AIContext } from "@/src/features/ai/context/types";

export async function withAIContext<T>(req: Request, handler: (ctx: AIContext) => Promise<T>): Promise<T> {
  try {
    const ctx = await buildAIContext(req);
    return await handler(ctx);
  } catch (error) {
    throw normalizeAIContextError(error);
  }
}
