import { NextResponse } from "next/server";

function getLoginTarget(request: Request) {
  const configuredOrigin = process.env.ORGFRAME_APP_ORIGIN ?? process.env.NEXT_PUBLIC_APP_ORIGIN;
  if (configuredOrigin) {
    return new URL("/auth/login", configuredOrigin);
  }

  const requestUrl = new URL(request.url);
  const host = request.headers.get("host") ?? requestUrl.host;
  const hostname = requestUrl.hostname;

  if (host === "orgframe.com" || host === "www.orgframe.com") {
    return new URL("https://app.orgframe.com/auth/login");
  }

  // Local defaults keep /login as an internal URI while still allowing app-flow testing.
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
    const configuredPort = process.env.ORGFRAME_APP_PORT;
    if (configuredPort) {
      return new URL(`/auth/login`, `${requestUrl.protocol}//${hostname}:${configuredPort}`);
    }

    if (requestUrl.port === "3000") {
      return new URL(`/auth/login`, `${requestUrl.protocol}//${hostname}:3001`);
    }
    if (requestUrl.port === "3001") {
      return new URL(`/auth/login`, `${requestUrl.protocol}//${hostname}:3000`);
    }

    return new URL(`/auth/login`, `${requestUrl.protocol}//${hostname}:3000`);
  }

  if (host.endsWith(".vercel.app")) {
    if (host.includes("orgframe-web")) {
      return new URL(`https://${host.replace("orgframe-web", "orgframe-app")}/auth/login`);
    }
    if (host.includes("-web-")) {
      return new URL(`https://${host.replace("-web-", "-app-")}/auth/login`);
    }
  }

  return new URL("/auth/login", requestUrl);
}

export async function GET(request: Request) {
  return NextResponse.redirect(getLoginTarget(request), { status: 307 });
}
