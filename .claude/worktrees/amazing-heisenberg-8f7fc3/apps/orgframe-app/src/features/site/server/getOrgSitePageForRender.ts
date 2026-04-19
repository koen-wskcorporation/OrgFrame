import { getSessionUser } from "@/src/features/core/auth/server/getSessionUser";
import { getOrgRequestContext } from "@/src/shared/org/getOrgRequestContext";
import { getOrgAssetPublicUrl } from "@/src/shared/branding/getOrgAssetPublicUrl";
import { listPublishedCalendarCatalog } from "@/src/features/calendar/db/queries";
import { listFacilityPublicAvailabilitySnapshot } from "@/src/features/facilities/db/queries";
import { listPublishedFormsForOrg } from "@/src/features/forms/db/queries";
import { listPlayersForPicker } from "@/src/features/players/db/queries";
import { listPublishedProgramsForCatalog } from "@/src/features/programs/db/queries";
import { listProgramNodes } from "@/src/features/programs/db/queries";
import { listPublishedProgramTeamsForDirectory } from "@/src/features/programs/teams/db/queries";
import { getPublishedOrgPageBySlug } from "@/src/features/site/db/queries";

export async function getOrgSitePageForRender({
  orgSlug,
  pageSlug
}: {
  orgSlug: string;
  pageSlug: string;
}) {
  const orgRequest = await getOrgRequestContext(orgSlug);
  const pageData = await getPublishedOrgPageBySlug({
    orgId: orgRequest.org.orgId,
    pageSlug,
    context: {
      orgSlug: orgRequest.org.orgSlug,
      orgName: orgRequest.org.orgName,
      pageSlug
    }
  });

  const requiresProgramCatalog = pageData?.blocks.some((block) => block.type === "program_catalog") ?? false;
  const programCatalogItems = requiresProgramCatalog
    ? await listPublishedProgramsForCatalog(orgRequest.org.orgId)
        .then((items) =>
          items.map((item) => ({
            ...item,
            coverImageUrl: getOrgAssetPublicUrl(item.coverImagePath)
          }))
        )
        .catch(() => [])
    : [];
  const requiresTeamsDirectory = pageData?.blocks.some((block) => block.type === "teams_directory") ?? false;
  const teamsDirectoryItems = requiresTeamsDirectory ? await listPublishedProgramTeamsForDirectory(orgRequest.org.orgId, { limit: 200 }).catch(() => []) : [];

  const requiresCalendar = pageData?.blocks.some((block) => block.type === "events") ?? false;
  const now = Date.now();
  const publicCalendarItems = requiresCalendar
    ? await listPublishedCalendarCatalog(orgRequest.org.orgId, {
        fromUtc: new Date(now - 1825 * 24 * 60 * 60 * 1000).toISOString(),
        toUtc: new Date(now + 1825 * 24 * 60 * 60 * 1000).toISOString(),
        limit: 2000
      }).catch(() => [])
    : [];

  const requiresFacilityAvailability =
    pageData?.blocks.some((block) => block.type === "facility_availability_calendar" || block.type === "facility_space_list") ?? false;
  const facilityAvailability = requiresFacilityAvailability
    ? await listFacilityPublicAvailabilitySnapshot(orgRequest.org.orgId, {
        fromUtc: new Date(now - 60 * 24 * 60 * 60 * 1000).toISOString(),
        toUtc: new Date(now + 365 * 24 * 60 * 60 * 1000).toISOString()
      }).catch(() => ({
        generatedAtUtc: new Date().toISOString(),
        spaces: [],
        reservations: []
      }))
    : undefined;

  const requiresFormEmbed = pageData?.blocks.some((block) => block.type === "form_embed") ?? false;
  const publishedForms = requiresFormEmbed ? await listPublishedFormsForOrg(orgRequest.org.orgId).catch(() => []) : [];
  const sessionUser = requiresFormEmbed ? await getSessionUser() : null;
  const players = requiresFormEmbed && sessionUser ? await listPlayersForPicker(sessionUser.id).catch(() => []) : [];
  const programIds = requiresFormEmbed
    ? Array.from(new Set(publishedForms.map((form) => form.programId).filter((value): value is string => Boolean(value))))
    : [];
  const programNodeEntries = requiresFormEmbed
    ? await Promise.all(
        programIds.map(async (programId) => {
          const nodes = await listProgramNodes(programId, { publishedOnly: true }).catch(() => []);
          return [programId, nodes] as const;
        })
      )
    : [];
  const programNodesByProgramId = Object.fromEntries(programNodeEntries);

  const runtimeData = {
    programCatalogItems,
    teamsDirectoryItems,
    publicCalendarItems,
    eventsCatalogItems: publicCalendarItems,
    facilityAvailability,
    formEmbed: requiresFormEmbed
      ? {
          publishedForms,
          viewer: sessionUser,
          players,
          programNodesByProgramId
        }
      : undefined
  };

  if (!pageData) {
    return {
      orgContext: orgRequest.org,
      page: null,
      blocks: null,
      runtimeData,
      canEdit: orgRequest.capabilities?.pages.canWrite ?? false
    };
  }

  return {
    orgContext: orgRequest.org,
    page: pageData.page,
    blocks: pageData.blocks,
    runtimeData,
    canEdit: orgRequest.capabilities?.pages.canWrite ?? false
  };
}
