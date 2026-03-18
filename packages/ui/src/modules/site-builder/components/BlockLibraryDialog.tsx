"use client";

import {
  CalendarClock,
  CalendarDays,
  ClipboardCheck,
  FileText,
  Megaphone,
  LayoutDashboard,
  LayoutList,
  MapPinned,
  PanelTop,
  Sparkles,
  Phone,
  BarChart3,
  Users,
  TableProperties,
  type LucideIcon
} from "lucide-react";
import { Button } from "@orgframe/ui/ui/button";
import { EditorSettingsDialog } from "@orgframe/ui/shared/EditorSettingsDialog";
import { cn } from "@/lib/utils";
import { listBlockDefinitions } from "@/modules/site-builder/blocks/registry";
import type { OrgSiteBlockType } from "@/modules/site-builder/types";

type BlockLibraryDialogProps = {
  open: boolean;
  onClose: () => void;
  onSelect: (type: OrgSiteBlockType) => void;
};

const tileMetaByType: Record<
  OrgSiteBlockType,
  {
    icon: LucideIcon;
    description: string;
  }
> = {
  hero: {
    icon: Sparkles,
    description: "Primary spotlight with headline, call to action, and background image."
  },
  subhero: {
    icon: PanelTop,
    description: "Compact banner-style intro for inner pages."
  },
  cta_grid: {
    icon: LayoutDashboard,
    description: "Card grid of featured links to key programs, forms, or resources."
  },
  cta_card: {
    icon: Megaphone,
    description: "Single promotional card with image, text, and action buttons."
  },
  announcement_highlight: {
    icon: Megaphone,
    description: "Editorial announcement cards for timely public updates."
  },
  stats_metrics: {
    icon: BarChart3,
    description: "Key program and community metrics in compact cards."
  },
  document_links: {
    icon: FileText,
    description: "Policy docs, handbooks, and downloadable resources."
  },
  contact_info: {
    icon: Phone,
    description: "Primary contact channels and organization details."
  },
  schedule_preview: {
    icon: CalendarDays,
    description: "Upcoming schedule summary with optional action links."
  },
  program_catalog: {
    icon: LayoutList,
    description: "Program list with date/type details and optional CTAs."
  },
  events: {
    icon: CalendarClock,
    description: "Event feed with either a vertical list or interactive calendar view."
  },
  form_embed: {
    icon: ClipboardCheck,
    description: "Show a published form directly on the page for signed-in users."
  },
  facility_availability_calendar: {
    icon: MapPinned,
    description: "Public-facing calendar feed of facility bookings and blackout windows."
  },
  facility_space_list: {
    icon: TableProperties,
    description: "Hierarchical status list for spaces with open/closed/booked indicators."
  },
  teams_directory: {
    icon: Users,
    description: "Directory of active teams across published programs."
  }
};

export function BlockLibraryDialog({ open, onClose, onSelect }: BlockLibraryDialogProps) {
  const blocks = listBlockDefinitions();

  return (
    <EditorSettingsDialog
      description="Select a section type to add to this page."
      footer={
        <Button onClick={onClose} size="sm" variant="ghost">
          Close
        </Button>
      }
      size="lg"
      onClose={onClose}
      open={open}
      title="Add Block"
    >
      <div className="space-y-4">
        <p className="rounded-control border bg-surface-muted/50 px-3 py-2 text-xs text-text-muted">
          Choose a block to insert. You can reorder and edit everything after adding.
        </p>

        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {blocks.map((definition) => {
            const tileMeta = tileMetaByType[definition.type];
            const Icon = tileMeta.icon;

            return (
              <button
                className={cn(
                  "group flex h-full flex-col rounded-card border bg-surface p-4 text-left transition-all",
                  "hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-floating",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                )}
                key={definition.type}
                onClick={() => {
                  onSelect(definition.type);
                  onClose();
                }}
                type="button"
              >
                <div className="flex items-start gap-3">
                  <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-control border bg-surface-muted text-text">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-text">{definition.displayName}</p>
                    <p className="mt-1 text-xs text-text-muted">{tileMeta.description}</p>
                  </div>
                </div>
                <div className="mt-4 inline-flex items-center text-xs font-semibold text-accent">Add block</div>
              </button>
            );
          })}
        </div>
      </div>
    </EditorSettingsDialog>
  );
}
