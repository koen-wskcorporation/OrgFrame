"use client";

import { Button } from "@orgframe/ui/primitives/button";
import { Popup } from "@orgframe/ui/primitives/popup";
import { cn } from "@orgframe/ui/primitives/utils";

type EditorSettingsDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  size?: "sm" | "md" | "lg" | "xl" | "full";
  footer?: React.ReactNode;
};

export function EditorSettingsDialog({
  open,
  onClose,
  title,
  description,
  children,
  className,
  contentClassName,
  size = "md",
  footer
}: EditorSettingsDialogProps) {
  return (
    <Popup
      contentClassName={cn("break-words [&_*]:max-w-full [&_*]:min-w-0", contentClassName)}
      footer={
        footer ?? (
          <Button onClick={onClose} size="sm">
            Save
          </Button>
        )
      }
      onClose={onClose}
      open={open}
      popupClassName={className}
      size={size}
      subtitle={description}
      title={title}
    >
      <div className="min-w-0">{children}</div>
    </Popup>
  );
}
