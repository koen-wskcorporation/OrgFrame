import type { AIContext } from "@/src/features/ai/context/types";

function getSegments(pathname: string) {
  return pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
}

function fromToolsRoute(segments: string[]): AIContext["scope"] {
  const tool = segments[1] ?? "";

  if (tool === "calendar" || tool === "events") {
    return {
      currentModule: "calendar"
    };
  }

  if (tool === "facilities") {
    return {
      currentModule: "facilities",
      entityType: segments[2] ? "facility" : undefined,
      entityId: segments[2]
    };
  }

  if (tool === "programs") {
    return {
      currentModule: "programs",
      entityType: segments[2] ? "program" : undefined,
      entityId: segments[2]
    };
  }

  if (tool === "inbox") {
    return {
      currentModule: "communications"
    };
  }

  if (tool === "files") {
    return {
      currentModule: "files"
    };
  }

  return {
    currentModule: "unknown"
  };
}

export function resolveScope(pathname: string): AIContext["scope"] {
  const segments = getSegments(pathname);

  if (segments.length === 0) {
    return {
      currentModule: "unknown"
    };
  }

  const root = segments[0] ?? "";

  if (root === "tools") {
    return fromToolsRoute(segments);
  }

  if (root === "calendar") {
    return {
      currentModule: "calendar",
      entityType: segments[1] ? "occurrence" : undefined,
      entityId: segments[1]
    };
  }

  if (root === "facilities") {
    return {
      currentModule: "facilities",
      entityType: segments[1] ? "facility" : undefined,
      entityId: segments[1]
    };
  }

  if (root === "programs" || root === "program") {
    return {
      currentModule: "programs",
      entityType: segments[1] ? "program" : undefined,
      entityId: segments[1]
    };
  }

  if (root === "teams") {
    return {
      currentModule: "teams",
      entityType: segments[1] ? "team" : undefined,
      entityId: segments[1]
    };
  }

  if (root === "communications" || root === "inbox") {
    return {
      currentModule: "communications"
    };
  }

  if (root === "files") {
    return {
      currentModule: "files"
    };
  }

  if (root === "account") {
    if (segments[1] === "players") {
      return {
        currentModule: "players"
      };
    }

    return {
      currentModule: "account"
    };
  }

  return {
    currentModule: "unknown"
  };
}
