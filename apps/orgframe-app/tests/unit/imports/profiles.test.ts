import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { canonicalizeRow, importProfileRegistry } from "@/src/features/imports/profiles";

describe("imports profile normalization", () => {
  it("maps people roster header aliases to canonical fields", () => {
    const profile = importProfileRegistry.people_roster;
    const canonical = canonicalizeRow(
      {
        "Player First Name": "Casey",
        "Player Last Name": "Nguyen",
        "Guardian Email": "Casey.Parent@Example.com ",
        "Guardian Phone": "(313) 555-9911"
      },
      profile.headerAliases
    );

    const normalized = profile.normalize(canonical);

    assert.equal(normalized.canonical.first_name, "Casey");
    assert.equal(normalized.canonical.last_name, "Nguyen");
    assert.equal(normalized.canonical.email, "casey.parent@example.com");
    assert.equal(normalized.canonical.phone, "3135559911");
  });

  it("classifies near-match program candidates as conflict", () => {
    const profile = importProfileRegistry.program_structure;
    const normalized = profile.normalize({
      program_name: "Rec League",
      division_name: "U12",
      team_name: "Tigers"
    });

    const result = profile.classifyConflict({
      normalized,
      candidates: [
        {
          id: "c1",
          score: 0.96,
          reason: "name_match",
          payload: {}
        }
      ]
    });

    assert.equal(result, "conflict");
  });
});
