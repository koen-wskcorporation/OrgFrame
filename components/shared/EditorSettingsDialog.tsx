"use client";

import { Button } from "@/components/ui/button";
import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";

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
  size: _size = "md",
  footer
}: EditorSettingsDialogProps) {
  return (
    <Panel
      contentClassName={cn("break-words [&_*]:max-w-full [&_*]:min-w-0", contentClassName)}
      footer={
        footer ?? (
          <Button onClick={onClose} size="sm" variant="secondary">
            Done
          </Button>
        )
      }
      onClose={onClose}
      open={open}
      panelClassName={className}
      subtitle={description}
      title={title}
    >
      <div className="min-w-0">{children}</div>
    </Panel>
  );
}
