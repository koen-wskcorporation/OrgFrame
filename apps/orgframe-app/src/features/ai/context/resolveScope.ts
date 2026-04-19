import type { AIContext } from "@/src/features/ai/context/types";

function getSegments(pathname: string) {
  return pathname.split("/").map((segment) => segment.trim()).filter(Boolean);
}

function fromManageRoute(segments: string[]): AIContext["scope"] {
  const module = segments[1] ?? "";

  if (module === "calendar" || module === "events") {
    return {
      currentModule: "calendar"
    };
  }

  if (module === "facilities") {
    return {
      currentModule: "facilities",
      entityType: segments[2] ? "facility" : undefined,
      entityId: segments[2]
    };
  }

  if (module === "programs") {
    return {
      currentModule: "programs",
      entityType: segments[2] ? "program" : undefined,
      entityId: segments[2]
    };
  }

  if (module === "inbox") {
    return {
      currentModule: "communications"
    };
  }

  if (module === "files") {
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

  if (root === "manage") {
    return fromManageRoute(segments);
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

  if (root === "profiles") {
    return {
      currentModule: "profiles"
    };
  }

  if (root === "settings") {
    return {
      currentModule: "settings"
    };
  }

  return {
    currentModule: "unknown"
  };
}
