import { createId } from "@/modules/site-builder/blocks/helpers";
import { CtaGridBlockEditor, CtaGridBlockRender, createDefaultCtaGridConfig, sanitizeCtaGridConfig } from "@/modules/site-builder/blocks/cta-grid";
import { CtaCardBlockEditor, CtaCardBlockRender, createDefaultCtaCardConfig, sanitizeCtaCardConfig } from "@/modules/site-builder/blocks/cta-card";
import { createDefaultHeroConfig, HeroBlockRender, sanitizeHeroConfig } from "@/modules/site-builder/blocks/hero";
import { HeroBlockEditorClient } from "@/modules/site-builder/blocks/hero-editor.client";
import { createDefaultSubheroConfig, sanitizeSubheroConfig, SubheroBlockRender } from "@/modules/site-builder/blocks/subhero";
import { SubheroBlockEditorClient } from "@/modules/site-builder/blocks/subhero-editor.client";
import {
  createDefaultSchedulePreviewConfig,
  sanitizeSchedulePreviewConfig,
  SchedulePreviewBlockEditor,
  SchedulePreviewBlockRender
} from "@/modules/site-builder/blocks/schedule-preview";
import {
  createDefaultProgramCatalogConfig,
  ProgramCatalogBlockEditor,
  ProgramCatalogBlockRender,
  sanitizeProgramCatalogConfig
} from "@/modules/site-builder/blocks/program-catalog";
import { createDefaultEventsConfig, EventsBlockEditor, EventsBlockRender, sanitizeEventsConfig } from "@/modules/site-builder/blocks/events";
import { createDefaultFormEmbedConfig, FormEmbedBlockEditor, FormEmbedBlockRender, sanitizeFormEmbedConfig } from "@/modules/site-builder/blocks/form-embed";
import {
  createDefaultFacilityAvailabilityCalendarConfig,
  FacilityAvailabilityCalendarBlockEditor,
  FacilityAvailabilityCalendarBlockRender,
  sanitizeFacilityAvailabilityCalendarConfig
} from "@/modules/site-builder/blocks/facility-availability-calendar";
import {
  createDefaultFacilitySpaceListConfig,
  FacilitySpaceListBlockEditor,
  FacilitySpaceListBlockRender,
  sanitizeFacilitySpaceListConfig
} from "@/modules/site-builder/blocks/facility-space-list";
import {
  createDefaultTeamsDirectoryConfig,
  sanitizeTeamsDirectoryConfig,
  TeamsDirectoryBlockEditor,
  TeamsDirectoryBlockRender
} from "@/modules/site-builder/blocks/teams-directory";
import type { BlockContext, BlockDefinition, DraftBlockInput, OrgPageBlock, OrgSiteBlockType } from "@/modules/site-builder/types";

type AnyBlockDefinition = {
  [K in OrgSiteBlockType]: BlockDefinition<K>;
};

const blockRegistry: AnyBlockDefinition = {
  hero: {
    type: "hero",
    displayName: "Hero",
    defaultConfig: createDefaultHeroConfig,
    sanitizeConfig: sanitizeHeroConfig,
    Render: HeroBlockRender,
    Editor: HeroBlockEditorClient
  },
  subhero: {
    type: "subhero",
    displayName: "Subhero",
    defaultConfig: createDefaultSubheroConfig,
    sanitizeConfig: sanitizeSubheroConfig,
    Render: SubheroBlockRender,
    Editor: SubheroBlockEditorClient
  },
  cta_grid: {
    type: "cta_grid",
    displayName: "Quick Links",
    defaultConfig: createDefaultCtaGridConfig,
    sanitizeConfig: sanitizeCtaGridConfig,
    Render: CtaGridBlockRender,
    Editor: CtaGridBlockEditor
  },
  cta_card: {
    type: "cta_card",
    displayName: "CTA Card",
    defaultConfig: createDefaultCtaCardConfig,
    sanitizeConfig: sanitizeCtaCardConfig,
    Render: CtaCardBlockRender,
    Editor: CtaCardBlockEditor
  },
  schedule_preview: {
    type: "schedule_preview",
    displayName: "Schedule Preview",
    defaultConfig: createDefaultSchedulePreviewConfig,
    sanitizeConfig: sanitizeSchedulePreviewConfig,
    Render: SchedulePreviewBlockRender,
    Editor: SchedulePreviewBlockEditor
  },
  program_catalog: {
    type: "program_catalog",
    displayName: "Programs Catalog",
    defaultConfig: createDefaultProgramCatalogConfig,
    sanitizeConfig: sanitizeProgramCatalogConfig,
    Render: ProgramCatalogBlockRender,
    Editor: ProgramCatalogBlockEditor
  },
  events: {
    type: "events",
    displayName: "Events",
    defaultConfig: createDefaultEventsConfig,
    sanitizeConfig: sanitizeEventsConfig,
    Render: EventsBlockRender,
    Editor: EventsBlockEditor
  },
  form_embed: {
    type: "form_embed",
    displayName: "Form",
    defaultConfig: createDefaultFormEmbedConfig,
    sanitizeConfig: sanitizeFormEmbedConfig,
    Render: FormEmbedBlockRender,
    Editor: FormEmbedBlockEditor
  },
  facility_availability_calendar: {
    type: "facility_availability_calendar",
    displayName: "Facility Availability Calendar",
    defaultConfig: createDefaultFacilityAvailabilityCalendarConfig,
    sanitizeConfig: sanitizeFacilityAvailabilityCalendarConfig,
    Render: FacilityAvailabilityCalendarBlockRender,
    Editor: FacilityAvailabilityCalendarBlockEditor
  },
  facility_space_list: {
    type: "facility_space_list",
    displayName: "Facility Space List",
    defaultConfig: createDefaultFacilitySpaceListConfig,
    sanitizeConfig: sanitizeFacilitySpaceListConfig,
    Render: FacilitySpaceListBlockRender,
    Editor: FacilitySpaceListBlockEditor
  },
  teams_directory: {
    type: "teams_directory",
    displayName: "Teams Directory",
    defaultConfig: createDefaultTeamsDirectoryConfig,
    sanitizeConfig: sanitizeTeamsDirectoryConfig,
    Render: TeamsDirectoryBlockRender,
    Editor: TeamsDirectoryBlockEditor
  }
};

export function isOrgSiteBlockType(value: string): value is OrgSiteBlockType {
  return value in blockRegistry;
}

export function getBlockDefinition<TType extends OrgSiteBlockType>(type: TType): BlockDefinition<TType> {
  return blockRegistry[type] as BlockDefinition<TType>;
}

export function listBlockDefinitions() {
  return Object.values(blockRegistry);
}

export function createDefaultBlock<TType extends OrgSiteBlockType>(type: TType, context: BlockContext, id = createId()): OrgPageBlock<TType> {
  const definition = getBlockDefinition(type);

  return {
    id,
    type,
    config: definition.defaultConfig(context)
  };
}

export function createDefaultBlocksForPage(pageSlug: string, context: BlockContext): OrgPageBlock[] {
  if (pageSlug === "home") {
    return [
      createDefaultBlock("hero", context),
      createDefaultBlock("cta_grid", context),
      createDefaultBlock("cta_card", context),
      createDefaultBlock("schedule_preview", context)
    ];
  }

  return [createDefaultBlock("subhero", context)];
}

function normalizeSingleBlock(block: DraftBlockInput, context: BlockContext): OrgPageBlock | null {
  const normalizedType = block.type;

  if (!isOrgSiteBlockType(normalizedType)) {
    return null;
  }

  const definition = getBlockDefinition(normalizedType);

  return {
    id: typeof block.id === "string" && block.id.trim().length > 0 ? block.id : createId(),
    type: normalizedType,
    config: definition.sanitizeConfig(block.config, context)
  };
}

export function normalizeDraftBlocks(blocks: DraftBlockInput[], context: BlockContext): OrgPageBlock[] {
  const normalized = blocks
    .map((block) => normalizeSingleBlock(block, context))
    .filter((block): block is OrgPageBlock => Boolean(block));

  if (normalized.length === 0) {
    return createDefaultBlocksForPage(context.pageSlug, context);
  }

  return normalized;
}

export function normalizeRowBlocks(
  rows: Array<{
    id: string;
    type: string;
    config: unknown;
    sort_index?: number | null;
  }>,
  context: BlockContext
): OrgPageBlock[] {
  const normalized = rows
    .slice()
    .sort((a, b) => (a.sort_index ?? 0) - (b.sort_index ?? 0))
    .map((row) => {
      return normalizeSingleBlock(
        {
          id: row.id,
          type: row.type,
          config: row.config
        },
        context
      );
    })
    .filter((block): block is OrgPageBlock => Boolean(block));

  if (normalized.length === 0) {
    return createDefaultBlocksForPage(context.pageSlug, context);
  }

  return normalized;
}
