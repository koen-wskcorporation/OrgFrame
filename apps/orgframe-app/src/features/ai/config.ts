export class MissingAiGatewayKeyError extends Error {
  constructor() {
    super("Missing AI_GATEWAY_API_KEY.");
    this.name = "MissingAiGatewayKeyError";
  }
}

export type AiConfig = {
  gatewayApiKey: string;
  gatewayBaseUrl: string;
  model: string;
  fallbackModels: string[];
  requestTimeoutMs: number;
  retryAttempts: number;
  retryBaseDelayMs: number;
  maxOutputTokens: number;
  maxConcurrentRequests: number;
  rateLimitPerWindow: number;
  rateLimitWindowSeconds: number;
};

let cachedConfig: AiConfig | null = null;

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

function readPositiveInt(name: string, fallback: number) {
  const raw = readEnv(name);
  if (!raw) {
    return fallback;
  }

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function readCsv(name: string) {
  const raw = readEnv(name);
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function getAiConfig(): AiConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const gatewayApiKey = readEnv("AI_GATEWAY_API_KEY");
  if (!gatewayApiKey) {
    throw new MissingAiGatewayKeyError();
  }

  cachedConfig = {
    gatewayApiKey,
    gatewayBaseUrl: readEnv("AI_GATEWAY_BASE_URL") || "https://ai-gateway.vercel.sh/v1",
    model: readEnv("AI_MODEL") || "google/gemini-2.5-flash",
    fallbackModels: readCsv("AI_FALLBACK_MODELS"),
    requestTimeoutMs: readPositiveInt("AI_REQUEST_TIMEOUT_MS", 30_000),
    retryAttempts: readPositiveInt("AI_RETRY_ATTEMPTS", 3),
    retryBaseDelayMs: readPositiveInt("AI_RETRY_BASE_DELAY_MS", 350),
    maxOutputTokens: readPositiveInt("AI_MAX_OUTPUT_TOKENS", 1_200),
    maxConcurrentRequests: readPositiveInt("AI_MAX_CONCURRENT_REQUESTS", 6),
    rateLimitPerWindow: readPositiveInt("AI_RATE_LIMIT_PER_WINDOW", 20),
    rateLimitWindowSeconds: readPositiveInt("AI_RATE_LIMIT_WINDOW_SECONDS", 300)
  };

  return cachedConfig;
}
