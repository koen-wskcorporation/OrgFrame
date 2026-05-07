import { getAiConfig } from "@/src/features/ai/config";

/**
 * Single-shot multimodal call against the existing Vercel AI Gateway.
 *
 * Reuses `AI_GATEWAY_API_KEY` so vision features brand and bill alongside
 * every other AI surface in the app. The default model is Anthropic Claude
 * Sonnet (chosen for spatial reasoning quality on aerial imagery); override
 * with `AI_VISION_MODEL` if a cheaper / different vision model is preferred.
 */
export async function callAiVision(input: {
  prompt: string;
  imageBase64: string;
  imageMimeType?: string;
  maxOutputTokens?: number;
  timeoutMs?: number;
}): Promise<string> {
  const config = getAiConfig();
  const model = process.env.AI_VISION_MODEL?.trim() || "anthropic/claude-sonnet-4-5";
  const mime = input.imageMimeType ?? "image/png";

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), input.timeoutMs ?? 45_000);

  try {
    const res = await fetch(`${config.gatewayBaseUrl.replace(/\/$/, "")}/responses`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.gatewayApiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              { type: "input_text", text: input.prompt },
              {
                type: "input_image",
                image_url: `data:${mime};base64,${input.imageBase64}`
              }
            ]
          }
        ],
        max_output_tokens: input.maxOutputTokens ?? 4_000
      }),
      signal: controller.signal
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`AI vision request failed (${res.status}): ${body.slice(0, 500)}`);
    }

    const json = (await res.json()) as {
      output_text?: string;
      output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
    };

    if (typeof json.output_text === "string" && json.output_text.length > 0) {
      return json.output_text;
    }
    const fromArr = json.output?.[0]?.content?.[0]?.text;
    if (typeof fromArr === "string" && fromArr.length > 0) {
      return fromArr;
    }
    throw new Error("AI vision returned no text output.");
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Pulls the first JSON object out of an LLM string output, tolerating optional
 * markdown code fences or surrounding commentary.
 */
export function extractJsonBlock<T = unknown>(raw: string): T {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start < 0 || end < 0 || end <= start) {
    throw new Error("AI response did not contain a JSON object.");
  }
  const slice = candidate.slice(start, end + 1);
  return JSON.parse(slice) as T;
}
