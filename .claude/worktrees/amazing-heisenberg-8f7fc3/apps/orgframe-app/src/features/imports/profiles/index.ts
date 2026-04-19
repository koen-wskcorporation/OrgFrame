import type { ImportProfileKey, MatchCandidate, NormalizedRow } from "@/src/features/imports/contracts";

export type ImportProfileDefinition = {
  key: ImportProfileKey;
  label: string;
  description: string;
  headerAliases: Record<string, string[]>;
  normalize: (raw: Record<string, unknown>) => NormalizedRow;
  classifyConflict: (input: { normalized: NormalizedRow; candidates: MatchCandidate[] }) => "direct" | "conflict" | "unmatched";
  writeAdapter: {
    targetSchema: "people" | "programs" | "commerce";
    targetTable: string;
    mode: "insert_or_update";
  };
};

function asString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D+/g, "");
  return digits.length >= 10 ? digits : "";
}

function normalizeEmail(value: string) {
  const trimmed = value.trim().toLowerCase();
  return trimmed.includes("@") ? trimmed : "";
}

function canonicalKey(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

export function canonicalizeRow(raw: Record<string, unknown>, aliases: Record<string, string[]>) {
  const output: Record<string, unknown> = {};
  const keys = Object.keys(raw);

  for (const [canonical, aliasList] of Object.entries(aliases)) {
    const matchedKey = keys.find((key) => {
      const normalized = canonicalKey(key);
      return normalized === canonical || aliasList.some((alias) => normalized === canonicalKey(alias));
    });

    output[canonical] = matchedKey ? raw[matchedKey] : null;
  }

  return output;
}

const peopleRosterProfile: ImportProfileDefinition = {
  key: "people_roster",
  label: "People Roster",
  description: "Players and guardians roster import.",
  headerAliases: {
    first_name: ["first", "given_name", "player_first_name"],
    last_name: ["last", "surname", "player_last_name"],
    preferred_name: ["nickname"],
    email: ["guardian_email", "contact_email"],
    phone: ["guardian_phone", "contact_phone"],
    date_of_birth: ["dob", "birth_date"]
  },
  normalize(raw) {
    const canonical = canonicalizeRow(raw, this.headerAliases);
    const firstName = asString(canonical.first_name);
    const lastName = asString(canonical.last_name);
    const email = normalizeEmail(asString(canonical.email));
    const phone = normalizePhone(asString(canonical.phone));

    return {
      profile: "people_roster",
      canonical: {
        ...canonical,
        first_name: firstName,
        last_name: lastName,
        preferred_name: asString(canonical.preferred_name),
        email,
        phone,
        date_of_birth: asString(canonical.date_of_birth)
      },
      matchKeys: {
        email: email || null,
        phone: phone || null,
        full_name: `${firstName.toLowerCase()}|${lastName.toLowerCase()}`
      }
    };
  },
  classifyConflict({ candidates }) {
    if (candidates.length === 0) {
      return "unmatched";
    }

    if (candidates[0] && candidates[0].score >= 0.95) {
      return "direct";
    }

    return "conflict";
  },
  writeAdapter: {
    targetSchema: "people",
    targetTable: "players",
    mode: "insert_or_update"
  }
};

const programStructureProfile: ImportProfileDefinition = {
  key: "program_structure",
  label: "Program Structure",
  description: "Programs, divisions, and teams structure import.",
  headerAliases: {
    program_name: ["program", "program_title"],
    division_name: ["division", "division_title"],
    team_name: ["team", "team_title"],
    node_kind: ["kind", "type"]
  },
  normalize(raw) {
    const canonical = canonicalizeRow(raw, this.headerAliases);
    const programName = asString(canonical.program_name);
    const divisionName = asString(canonical.division_name);
    const teamName = asString(canonical.team_name);

    return {
      profile: "program_structure",
      canonical: {
        ...canonical,
        program_name: programName,
        division_name: divisionName,
        team_name: teamName,
        node_kind: asString(canonical.node_kind) || "team"
      },
      matchKeys: {
        program_name: programName.toLowerCase() || null,
        division_name: divisionName.toLowerCase() || null,
        team_name: teamName.toLowerCase() || null
      }
    };
  },
  classifyConflict({ candidates }) {
    if (candidates.length === 0) {
      return "unmatched";
    }

    if (candidates[0] && candidates[0].score >= 0.97) {
      return "direct";
    }

    return "conflict";
  },
  writeAdapter: {
    targetSchema: "programs",
    targetTable: "nodes",
    mode: "insert_or_update"
  }
};

const commerceOrdersProfile: ImportProfileDefinition = {
  key: "commerce_orders",
  label: "Commerce Orders",
  description: "Orders and payment history import.",
  headerAliases: {
    source_order_id: ["order_id", "external_order_id"],
    source_order_no: ["order_number", "external_order_no"],
    order_status: ["status"],
    total_amount: ["order_total", "total"],
    order_date: ["date", "ordered_at"]
  },
  normalize(raw) {
    const canonical = canonicalizeRow(raw, this.headerAliases);
    const sourceOrderId = asString(canonical.source_order_id);
    const sourceOrderNo = asString(canonical.source_order_no);

    return {
      profile: "commerce_orders",
      canonical: {
        ...canonical,
        source_order_id: sourceOrderId,
        source_order_no: sourceOrderNo,
        order_status: asString(canonical.order_status).toLowerCase(),
        total_amount: asString(canonical.total_amount),
        order_date: asString(canonical.order_date)
      },
      matchKeys: {
        source_order_id: sourceOrderId || null,
        source_order_no: sourceOrderNo || null
      }
    };
  },
  classifyConflict({ candidates }) {
    if (candidates.length === 0) {
      return "unmatched";
    }

    if (candidates[0] && candidates[0].score >= 0.99) {
      return "direct";
    }

    return "conflict";
  },
  writeAdapter: {
    targetSchema: "commerce",
    targetTable: "orders",
    mode: "insert_or_update"
  }
};

export const importProfileRegistry: Record<ImportProfileKey, ImportProfileDefinition> = {
  people_roster: peopleRosterProfile,
  program_structure: programStructureProfile,
  commerce_orders: commerceOrdersProfile
};

export function getImportProfile(key: ImportProfileKey): ImportProfileDefinition {
  return importProfileRegistry[key];
}
