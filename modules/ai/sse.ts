import type { AiSseEventMap, AiSseEventName } from "@/modules/ai/types";

const encoder = new TextEncoder();

export function createSseResponse(handler: (emit: <T extends AiSseEventName>(event: T, payload: AiSseEventMap[T]) => void) => Promise<void>) {
  const stream = new ReadableStream({
    async start(controller) {
      const emit = <T extends AiSseEventName>(event: T, payload: AiSseEventMap[T]) => {
        controller.enqueue(encoder.encode(`event: ${event}\n`));
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
      };

      try {
        await handler(emit);
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown AI failure.";
        emit("error", {
          code: "internal_error",
          message,
          retryable: false
        });
      } finally {
        controller.close();
      }
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no"
    }
  });
}
