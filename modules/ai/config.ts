export class MissingOpenAiKeyError extends Error {
  constructor() {
    super("Missing OPENAI_API_KEY.");
    this.name = "MissingOpenAiKeyError";
  }
}

export type AiConfig = {
  apiKey: string;
  model: string;
};

let cachedConfig: AiConfig | null = null;

function readEnv(name: string) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export function getAiConfig(): AiConfig {
  if (cachedConfig) {
    return cachedConfig;
  }

  const apiKey = readEnv("OPENAI_API_KEY");
  if (!apiKey) {
    throw new MissingOpenAiKeyError();
  }

  cachedConfig = {
    apiKey,
    model: readEnv("OPENAI_MODEL") || "gpt-4.1-mini"
  };

  return cachedConfig;
}
