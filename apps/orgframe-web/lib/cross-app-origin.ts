type CrossAppTarget = "app" | "web";

const PRODUCTION_ORIGIN: Record<CrossAppTarget, string> = {
  app: "https://app.orgframe.com",
  web: "https://orgframe.com"
};

function parseConfiguredOrigin(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function parseForwardedHost(request: Request, fallbackHost: string): string {
  const forwardedHost = request.headers.get("x-forwarded-host");
  const hostCandidate = (forwardedHost ?? request.headers.get("host") ?? fallbackHost)
    .split(",")[0]
    ?.trim()
    .toLowerCase();
  const host = hostCandidate || fallbackHost;
  return host.split(":")[0] ?? fallbackHost;
}

function parseForwardedProtocol(request: Request, fallbackProtocol: string): string {
  const forwardedProto = request.headers.get("x-forwarded-proto");
  const protocol = (forwardedProto ?? fallbackProtocol.replace(":", "")).trim().toLowerCase();
  return protocol === "http" ? "http" : "https";
}

function mapVercelHost(hostname: string, target: CrossAppTarget): string | null {
  const replacements =
    target === "app"
      ? [
          ["-web-", "-app-"],
          ["orgframe-web", "orgframe-app"],
          ["web-", "app-"]
        ]
      : [
          ["-app-", "-web-"],
          ["orgframe-app", "orgframe-web"],
          ["app-", "web-"]
        ];

  for (const [from, to] of replacements) {
    if (hostname.includes(from)) {
      return hostname.replace(from, to);
    }
  }

  return null;
}

function mapSubdomainHost(hostname: string, target: CrossAppTarget): string | null {
  const labels = hostname.split(".");
  if (labels.length < 3) return null;

  const desired = target;
  const source = target === "app" ? "web" : "app";
  if (labels[0] === source) {
    labels[0] = desired;
    return labels.join(".");
  }

  return null;
}

function resolveLocalOrigin(requestUrl: URL, target: CrossAppTarget): string {
  const host = requestUrl.hostname;
  const protocol = requestUrl.protocol;
  const currentPort = requestUrl.port;

  // If either app is running on 3000/3001, infer the counterpart port dynamically.
  if (currentPort === "3000" || currentPort === "3001") {
    const oppositePort = currentPort === "3000" ? "3001" : "3000";
    if (target === "app") {
      const configuredPort = process.env.ORGFRAME_APP_PORT?.trim();
      return `${protocol}//${host}:${configuredPort || oppositePort}`;
    }
    const configuredPort = process.env.ORGFRAME_WEB_PORT?.trim();
    return `${protocol}//${host}:${configuredPort || oppositePort}`;
  }

  const configuredPort = target === "app" ? process.env.ORGFRAME_APP_PORT : process.env.ORGFRAME_WEB_PORT;
  const defaultPort = target === "app" ? "3001" : "3000";
  const targetPort = configuredPort?.trim() || defaultPort;
  return `${protocol}//${host}:${targetPort}`;
}

export function resolveCrossAppOrigin(request: Request, target: CrossAppTarget): string {
  const configuredAppOrigin = parseConfiguredOrigin(process.env.ORGFRAME_APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN);
  const configuredWebOrigin = parseConfiguredOrigin(process.env.ORGFRAME_WEB_ORIGIN ?? process.env.NEXT_PUBLIC_WEB_ORIGIN);
  const configuredTargetOrigin = target === "app" ? configuredAppOrigin : configuredWebOrigin;
  if (configuredTargetOrigin) {
    return configuredTargetOrigin;
  }

  const requestUrl = new URL(request.url);
  const hostname = parseForwardedHost(request, requestUrl.host);
  const protocol = parseForwardedProtocol(request, requestUrl.protocol);

  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
    return resolveLocalOrigin(requestUrl, target);
  }

  if (hostname === "orgframe.com" || hostname === "www.orgframe.com" || hostname === "app.orgframe.com") {
    return PRODUCTION_ORIGIN[target];
  }

  const subdomainMapped = mapSubdomainHost(hostname, target);
  if (subdomainMapped) {
    return `https://${subdomainMapped}`;
  }

  if (hostname.endsWith(".vercel.app")) {
    const mappedHost = mapVercelHost(hostname, target);
    if (mappedHost) {
      return `https://${mappedHost}`;
    }
  }

  if (protocol === "http") {
    return resolveLocalOrigin(requestUrl, target);
  }

  // Last-resort fallback should keep users on their own domain, not a hardcoded one.
  return `${requestUrl.protocol}//${requestUrl.hostname}`;
}
