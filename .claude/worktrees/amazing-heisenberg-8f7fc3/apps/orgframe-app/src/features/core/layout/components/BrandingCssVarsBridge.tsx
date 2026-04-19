"use client";

import { useEffect } from "react";

type BrandingCssVarsBridgeProps = {
  vars: Record<string, string>;
};

export function BrandingCssVarsBridge({ vars }: BrandingCssVarsBridgeProps) {
  useEffect(() => {
    const panelDock = document.getElementById("panel-dock");
    const targets = [document.body, panelDock].filter((target): target is HTMLElement => Boolean(target));

    if (targets.length === 0) {
      return;
    }

    const previousValuesByTarget = new Map<HTMLElement, Map<string, string>>();

    for (const target of targets) {
      const previousValues = new Map<string, string>();
      Object.entries(vars).forEach(([key, value]) => {
        previousValues.set(key, target.style.getPropertyValue(key));
        target.style.setProperty(key, value);
      });
      previousValuesByTarget.set(target, previousValues);
    }

    return () => {
      for (const [target, previousValues] of previousValuesByTarget.entries()) {
        previousValues.forEach((previousValue, key) => {
          if (previousValue) {
            target.style.setProperty(key, previousValue);
            return;
          }

          target.style.removeProperty(key);
        });
      }
    };
  }, [vars]);

  return null;
}
