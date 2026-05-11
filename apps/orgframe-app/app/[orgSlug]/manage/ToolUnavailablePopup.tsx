"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@orgframe/ui/primitives/button";
import { Popup } from "@orgframe/ui/primitives/popup";

type ToolUnavailablePopupProps = {
  toolLabel: string;
};

export function ToolUnavailablePopup({ toolLabel }: ToolUnavailablePopupProps) {
  const router = useRouter();

  return (
    <Popup
      closeOnBackdrop={false}
      footer={
        <Button onClick={() => router.back()} type="button" variant="primary">
          Go back
        </Button>
      }
      onClose={() => router.back()}
      open
      size="sm"
      subtitle={`Your organization doesn't have access to ${toolLabel} yet. Ask an admin to enable it in organization settings.`}
      title={`${toolLabel} isn't enabled`}
    >
      <p className="text-sm text-text-muted">
        Once {toolLabel} is enabled for this organization, this page and the features that depend on it will become available.
      </p>
    </Popup>
  );
}
