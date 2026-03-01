import { createId } from "@/modules/site-builder/blocks/helpers";
import { CtaGridBlockRender, createDefaultCtaGridConfig, sanitizeCtaGridConfig } from "@/modules/site-builder/blocks/cta-grid";
import { CtaCardBlockRender, createDefaultCtaCardConfig, sanitizeCtaCardConfig } from "@/modules/site-builder/blocks/cta-card";
import { createDefaultHeroConfig, HeroBlockRender, sanitizeHeroConfig } from "@/modules/site-builder/blocks/hero";
import { createDefaultSubheroConfig, sanitizeSubheroConfig, SubheroBlockRender } from "@/modules/site-builder/blocks/subhero";
import { createDefaultSchedulePreviewConfig, sanitizeSchedulePreviewConfig, SchedulePreviewBlockRender } from "@/modules/site-builder/blocks/schedule-preview";
import { createDefaultProgramCatalogConfig, ProgramCatalogBlockRender, sanitizeProgramCatalogConfig } from "@/modules/site-builder/blocks/program-catalog";
import { createDefaultEventsConfig, EventsBlockRender, sanitizeEventsConfig } from "@/modules/site-builder/blocks/events";
import { createDefaultFormEmbedConfig, FormEmbedBlockRender, sanitizeFormEmbedConfig } from "@/modules/site-builder/blocks/form-embed";
import {
  createDefaultFacilityAvailabilityCalendarConfig,
  FacilityAvailabilityCalendarBlockRender,
  sanitizeFacilityAvailabilityCalendarConfig
} from "@/modules/site-builder/blocks/facility-availability-calendar";
import {
  createDefaultFacilitySpaceListConfig,
  FacilitySpaceListBlockRender,
  sanitizeFacilitySpaceListConfig
} from "@/modules/site-builder/blocks/facility-space-list";
import type { BlockContext, BlockDefinition, OrgPageBlock, OrgSiteBlockType } from "@/modules/site-builder/types";

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
    displayName: "Quick Links",
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
