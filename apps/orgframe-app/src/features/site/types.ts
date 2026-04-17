import type { ComponentType } from "react";
import type { LinkValue, SiteButton } from "@/src/shared/links";
import type { CalendarPublicCatalogItem } from "@/src/features/calendar/types";
import type { OrgForm } from "@/src/features/forms/types";
import type { PlayerPickerItem } from "@/src/features/players/types";
import type { ProgramCatalogItem } from "@/src/features/programs/types";
import type { ProgramNode } from "@/src/features/programs/types";
import type { ProgramTeamDirectoryItem } from "@/src/features/programs/types";

export type OrgSiteBlockType =
  | "hero"
  | "subhero"
  | "cta_grid"
  | "cta_card"
  | "announcement_highlight"
  | "stats_metrics"
  | "document_links"
  | "contact_info"
  | "schedule_preview"
  | "program_catalog"
  | "events"
  | "form_embed"
  | "facility_availability_calendar"
  | "facility_space_list"
  | "teams_directory";

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

export type AnnouncementHighlightItem = {
  id: string;
  title: string;
  body: string;
  dateLabel: string;
};

export type AnnouncementHighlightBlockConfig = {
  title: string;
  items: AnnouncementHighlightItem[];
};

export type StatsMetricsItem = {
  id: string;
  label: string;
  value: string;
  detail: string;
};

export type StatsMetricsBlockConfig = {
  title: string;
  items: StatsMetricsItem[];
};

export type DocumentLinksItem = {
  id: string;
  title: string;
  description: string;
  href: string;
};

export type DocumentLinksBlockConfig = {
  title: string;
  items: DocumentLinksItem[];
};

export type ContactInfoBlockConfig = {
  title: string;
  body: string;
  email: string;
  phone: string;
  address: string;
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

export type TeamsDirectoryBlockConfig = {
  title: string;
  body: string;
  maxItems: number;
  showProgram: boolean;
  showDivision: boolean;
  showCounts: boolean;
  emptyMessage: string;
};

export type OrgSiteBlockConfigMap = {
  hero: HeroBlockConfig;
  subhero: SubheroBlockConfig;
  cta_grid: CtaGridBlockConfig;
  cta_card: CtaCardBlockConfig;
  announcement_highlight: AnnouncementHighlightBlockConfig;
  stats_metrics: StatsMetricsBlockConfig;
  document_links: DocumentLinksBlockConfig;
  contact_info: ContactInfoBlockConfig;
  schedule_preview: SchedulePreviewBlockConfig;
  program_catalog: ProgramCatalogBlockConfig;
  events: EventsBlockConfig;
  form_embed: FormEmbedBlockConfig;
  facility_availability_calendar: FacilityAvailabilityCalendarBlockConfig;
  facility_space_list: FacilitySpaceListBlockConfig;
  teams_directory: TeamsDirectoryBlockConfig;
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
  pageLifecycle: "permanent" | "temporary";
  temporaryWindowStartUtc: string | null;
  temporaryWindowEndUtc: string | null;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type OrgManagePage = {
  id: string;
  slug: string;
  title: string;
  isPublished: boolean;
  pageLifecycle: "permanent" | "temporary";
  temporaryWindowStartUtc: string | null;
  temporaryWindowEndUtc: string | null;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type OrgNavLinkType = "none" | "internal" | "external";

export type OrgNavItem = {
  id: string;
  orgId: string;
  parentId: string | null;
  label: string;
  linkType: OrgNavLinkType;
  pageSlug: string | null;
  externalUrl: string | null;
  openInNewTab: boolean;
  isVisible: boolean;
  sortIndex: number;
  createdAt: string;
  updatedAt: string;
};

export type OrgSiteStructureNodeKind = "static_page" | "static_link" | "dynamic_page" | "dynamic_link" | "system_generated";

export type OrgSiteStructureSourceType = "none" | "programs_tree" | "published_forms" | "published_events";

export type OrgSiteStructureChildBehavior = "manual" | "generated_locked" | "generated_with_manual_overrides";

export type OrgSiteStructureLabelBehavior = "manual" | "source_name";

export type OrgSiteStructurePageLifecycle = "permanent" | "temporary";

export type OrgSiteStructureNode = {
  id: string;
  orgId: string;
  parentId: string | null;
  sortIndex: number;
  label: string;
  nodeKind: OrgSiteStructureNodeKind;
  pageSlug: string | null;
  externalUrl: string | null;
  pageLifecycle: OrgSiteStructurePageLifecycle;
  sourceType: OrgSiteStructureSourceType;
  sourceScopeJson: Record<string, unknown>;
  generationRulesJson: Record<string, unknown>;
  childBehavior: OrgSiteStructureChildBehavior;
  routeBehaviorJson: Record<string, unknown>;
  labelBehavior: OrgSiteStructureLabelBehavior;
  temporaryWindowStartUtc: string | null;
  temporaryWindowEndUtc: string | null;
  isClickable: boolean;
  isVisible: boolean;
  isSystemNode: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedOrgSiteStructureNode = {
  id: string;
  parentId: string | null;
  label: string;
  href: string | null;
  target: "_blank" | null;
  rel: string | null;
  sortIndex: number;
  nodeKind: OrgSiteStructureNodeKind | "system_generated";
  sourceType: OrgSiteStructureSourceType;
  pageLifecycle: OrgSiteStructurePageLifecycle;
  isVisible: boolean;
  isClickable: boolean;
  isGenerated: boolean;
  isDerived: boolean;
  isEditable: boolean;
  reasonDisabled: string | null;
  metaJson: Record<string, unknown>;
  children: ResolvedOrgSiteStructureNode[];
};

export type OrgSiteStructureItemType = "page" | "placeholder" | "dynamic";

export type OrgSiteStructureDynamicSource = "programs" | "forms" | "events";

export type OrgSiteStructureProgramsHierarchyMode =
  | "programs_only"
  | "programs_divisions"
  | "programs_divisions_teams"
  | "teams_by_division";

export type OrgSiteStructureDynamicConfig = {
  sourceType: OrgSiteStructureDynamicSource;
  hierarchyMode?: OrgSiteStructureProgramsHierarchyMode | "flat";
  includeEmptyGroups?: boolean;
  showGeneratedChildrenInMenu?: boolean;
  labelOverride?: string | null;
  visibilityRules?: Record<string, unknown>;
};

export type OrgSiteStructureLinkTarget =
  | {
      kind: "page";
      pageSlug: string;
    }
  | {
      kind: "external";
      url: string;
    }
  | {
      kind: "dynamic";
    }
  | {
      kind: "none";
    };

export type OrgSiteStructureItem = {
  id: string;
  orgId: string;
  parentId: string | null;
  type: OrgSiteStructureItemType;
  title: string;
  slug: string;
  urlPath: string;
  description: string | null;
  icon: string | null;
  showInMenu: boolean;
  isPublished: boolean;
  openInNewTab: boolean;
  orderIndex: number;
  dynamicConfigJson: Record<string, unknown>;
  linkTargetJson: Record<string, unknown>;
  flagsJson: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type ResolvedOrgSiteStructureItemNode = {
  id: string;
  parentId: string | null;
  title: string;
  href: string | null;
  target: "_blank" | null;
  rel: string | null;
  orderIndex: number;
  itemType: OrgSiteStructureItemType;
  isVisible: boolean;
  isGenerated: boolean;
  isEditable: boolean;
  reasonDisabled: string | null;
  badges: string[];
  metaJson: Record<string, unknown>;
  children: ResolvedOrgSiteStructureItemNode[];
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
  teamsDirectoryItems?: ProgramTeamDirectoryItem[];
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
      spaceKind: "building" | "floor" | "room" | "field" | "court" | "custom";
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
