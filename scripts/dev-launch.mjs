import net from "node:net";
import { spawn } from "node:child_process";
import { platform } from "node:os";

const rawTargets = process.argv.slice(2).map((value) => value.toLowerCase());
const validTargets = new Set(["app", "web"]);

if (rawTargets.length === 0 || rawTargets.length > 2 || rawTargets.some((target) => !validTargets.has(target))) {
  console.error("Usage: npm run dev app | npm run dev web | npm run dev app web | npm run dev web app");
  process.exit(1);
}

if (rawTargets.length === 2 && rawTargets[0] === rawTargets[1]) {
  console.error("When passing two targets, use one app and one web.");
  process.exit(1);
}

function isPortFree(port) {
  return new Promise((resolve) => {
    const server = net.createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });

    server.listen(port, "0.0.0.0");
  });
}

const preferredPort = 3000;
const fallbackPort = 3001;
const appDevHost = "orgframe.test";
const preferredFree = await isPortFree(preferredPort);
const fallbackFree = await isPortFree(fallbackPort);

/** @type {Map<string, number>} */
const portByTarget = new Map();

if (rawTargets.length === 1) {
  if (!preferredFree && !fallbackFree) {
    console.error("Both ports 3000 and 3001 are in use. Free one of them and try again.");
    process.exit(1);
  }

  portByTarget.set(rawTargets[0], preferredFree ? preferredPort : fallbackPort);
} else {
  if (!preferredFree || !fallbackFree) {
    console.error("To run both apps at once, ports 3000 and 3001 must both be free.");
    process.exit(1);
  }

  // Order-sensitive: first target gets 3000, second gets 3001.
  portByTarget.set(rawTargets[0], preferredPort);
  portByTarget.set(rawTargets[1], fallbackPort);
}

const children = [];
let shuttingDown = false;
let localhostTabsRefreshed = false;

function refreshLocalhostTabsOnMac() {
  if (localhostTabsRefreshed || platform() !== "darwin") return;
  localhostTabsRefreshed = true;

  const script = `
set browserNames to {"Google Chrome", "Brave Browser", "Microsoft Edge", "Arc"}
repeat with browserName in browserNames
  try
    tell application browserName
      repeat with w in windows
        repeat with t in tabs of w
          set pageUrl to URL of t
          if pageUrl starts with "http://localhost" or pageUrl starts with "https://localhost" or pageUrl starts with "http://127.0.0.1" or pageUrl starts with "https://127.0.0.1" then
            tell t to reload
          end if
        end repeat
      end repeat
    end tell
  end try
end repeat

try
  tell application "Safari"
    repeat with w in windows
      repeat with t in tabs of w
        set pageUrl to URL of t
        if pageUrl starts with "http://localhost" or pageUrl starts with "https://localhost" or pageUrl starts with "http://127.0.0.1" or pageUrl starts with "https://127.0.0.1" then
          tell t to do JavaScript "window.location.reload()"
        end if
      end repeat
    end repeat
  end tell
end try
`;

  // Fire-and-forget so shutdown remains fast even if browser scripting is unavailable.
  spawn("osascript", ["-e", script], { stdio: "ignore", detached: true }).unref();
}

function shutdownOthers(exceptPid = null) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const child of children) {
    if (!child.killed && child.pid !== exceptPid) {
      child.kill("SIGTERM");
    }
  }
}

for (const target of rawTargets) {
  const selectedPort = portByTarget.get(target);
  const workspace = target === "app" ? "orgframe-app" : "orgframe-web";
  const hostMessage = target === "app" ? ` at http://${appDevHost}:${selectedPort}` : ` on port ${selectedPort}`;
  console.log(`Starting ${workspace}${hostMessage}...`);
  const extraArgs = ["--port", String(selectedPort)];

  const child = spawn(
    "npm",
    ["run", "dev", "--workspace", workspace, "--", ...extraArgs],
    {
      stdio: "inherit",
      env: process.env
    }
  );

  children.push(child);

  child.on("exit", (code, signal) => {
    if (signal && !shuttingDown) {
      shutdownOthers(child.pid);
      process.kill(process.pid, signal);
      return;
    }

    if (!shuttingDown) {
      shutdownOthers(child.pid);
      process.exit(code ?? 0);
    }
  });
}

process.on("SIGINT", () => {
  shutdownOthers();
  refreshLocalhostTabsOnMac();
  process.exit(130);
});

process.on("SIGTERM", () => {
  shutdownOthers();
  refreshLocalhostTabsOnMac();
  process.exit(143);
});

process.on("exit", () => {
  refreshLocalhostTabsOnMac();
});
