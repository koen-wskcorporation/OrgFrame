import { normalizeHost } from "@/src/shared/domains/customDomains";

export type ParsedHostHeader = {
  host: string;
  port: string;
  hostWithPort: string;
};

export function parseHostWithPort(value: string | null | undefined): ParsedHostHeader {
  const raw = value?.split(",")[0]?.trim() ?? "";
  if (!raw) {
    return {
      host: "",
      port: "",
      hostWithPort: ""
    };
  }

  try {
    const parsed = new URL(`http://${raw}`);
    const host = normalizeHost(parsed.hostname);
    const port = parsed.port.trim();
    return {
      host,
      port,
      hostWithPort: port ? `${host}:${port}` : host
    };
  } catch {
    const host = normalizeHost(raw);
    const portMatch = raw.match(/:(\d+)$/);
    const port = portMatch?.[1]?.trim() ?? "";
    return {
      host,
      port,
      hostWithPort: port ? `${host}:${port}` : host
    };
  }
}
