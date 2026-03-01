import type { ZodTypeAny } from "zod";
import type { Permission } from "@/modules/core/access";
import type { AiMode, AiResolvedContext } from "@/modules/ai/types";

export type AiToolExecutionContext = {
  requestContext: AiResolvedContext;
  mode: AiMode;
};

export type AiToolDefinition<TInput extends ZodTypeAny, TOutput> = {
  name: string;
  description: string;
  inputSchema: TInput;
  requiredPermissions: Permission[];
  supportsDryRun: boolean;
  execute: (context: AiToolExecutionContext, input: import("zod").infer<TInput>) => Promise<TOutput>;
};

export function hasRequiredPermissions(granted: Permission[], required: Permission[]) {
  if (required.length === 0) {
    return true;
  }

  const grantedSet = new Set(granted);
  return required.every((permission) => grantedSet.has(permission));
}
