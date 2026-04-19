import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { filterShareSuggestions } from "@/src/features/org-share/components/UniversalSharePopup";
import type { ShareTarget } from "@/src/features/org-share/types";

const options: ShareTarget[] = [
  { id: "p1", type: "person", label: "Alex Admin", subtitle: "alex@example.com" },
  { id: "p2", type: "person", label: "Bailey Member", subtitle: "bailey@example.com" },
  { id: "g1", type: "group", label: "All Coaches", subtitle: "12 members" },
  { id: "a1", type: "admin", label: "Organization Admins", subtitle: "2 members" }
];

describe("universal share suggestions", () => {
  it("filters by allowed type and excludes selected targets", () => {
    const suggestions = filterShareSuggestions({
      options,
      allowedTypes: ["person", "admin"],
      filter: "all",
      selectedIds: new Set(["person:p1"]),
      query: ""
    });

    assert.equal(suggestions.some((entry) => entry.type === "group"), false);
    assert.equal(suggestions.some((entry) => entry.id === "p1" && entry.type === "person"), false);
    assert.equal(suggestions.some((entry) => entry.id === "p2" && entry.type === "person"), true);
    assert.equal(suggestions.some((entry) => entry.id === "a1" && entry.type === "admin"), true);
  });

  it("matches search text against label and subtitle", () => {
    const byName = filterShareSuggestions({
      options,
      filter: "all",
      selectedIds: new Set(),
      query: "bailey"
    });
    assert.deepEqual(byName.map((entry) => entry.id), ["p2"]);

    const bySubtitle = filterShareSuggestions({
      options,
      filter: "all",
      selectedIds: new Set(),
      query: "12 members"
    });
    assert.deepEqual(bySubtitle.map((entry) => entry.id), ["g1"]);
  });
});
