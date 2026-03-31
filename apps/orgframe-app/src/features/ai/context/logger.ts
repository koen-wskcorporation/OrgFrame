export function logAIContext(input: {
  requestId: string;
  userId: string;
  orgId: string | null;
  module: string;
}) {
  console.info("[ai-context]", {
    requestId: input.requestId,
    userId: input.userId,
    orgId: input.orgId,
    module: input.module
  });
}
