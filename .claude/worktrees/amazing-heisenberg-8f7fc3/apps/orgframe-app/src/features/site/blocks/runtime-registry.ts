import { createId } from "@/src/features/site/blocks/helpers";
import { CtaGridBlockRender, createDefaultCtaGridConfig, sanitizeCtaGridConfig } from "@/src/features/site/blocks/cta-grid";
import { CtaCardBlockRender, createDefaultCtaCardConfig, sanitizeCtaCardConfig } from "@/src/features/site/blocks/cta-card";
import {
  AnnouncementHighlightBlockRender,
  createDefaultAnnouncementHighlightConfig,
  sanitizeAnnouncementHighlightConfig
} from "@/src/features/site/blocks/announcement-highlight";
import { createDefaultStatsMetricsConfig, sanitizeStatsMetricsConfig, StatsMetricsBlockRender } from "@/src/features/site/blocks/stats-metrics";
import { createDefaultDocumentLinksConfig, DocumentLinksBlockRender, sanitizeDocumentLinksConfig } from "@/src/features/site/blocks/document-links";
import { ContactInfoBlockRender, createDefaultContactInfoConfig, sanitizeContactInfoConfig } from "@/src/features/site/blocks/contact-info";
import { createDefaultHeroConfig, HeroBlockRender, sanitizeHeroConfig } from "@/src/features/site/blocks/hero";
import { createDefaultSubheroConfig, sanitizeSubheroConfig, SubheroBlockRender } from "@/src/features/site/blocks/subhero";
import { createDefaultSchedulePreviewConfig, sanitizeSchedulePreviewConfig, SchedulePreviewBlockRender } from "@/src/features/site/blocks/schedule-preview";
import { createDefaultProgramCatalogConfig, ProgramCatalogBlockRender, sanitizeProgramCatalogConfig } from "@/src/features/site/blocks/program-catalog";
import { createDefaultEventsConfig, EventsBlockRender, sanitizeEventsConfig } from "@/src/features/site/blocks/events";
import { createDefaultFormEmbedConfig, FormEmbedBlockRender, sanitizeFormEmbedConfig } from "@/src/features/site/blocks/form-embed";
import {
  createDefaultFacilityAvailabilityCalendarConfig,
  FacilityAvailabilityCalendarBlockRender,
  sanitizeFacilityAvailabilityCalendarConfig
} from "@/src/features/site/blocks/facility-availability-calendar";
import {
  createDefaultFacilitySpaceListConfig,
  FacilitySpaceListBlockRender,
  sanitizeFacilitySpaceListConfig
} from "@/src/features/site/blocks/facility-space-list";
import { createDefaultTeamsDirectoryConfig, sanitizeTeamsDirectoryConfig, TeamsDirectoryBlockRender } from "@/src/features/site/blocks/teams-directory";
import type { BlockContext, BlockDefinition, OrgPageBlock, OrgSiteBlockType } from "@/src/features/site/types";

type RuntimeBlockDefinition<TType extends OrgSiteBlockType> = Omit<BlockDefinition<TType>, "Editor">;

type AnyRuntimeBlockDefinition = {
  [K in OrgSiteBlockType]: RuntimeBlockDefinition<K>;
};

const runtimeBlockRegistry: AnyRuntimeBlockDefinition = {
  hero: {
    type: "hero",
    displayName: "Hero",
    defaultConfig: createDefaultHeroConfig,
    sanitizeConfig: sanitizeHeroConfig,
    Render: HeroBlockRender
  },
  subhero: {
    type: "subhero",
    displayName: "Subhero",
    defaultConfig: createDefaultSubheroConfig,
    sanitizeConfig: sanitizeSubheroConfig,
    Render: SubheroBlockRender
  },
  cta_grid: {
    type: "cta_grid",
    displayName: "Link Cards",
    defaultConfig: createDefaultCtaGridConfig,
    sanitizeConfig: sanitizeCtaGridConfig,
    Render: CtaGridBlockRender
  },
  cta_card: {
    type: "cta_card",
    displayName: "CTA Card",
    defaultConfig: createDefaultCtaCardConfig,
    sanitizeConfig: sanitizeCtaCardConfig,
    Render: CtaCardBlockRender
  },
  announcement_highlight: {
    type: "announcement_highlight",
    displayName: "Announcement Highlights",
    defaultConfig: createDefaultAnnouncementHighlightConfig,
    sanitizeConfig: sanitizeAnnouncementHighlightConfig,
    Render: AnnouncementHighlightBlockRender
  },
  stats_metrics: {
    type: "stats_metrics",
    displayName: "Stats & Metrics",
    defaultConfig: createDefaultStatsMetricsConfig,
    sanitizeConfig: sanitizeStatsMetricsConfig,
    Render: StatsMetricsBlockRender
  },
  document_links: {
    type: "document_links",
    displayName: "Document Links",
    defaultConfig: createDefaultDocumentLinksConfig,
    sanitizeConfig: sanitizeDocumentLinksConfig,
    Render: DocumentLinksBlockRender
  },
  contact_info: {
    type: "contact_info",
    displayName: "Contact Info",
    defaultConfig: createDefaultContactInfoConfig,
    sanitizeConfig: sanitizeContactInfoConfig,
    Render: ContactInfoBlockRender
  },
  schedule_preview: {
    type: "schedule_preview",
    displayName: "Schedule Preview",
    defaultConfig: createDefaultSchedulePreviewConfig,
    sanitizeConfig: sanitizeSchedulePreviewConfig,
    Render: SchedulePreviewBlockRender
  },
  program_catalog: {
    type: "program_catalog",
    displayName: "Programs Catalog",
    defaultConfig: createDefaultProgramCatalogConfig,
    sanitizeConfig: sanitizeProgramCatalogConfig,
    Render: ProgramCatalogBlockRender
  },
  events: {
    type: "events",
    displayName: "Events",
    defaultConfig: createDefaultEventsConfig,
    sanitizeConfig: sanitizeEventsConfig,
    Render: EventsBlockRender
  },
  form_embed: {
    type: "form_embed",
    displayName: "Form",
    defaultConfig: createDefaultFormEmbedConfig,
    sanitizeConfig: sanitizeFormEmbedConfig,
    Render: FormEmbedBlockRender
  },
  facility_availability_calendar: {
    type: "facility_availability_calendar",
    displayName: "Facility Availability Calendar",
    defaultConfig: createDefaultFacilityAvailabilityCalendarConfig,
    sanitizeConfig: sanitizeFacilityAvailabilityCalendarConfig,
    Render: FacilityAvailabilityCalendarBlockRender
  },
  facility_space_list: {
    type: "facility_space_list",
    displayName: "Facility Space List",
    defaultConfig: createDefaultFacilitySpaceListConfig,
    sanitizeConfig: sanitizeFacilitySpaceListConfig,
    Render: FacilitySpaceListBlockRender
  },
  teams_directory: {
    type: "teams_directory",
    displayName: "Teams Directory",
    defaultConfig: createDefaultTeamsDirectoryConfig,
    sanitizeConfig: sanitizeTeamsDirectoryConfig,
    Render: TeamsDirectoryBlockRender
  }
};

export function getRuntimeBlockDefinition<TType extends OrgSiteBlockType>(type: TType): RuntimeBlockDefinition<TType> {
  return runtimeBlockRegistry[type] as RuntimeBlockDefinition<TType>;
}

export function createDefaultRuntimeBlock<TType extends OrgSiteBlockType>(type: TType, context: BlockContext, id = createId()): OrgPageBlock<TType> {
  const definition = getRuntimeBlockDefinition(type);

  return {
    id,
    type,
    config: definition.defaultConfig(context)
  };
}
