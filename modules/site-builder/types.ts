import type { ComponentType } from "react";
import type { LinkValue, SiteButton } from "@/lib/links";
import type { CalendarPublicCatalogItem } from "@/modules/calendar/types";
import type { OrgForm } from "@/modules/forms/types";
import type { PlayerPickerItem } from "@/modules/players/types";
import type { ProgramCatalogItem } from "@/modules/programs/types";
import type { ProgramNode } from "@/modules/programs/types";

export type OrgSiteBlockType =
  | "hero"
  | "subhero"
  | "cta_grid"
  | "cta_card"
  | "schedule_preview"
  | "program_catalog"
  | "events"
  | "form_embed"
  | "facility_availability_calendar"
  | "facility_space_list";

export type HeroBlockConfig = {
  headline: string;
  subheadline: string;
  buttons: SiteButton[];
  backgroundImagePath: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
};

export type SubheroBlockConfig = {
  headline: string;
  subheadline: string;
  buttons: SiteButton[];
};

export type CtaGridItem = {
  id: string;
  title: string;
  description: string;
  link: LinkValue;
};

export type CtaGridBlockConfig = {
  title: string;
  items: CtaGridItem[];
};

export type CtaCardBlockConfig = {
  heading: string;
  body: string;
  imagePath: string | null;
  focalX: number;
  focalY: number;
  zoom: number;
  accentHighlight: boolean;
  buttons: SiteButton[];
};

export type SchedulePreviewBlockConfig = {
  title: string;
  body: string;
  buttons: SiteButton[];
};

export type ProgramCatalogBlockConfig = {
  title: string;
  body: string;
  maxItems: number;
  showDates: boolean;
  showType: boolean;
  buttons: SiteButton[];
};

export type EventsBlockConfig = {
  title: string;
  body: string;
  style: "list" | "calendar";
  maxItems: number;
  showPastEvents: boolean;
  calendarDefaultView: "month" | "week" | "day";
  emptyMessage: string;
  buttons: SiteButton[];
};

export type FormEmbedBlockConfig = {
  title: string;
  body: string;
  formId: string | null;
};

export type FacilityAvailabilityCalendarBlockConfig = {
  title: string;
  body: string;
  defaultView: "month" | "week" | "day";
  showPendingReservations: boolean;
  emptyMessage: string;
};

export type FacilitySpaceListBlockConfig = {
  title: string;
  body: string;
  maxItems: number;
  showOnlyBookable: boolean;
  showHierarchy: boolean;
  emptyMessage: string;
};

export type OrgSiteBlockConfigMap = {
  hero: HeroBlockConfig;
  subhero: SubheroBlockConfig;
  cta_grid: CtaGridBlockConfig;
  cta_card: CtaCardBlockConfig;
  schedule_preview: SchedulePreviewBlockConfig;
  program_catalog: ProgramCatalogBlockConfig;
  events: EventsBlockConfig;
  form_embed: FormEmbedBlockConfig;
  facility_availability_calendar: FacilityAvailabilityCalendarBlockConfig;
  facility_space_list: FacilitySpaceListBlockConfig;
};

export type OrgPageBlock<TType extends OrgSiteBlockType = OrgSiteBlockType> = {
  id: string;
  type: TType;
  config: OrgSiteBlockConfigMap[TType];
};

export type OrgSitePage = {
  id: string;
  orgId: string;
  slug: string;
  title: string;
  isPublished: boolean;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type OrgManagePage = {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type OrgSitePageWithBlocks = {
  page: OrgSitePage;
  blocks: OrgPageBlock[];
};

export type BlockContext = {
  orgSlug: string;
  orgName: string;
  pageSlug: string;
};

export type OrgSiteRuntimeData = {
  programCatalogItems?: ProgramCatalogItem[];
  publicCalendarItems?: CalendarPublicCatalogItem[];
  // Temporary alias while all callsites migrate in one release.
  eventsCatalogItems?: CalendarPublicCatalogItem[];
  facilityAvailability?: {
    generatedAtUtc: string;
    spaces: Array<{
      id: string;
      parentSpaceId: string | null;
      name: string;
      slug: string;
      spaceKind:
        | "facility"
        | "zone"
        | "building"
        | "section"
        | "field"
        | "court"
        | "diamond"
        | "rink"
        | "room"
        | "amenity"
        | "parking"
        | "support_area"
        | "floor"
        | "custom";
      spaceTypeKey: string;
      status: "open" | "closed" | "archived";
      isBookable: boolean;
      timezone: string;
      currentStatus: "open" | "closed" | "booked";
      nextAvailableAtUtc: string | null;
    }>;
    reservations: Array<{
      id: string;
      spaceId: string;
      reservationKind: "booking" | "blackout";
      status: "pending" | "approved";
      publicLabel: string | null;
      startsAtUtc: string;
      endsAtUtc: string;
      timezone: string;
    }>;
  };
  formEmbed?: {
    publishedForms: OrgForm[];
    viewer: {
      id: string;
      email: string | null;
    } | null;
    players: PlayerPickerItem[];
    programNodesByProgramId: Record<string, ProgramNode[]>;
  };
};

export type BlockRenderProps<TType extends OrgSiteBlockType> = {
  block: OrgPageBlock<TType>;
  context: BlockContext;
  runtimeData: OrgSiteRuntimeData;
  isEditing: boolean;
};

export type BlockEditorProps<TType extends OrgSiteBlockType> = {
  block: OrgPageBlock<TType>;
  context: BlockContext;
  runtimeData: OrgSiteRuntimeData;
  onChange: (block: OrgPageBlock<TType>) => void;
};

export type DraftBlockInput = {
  id?: string;
  type: string;
  config: unknown;
};

export type BlockDefinition<TType extends OrgSiteBlockType> = {
  type: TType;
  displayName: string;
  defaultConfig: (context: BlockContext) => OrgSiteBlockConfigMap[TType];
  sanitizeConfig: (config: unknown, context: BlockContext) => OrgSiteBlockConfigMap[TType];
  Render: ComponentType<BlockRenderProps<TType>>;
  Editor: ComponentType<BlockEditorProps<TType>>;
};
