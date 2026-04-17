"use client";

import { useEffect, useState } from "react";

export function useSiteOrigin() {
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    setOrigin(window.location.origin.replace(/\/+$/, ""));
  }, []);

  return origin;
}
