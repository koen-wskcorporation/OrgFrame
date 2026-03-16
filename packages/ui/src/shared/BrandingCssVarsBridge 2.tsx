"use client";

import { useEffect } from "react";

type BrandingCssVarsBridgeProps = {
  vars: Record<string, string>;
};

export function BrandingCssVarsBridge({ vars }: BrandingCssVarsBridgeProps) {
  useEffect(() => {
    const panelDock = document.getElementById("panel-dock");

    if (!panelDock) {
      return;
    }

    const previousValues = new Map<string, string>();

    Object.entries(vars).forEach(([key, value]) => {
      previousValues.set(key, panelDock.style.getPropertyValue(key));
      panelDock.style.setProperty(key, value);
    });

    return () => {
      previousValues.forEach((previousValue, key) => {
        if (previousValue) {
          panelDock.style.setProperty(key, previousValue);
          return;
        }

        panelDock.style.removeProperty(key);
      });
    };
  }, [vars]);

  return null;
}
