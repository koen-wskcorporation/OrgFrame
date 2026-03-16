import { createHash } from "node:crypto";
import {
  SPORTS_CONNECT_REQUIRED_HEADERS,
  SPORTS_CONNECT_SENSITIVE_HEADERS,
  type SportsConnectNormalizedRow,
  type SportsConnectParseIssue,
  type SportsConnectParsedRow,
  type SportsConnectRawRow
} from "@/modules/sportsconnect/types";

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;

const CORE_HEADERS = new Set<string>([
  "Program Name",
  "Division Name",
  "Team Name",
  "Account First Name",
  "Account Last Name",
  "User Email",
  "Telephone",
  "Cellphone",
  "Other Phone",
  "Street Address",
  "Unit",
  "City",
  "State",
  "Postal Code",
  "Player First Name",
  "Player Last Name",
  "Player Middle Initial",
  "Player Suffix",
  "Player Gender",
  "Player Birth Date",
  "Birth Date Time Stamp",
  "Player Id",
  "Association Player ID",
  "Order Detail Player Id",
  "Jersey Size",
  "Player Allergies",
  "Player Physical Conditions",
  "Player Insurance Company",
  "Player Insurance Policy Holder",
  "Player Insurance Policy Number",
  "Order Date",
  "Order Time Stamp",
  "Order No",
  "Order Id",
  "ODP Order Detail Id",
  "ODP Order Detail Payment Id",
  "ODP Payment History Id",
  "OPH Order Payment History Id",
  "Order Detail Description",
  "Order Payment Status",
  "Order Status",
  "Order Payment Message",
  "OrderItem Amount",
  "OrderItem Amount Paid",
  "OrderItem Balance",
  "Order Amount",
  "Total Payment Amount",
  "Order Payment Amount",
  "User Paid CC Fee",
  "User Paid Registration Fee",
  "Admin Paid CC Fee",
  "Admin Paid Registration Fee",
  "Billing First Name",
  "Billing Last Name",
  "Billing Address",
  "Order Detail Program Name",
  "Order Detail Division Name"
]);

const SENSITIVE_HEADERS = new Set<string>(SPORTS_CONNECT_SENSITIVE_HEADERS.map((header) => header.toLowerCase()));

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string) {
  return normalizeWhitespace(value).toLowerCase();
}

function toNullable(value: string) {
  const normalized = normalizeWhitespace(value);
  return normalized.length > 0 ? normalized : null;
}

function normalizePhone(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) {
    return null;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return digits;
}

function isRealDate(year: number, month: number, day: number) {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) {
    return false;
  }

  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() + 1 === month && date.getUTCDate() === day;
}

function parseDateParts(value: string): { year: number; month: number; day: number } | null {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) {
    return null;
  }

  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(trimmed);
  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1] ?? "", 10);
  const day = Number.parseInt(match[2] ?? "", 10);
  const year = Number.parseInt(match[3] ?? "", 10);

  if (!Number.isInteger(month) || !Number.isInteger(day) || !Number.isInteger(year) || !isRealDate(year, month, day)) {
    return null;
  }

  return {
    year,
    month,
    day
  };
}

function toIsoBirthDate(value: string): string | null {
  const parsed = parseDateParts(value);
  if (!parsed) {
    return null;
  }

  return `${String(parsed.year).padStart(4, "0")}-${String(parsed.month).padStart(2, "0")}-${String(parsed.day).padStart(2, "0")}`;
}

export function parseSportsConnectDateTime(value: string): {
  localDate: string;
  localTime: string;
} | null {
  const trimmed = normalizeWhitespace(value);
  if (!trimmed) {
    return null;
  }

  const match =
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?)?$/.exec(trimmed);

  if (!match) {
    return null;
  }

  const month = Number.parseInt(match[1] ?? "", 10);
  const day = Number.parseInt(match[2] ?? "", 10);
  const year = Number.parseInt(match[3] ?? "", 10);

  if (!isRealDate(year, month, day)) {
    return null;
  }

  let hours = Number.parseInt(match[4] ?? "0", 10);
  const minutes = Number.parseInt(match[5] ?? "0", 10);
  const ampm = (match[7] ?? "").toUpperCase();

  if (!Number.isInteger(hours) || !Number.isInteger(minutes) || minutes < 0 || minutes > 59) {
    return null;
  }

  if (ampm) {
    if (hours < 1 || hours > 12) {
      return null;
    }

    if (ampm === "AM") {
      hours = hours === 12 ? 0 : hours;
    } else {
      hours = hours === 12 ? 12 : hours + 12;
    }
  } else if (hours < 0 || hours > 23) {
    return null;
  }

  return {
    localDate: `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
    localTime: `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
  };
}

function parseCsvMatrix(input: string): string[][] {
  const text = input.replace(/^\uFEFF/, "");
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (char === '"' && next === '"') {
        cell += '"';
        i += 1;
        continue;
      }

      if (char === '"') {
        inQuotes = false;
        continue;
      }

      cell += char;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      continue;
    }

    if (char === ",") {
      row.push(cell);
      cell = "";
      continue;
    }

    if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    if (char === "\r") {
      if (next === "\n") {
        continue;
      }

      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      continue;
    }

    cell += char;
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows.filter((candidate) => candidate.some((entry) => entry.trim().length > 0));
}

function rowHash(row: SportsConnectRawRow, headers: string[]) {
  const canonical = headers.map((header) => `${header}:${row[header] ?? ""}`).join("|");
  return createHash("sha256").update(canonical).digest("hex");
}

function getValue(raw: SportsConnectRawRow, header: string) {
  return raw[header] ?? "";
}

function buildRawRow(headers: string[], values: string[]): SportsConnectRawRow {
  const output: SportsConnectRawRow = {};

  headers.forEach((header, index) => {
    const normalizedHeader = normalizeWhitespace(header);
    const value = normalizeWhitespace(values[index] ?? "");

    if (!normalizedHeader) {
      return;
    }

    if (SENSITIVE_HEADERS.has(normalizedHeader.toLowerCase())) {
      return;
    }

    output[normalizedHeader] = value;
  });

  return output;
}

function normalizeRow(raw: SportsConnectRawRow): SportsConnectNormalizedRow {
  const programName = normalizeWhitespace(getValue(raw, "Program Name"));
  const divisionName = normalizeWhitespace(getValue(raw, "Division Name"));
  const rawTeamName = normalizeWhitespace(getValue(raw, "Team Name"));
  const isUnallocatedTeam = rawTeamName.length === 0 || rawTeamName.toLowerCase() === "unallocated";
  const teamName = isUnallocatedTeam ? null : rawTeamName;

  const playerFirstName = normalizeWhitespace(getValue(raw, "Player First Name"));
  const playerLastName = normalizeWhitespace(getValue(raw, "Player Last Name"));
  const playerBirthDateRaw = normalizeWhitespace(getValue(raw, "Player Birth Date") || getValue(raw, "Birth Date Time Stamp"));
  const playerBirthDateIso = toIsoBirthDate(playerBirthDateRaw);

  const programKey = normalizeKey(programName);
  const divisionKey = `${programKey}::${normalizeKey(divisionName)}`;
  const teamKey = teamName ? `${divisionKey}::${normalizeKey(teamName)}` : null;
  const playerKey = `${normalizeKey(playerFirstName)}|${normalizeKey(playerLastName)}|${playerBirthDateIso ?? playerBirthDateRaw}`;

  const metadata: Record<string, string | null> = {};
  Object.keys(raw).forEach((header) => {
    if (CORE_HEADERS.has(header)) {
      return;
    }

    metadata[header] = toNullable(getValue(raw, header));
  });

  return {
    programName,
    programKey,
    divisionName,
    divisionKey,
    teamName,
    teamKey,
    isUnallocatedTeam,

    accountFirstName: normalizeWhitespace(getValue(raw, "Account First Name")),
    accountLastName: normalizeWhitespace(getValue(raw, "Account Last Name")),
    guardianEmail: normalizeWhitespace(getValue(raw, "User Email")).toLowerCase(),
    phonePrimary: normalizePhone(getValue(raw, "Telephone")),
    phoneSecondary: normalizePhone(getValue(raw, "Cellphone")),
    phoneOther: normalizePhone(getValue(raw, "Other Phone")),
    street1: toNullable(getValue(raw, "Street Address")),
    street2: toNullable(getValue(raw, "Unit")),
    city: toNullable(getValue(raw, "City")),
    state: toNullable(getValue(raw, "State")),
    postalCode: toNullable(getValue(raw, "Postal Code")),

    playerFirstName,
    playerLastName,
    playerMiddleInitial: toNullable(getValue(raw, "Player Middle Initial")),
    playerSuffix: toNullable(getValue(raw, "Player Suffix")),
    playerGender: toNullable(getValue(raw, "Player Gender")),
    playerBirthDateRaw,
    playerBirthDateIso,
    playerLegacyId: toNullable(getValue(raw, "Player Id")),
    playerAssociationId: toNullable(getValue(raw, "Association Player ID")),
    orderDetailPlayerId: toNullable(getValue(raw, "Order Detail Player Id")),
    playerKey,

    jerseySize: toNullable(getValue(raw, "Jersey Size")),
    allergies: toNullable(getValue(raw, "Player Allergies")),
    physicalConditions: toNullable(getValue(raw, "Player Physical Conditions")),
    insuranceCompany: toNullable(getValue(raw, "Player Insurance Company")),
    insurancePolicyHolder: toNullable(getValue(raw, "Player Insurance Policy Holder")),
    insurancePolicyNumber: toNullable(getValue(raw, "Player Insurance Policy Number")),

    orderDateRaw: toNullable(getValue(raw, "Order Date")),
    orderTimestampRaw: toNullable(getValue(raw, "Order Time Stamp")),
    sourceOrderId: toNullable(getValue(raw, "Order Id")),
    sourceOrderNo: toNullable(getValue(raw, "Order No")),
    sourceOrderDetailId: toNullable(getValue(raw, "ODP Order Detail Id")),
    sourceOrderDetailPaymentId: toNullable(getValue(raw, "ODP Order Detail Payment Id")),
    sourcePaymentHistoryId: toNullable(getValue(raw, "ODP Payment History Id")),
    sourceOrderPaymentHistoryId: toNullable(getValue(raw, "OPH Order Payment History Id")),
    orderDetailDescription: toNullable(getValue(raw, "Order Detail Description")),
    sourcePaymentStatus: toNullable(getValue(raw, "Order Payment Status")),
    orderStatus: toNullable(getValue(raw, "Order Status")),
    orderPaymentMessage: toNullable(getValue(raw, "Order Payment Message")),

    orderItemAmount: toNullable(getValue(raw, "OrderItem Amount")),
    orderItemAmountPaid: toNullable(getValue(raw, "OrderItem Amount Paid")),
    orderItemBalance: toNullable(getValue(raw, "OrderItem Balance")),
    orderAmount: toNullable(getValue(raw, "Order Amount")),
    totalPaymentAmount: toNullable(getValue(raw, "Total Payment Amount")),
    orderPaymentAmount: toNullable(getValue(raw, "Order Payment Amount")),
    userPaidCcFee: toNullable(getValue(raw, "User Paid CC Fee")),
    userPaidRegistrationFee: toNullable(getValue(raw, "User Paid Registration Fee")),
    adminPaidCcFee: toNullable(getValue(raw, "Admin Paid CC Fee")),
    adminPaidRegistrationFee: toNullable(getValue(raw, "Admin Paid Registration Fee")),

    billingFirstName: toNullable(getValue(raw, "Billing First Name")),
    billingLastName: toNullable(getValue(raw, "Billing Last Name")),
    billingAddress: toNullable(getValue(raw, "Billing Address")),

    orderDetailProgramName: toNullable(getValue(raw, "Order Detail Program Name")),
    orderDetailDivisionName: toNullable(getValue(raw, "Order Detail Division Name")),

    metadata
  };
}

function validateRow(raw: SportsConnectRawRow, normalized: SportsConnectNormalizedRow): SportsConnectParseIssue[] {
  const issues: SportsConnectParseIssue[] = [];

  if (!normalized.programName) {
    issues.push({
      code: "missing_required_value",
      field: "Program Name",
      message: "Program Name is required."
    });
  }

  if (!normalized.divisionName) {
    issues.push({
      code: "missing_required_value",
      field: "Division Name",
      message: "Division Name is required."
    });
  }

  if (!normalized.playerFirstName || !normalized.playerLastName) {
    issues.push({
      code: "missing_required_value",
      field: "Player Name",
      message: "Player First Name and Player Last Name are required."
    });
  }

  if (!normalized.guardianEmail) {
    issues.push({
      code: "missing_required_value",
      field: "User Email",
      message: "User Email is required."
    });
  } else if (!EMAIL_PATTERN.test(normalized.guardianEmail)) {
    issues.push({
      code: "invalid_email",
      field: "User Email",
      message: "User Email is invalid."
    });
  }

  if (normalizeWhitespace(raw["Player Birth Date"] ?? raw["Birth Date Time Stamp"] ?? "") && !normalized.playerBirthDateIso) {
    issues.push({
      code: "invalid_birth_date",
      field: "Player Birth Date",
      message: "Player Birth Date must begin with MM/DD/YYYY."
    });
  }

  const orderValue = normalized.orderDateRaw ?? normalized.orderTimestampRaw;
  if (orderValue && !parseSportsConnectDateTime(orderValue)) {
    issues.push({
      code: "invalid_order_date",
      field: "Order Date",
      message: "Order Date must be MM/DD/YYYY hh:mm:ss A or MM/DD/YYYY."
    });
  }

  return issues;
}

export function parseSportsConnectCsv(input: string): {
  parsedRows: SportsConnectParsedRow[];
  headerWarnings: SportsConnectParseIssue[];
  headers: string[];
} {
  const rows = parseCsvMatrix(input);
  if (rows.length === 0) {
    return {
      parsedRows: [],
      headers: [],
      headerWarnings: [
        {
          code: "missing_required_header",
          message: "CSV is empty."
        }
      ]
    };
  }

  const headers = rows[0].map((value) => normalizeWhitespace(value)).filter(Boolean);
  const lowerHeaderSet = new Set(headers.map((header) => header.toLowerCase()));

  const headerWarnings: SportsConnectParseIssue[] = [];
  SPORTS_CONNECT_REQUIRED_HEADERS.forEach((requiredHeader) => {
    if (!lowerHeaderSet.has(requiredHeader.toLowerCase())) {
      headerWarnings.push({
        code: "missing_required_header",
        field: requiredHeader,
        message: `Missing required header: ${requiredHeader}`
      });
    }
  });

  if (headerWarnings.length > 0) {
    return {
      parsedRows: [],
      headers,
      headerWarnings
    };
  }

  const parsedRows: SportsConnectParsedRow[] = [];
  for (let i = 1; i < rows.length; i += 1) {
    const values = rows[i] ?? [];
    const raw = buildRawRow(headers, values);
    const normalized = normalizeRow(raw);
    const issues = validateRow(raw, normalized);

    parsedRows.push({
      rowNumber: i + 1,
      rowHash: rowHash(raw, Object.keys(raw)),
      raw,
      normalized,
      issues,
      warnings: []
    });
  }

  return {
    parsedRows,
    headers,
    headerWarnings
  };
}
