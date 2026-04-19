"use client";

import { Panel, type PanelProps } from "@orgframe/ui/primitives/panel";
import { Popup, type PopupProps } from "@orgframe/ui/primitives/popup";

export type ContextPanelProps = PanelProps;
export type CreateModalProps = PopupProps;

export function ContextPanel(props: ContextPanelProps) {
  return <Panel {...props} />;
}

export function CreateModal({ size = "lg", ...props }: CreateModalProps) {
  return <Popup size={size} {...props} />;
}
