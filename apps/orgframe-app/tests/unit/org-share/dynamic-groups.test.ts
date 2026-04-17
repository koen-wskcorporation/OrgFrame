import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDynamicOrgGroupsFromRows, buildPeopleSystemGroupsFromRows } from "@/src/features/org-share/server";

describe("org share dynamic groups", () => {
  it("builds expected groups and dedupes repeated users", () => {
    const groups = buildDynamicOrgGroupsFromRows(
      [
        { user_id: "u-admin", role: "admin" },
        { user_id: "u-manager", role: "manager" },
        { user_id: "u-member", role: "member" },
        { user_id: "u-member", role: "member" }
      ],
      [
        { user_id: "u-admin", role: "head_coach" },
        { user_id: "u-coach", role: "assistant_coach" },
        { user_id: "u-manager", role: "manager" },
        { user_id: "u-staff", role: "trainer" },
        { user_id: "u-staff", role: "trainer" }
      ]
    );

    const byKey = new Map(groups.map((group) => [group.key, group]));

    assert.deepEqual(byKey.get("org-admins")?.memberUserIds.sort(), ["u-admin", "u-manager"].sort());
    assert.deepEqual(byKey.get("org-members")?.memberUserIds.sort(), ["u-admin", "u-manager", "u-member"].sort());
    assert.deepEqual(byKey.get("all-coaches")?.memberUserIds.sort(), ["u-admin", "u-coach"].sort());
    assert.deepEqual(byKey.get("all-managers")?.memberUserIds.sort(), ["u-manager"].sort());
    assert.deepEqual(byKey.get("all-staff")?.memberUserIds.sort(), ["u-admin", "u-coach", "u-manager", "u-staff"].sort());
  });

  it("builds people system groups for all members and hierarchy groups", () => {
    const groups = buildPeopleSystemGroupsFromRows({
      memberships: [
        { user_id: "u-admin", role: "admin" },
        { user_id: "u-member", role: "member" }
      ],
      teamHierarchy: [
        {
          teamId: "team-1",
          teamName: "Team One",
          divisionId: "division-1",
          divisionName: "Division One",
          programId: "program-1",
          programName: "Program One"
        },
        {
          teamId: "team-2",
          teamName: "Team Two",
          divisionId: "division-1",
          divisionName: "Division One",
          programId: "program-1",
          programName: "Program One"
        }
      ],
      teamStaffAssignments: [
        { teamId: "team-1", userId: "u-admin" },
        { teamId: "team-2", userId: "u-coach" },
        { teamId: "team-2", userId: "u-coach" }
      ]
    });

    const byKey = new Map(groups.map((group) => [group.key, group]));

    assert.deepEqual(byKey.get("all-members")?.memberUserIds.sort(), ["u-admin", "u-member"].sort());
    assert.deepEqual(byKey.get("program:program-1")?.memberUserIds.sort(), ["u-admin", "u-coach"].sort());
    assert.deepEqual(byKey.get("division:division-1")?.memberUserIds.sort(), ["u-admin", "u-coach"].sort());
    assert.deepEqual(byKey.get("team:team-1")?.memberUserIds.sort(), ["u-admin"].sort());
    assert.deepEqual(byKey.get("team:team-2")?.memberUserIds.sort(), ["u-coach"].sort());
  });
});
