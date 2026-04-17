import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultLensState,
  explainOccurrenceVisibility,
  filterCalendarReadModelByLens,
  resolveAvailableScopeTypes,
  resolveDefaultLens,
  resolveLensSourceIds
} from "@/src/features/calendar/lens";
import type { CalendarPageContext, CalendarPurpose, CalendarReadModel, CalendarSource } from "@/src/features/calendar/types";

const sources: CalendarSource[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    orgId: "org-1",
    name: "Org Calendar",
    scopeType: "organization",
    scopeId: "org-1",
    scopeLabel: "Org",
    parentSourceId: null,
    purposeDefaults: ["custom_other"],
    audienceDefaults: ["public"],
    isCustomCalendar: false,
    isActive: true,
    displayJson: {},
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    orgId: "org-1",
    name: "Program A",
    scopeType: "program",
    scopeId: "program-1",
    scopeLabel: "Program A",
    parentSourceId: null,
    purposeDefaults: ["season_dates"],
    audienceDefaults: ["staff"],
    isCustomCalendar: false,
    isActive: true,
    displayJson: { programId: "program-1" },
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    orgId: "org-1",
    name: "Team Tigers",
    scopeType: "team",
    scopeId: "team-1",
    scopeLabel: "Tigers",
    parentSourceId: null,
    purposeDefaults: ["games", "practices"],
    audienceDefaults: ["team_members_only"],
    isCustomCalendar: false,
    isActive: true,
    displayJson: { programId: "program-1" },
    createdBy: null,
    updatedBy: null,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z"
  }
];

const readModel: CalendarReadModel = {
  sources,
  entries: [
    {
      id: "entry-1",
      orgId: "org-1",
      sourceId: sources[2].id,
      entryType: "game",
      purpose: "games",
      audience: "public",
      title: "Tigers vs Hawks",
      summary: null,
      visibility: "published",
      status: "scheduled",
      hostTeamId: "team-1",
      defaultTimezone: "UTC",
      settingsJson: {},
      createdBy: null,
      updatedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "entry-2",
      orgId: "org-1",
      sourceId: sources[1].id,
      entryType: "event",
      purpose: "season_dates",
      audience: "staff",
      title: "Coach planning",
      summary: null,
      visibility: "internal",
      status: "scheduled",
      hostTeamId: null,
      defaultTimezone: "UTC",
      settingsJson: {},
      createdBy: null,
      updatedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  rules: [],
  occurrences: [
    {
      id: "occ-1",
      orgId: "org-1",
      entryId: "entry-1",
      sourceRuleId: null,
      sourceType: "single",
      sourceKey: "k1",
      timezone: "UTC",
      localDate: "2026-04-10",
      localStartTime: "10:00",
      localEndTime: "11:00",
      startsAtUtc: "2026-04-10T10:00:00.000Z",
      endsAtUtc: "2026-04-10T11:00:00.000Z",
      status: "scheduled",
      metadataJson: {},
      createdBy: null,
      updatedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    },
    {
      id: "occ-2",
      orgId: "org-1",
      entryId: "entry-2",
      sourceRuleId: null,
      sourceType: "single",
      sourceKey: "k2",
      timezone: "UTC",
      localDate: "2026-04-11",
      localStartTime: "10:00",
      localEndTime: "11:00",
      startsAtUtc: "2026-04-11T10:00:00.000Z",
      endsAtUtc: "2026-04-11T11:00:00.000Z",
      status: "scheduled",
      metadataJson: {},
      createdBy: null,
      updatedBy: null,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }
  ],
  exceptions: [],
  configurations: [],
  allocations: [],
  ruleAllocations: [],
  invites: []
};

test("resolveDefaultLens picks context-aware defaults", () => {
  assert.equal(resolveDefaultLens({ contextType: "org", orgId: "org-1", orgSlug: "org" }), "mine");
  assert.equal(resolveDefaultLens({ contextType: "team", orgId: "org-1", orgSlug: "org", teamId: "team-1" }), "this_page");
  assert.equal(resolveDefaultLens({ contextType: "public", orgId: "org-1", orgSlug: "org" }), "public");
});

test("resolveAvailableScopeTypes reprioritizes by page context", () => {
  assert.deepEqual(resolveAvailableScopeTypes({ contextType: "team", orgId: "org-1", orgSlug: "org", teamId: "team-1" }), [
    "team",
    "division",
    "program",
    "organization",
    "custom"
  ]);
});

test("resolveLensSourceIds for team this_page includes team plus parent scopes", () => {
  const context: CalendarPageContext = { contextType: "team", orgId: "org-1", orgSlug: "org", teamId: "team-1" };
  const state = defaultLensState("this_page");
  const sourceIds = resolveLensSourceIds({ lensState: state, context, sources });
  assert.equal(sourceIds.has(sources[2].id), true);
  assert.equal(sourceIds.has(sources[0].id), true);
});

test("filterCalendarReadModelByLens respects purpose and audience", () => {
  const context: CalendarPageContext = { contextType: "org", orgId: "org-1", orgSlug: "org" };
  const state = {
    ...defaultLensState("custom"),
    includePurpose: ["games"] satisfies CalendarPurpose[],
    audiencePerspective: "public" as const
  };
  const filtered = filterCalendarReadModelByLens({ readModel, sources, context, lensState: state });
  assert.equal(filtered.entries.length, 1);
  assert.equal(filtered.entries[0]?.id, "entry-1");
  assert.equal(filtered.occurrences.length, 1);
  assert.equal(filtered.occurrences[0]?.id, "occ-1");
});

test("explainOccurrenceVisibility includes source and reason codes", () => {
  const context: CalendarPageContext = { contextType: "org", orgId: "org-1", orgSlug: "org" };
  const state = defaultLensState("mine");
  const filtered = filterCalendarReadModelByLens({ readModel, sources, context, lensState: state });
  const why = explainOccurrenceVisibility({ occurrenceId: "occ-1", readModel: filtered, sources, lensState: state });
  assert.ok(why);
  assert.equal(why?.sourceName, "Team Tigers");
  assert.equal(why?.reasonCodes.includes("purpose:games"), true);
  assert.equal(why?.reasonCodes.includes("audience:public"), true);
});
