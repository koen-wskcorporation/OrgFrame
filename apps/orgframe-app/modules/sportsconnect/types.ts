export const SPORTS_CONNECT_REQUIRED_HEADERS = [
  "Program Name",
  "Division Name",
  "Player First Name",
  "Player Last Name",
  "User Email"
] as const;

export const SPORTS_CONNECT_SENSITIVE_HEADERS = [
  "Last 4 of CC",
  "Order Card Expiry Month",
  "Order Card Expiry Year",
  "Order Payment Method",
  "OPH Payment Method",
  "OPH Credit Card Number",
  "OPH Card Expiry Month",
  "OPH Card Expiry Year",
  "OPH Transaction Id",
  "OPH Auth Code",
  "OPH Avs Code",
  "OPH Credit Card Type"
] as const;

export type SportsConnectRawRow = Record<string, string>;

export type SportsConnectNormalizedRow = {
  programName: string;
  programKey: string;
  divisionName: string;
  divisionKey: string;
  teamName: string | null;
  teamKey: string | null;
  isUnallocatedTeam: boolean;

  accountFirstName: string;
  accountLastName: string;
  guardianEmail: string;
  phonePrimary: string | null;
  phoneSecondary: string | null;
  phoneOther: string | null;
  street1: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;

  playerFirstName: string;
  playerLastName: string;
  playerMiddleInitial: string | null;
  playerSuffix: string | null;
  playerGender: string | null;
  playerBirthDateRaw: string;
  playerBirthDateIso: string | null;
  playerLegacyId: string | null;
  playerAssociationId: string | null;
  orderDetailPlayerId: string | null;
  playerKey: string;

  jerseySize: string | null;
  allergies: string | null;
  physicalConditions: string | null;
  insuranceCompany: string | null;
  insurancePolicyHolder: string | null;
  insurancePolicyNumber: string | null;

  orderDateRaw: string | null;
  orderTimestampRaw: string | null;
  sourceOrderId: string | null;
  sourceOrderNo: string | null;
  sourceOrderDetailId: string | null;
  sourceOrderDetailPaymentId: string | null;
  sourcePaymentHistoryId: string | null;
  sourceOrderPaymentHistoryId: string | null;
  orderDetailDescription: string | null;
  sourcePaymentStatus: string | null;
  orderStatus: string | null;
  orderPaymentMessage: string | null;

  orderItemAmount: string | null;
  orderItemAmountPaid: string | null;
  orderItemBalance: string | null;
  orderAmount: string | null;
  totalPaymentAmount: string | null;
  orderPaymentAmount: string | null;
  userPaidCcFee: string | null;
  userPaidRegistrationFee: string | null;
  adminPaidCcFee: string | null;
  adminPaidRegistrationFee: string | null;

  billingFirstName: string | null;
  billingLastName: string | null;
  billingAddress: string | null;

  orderDetailProgramName: string | null;
  orderDetailDivisionName: string | null;

  metadata: Record<string, string | null>;
};

export type SportsConnectParseIssueCode =
  | "missing_required_header"
  | "missing_required_value"
  | "invalid_email"
  | "invalid_birth_date"
  | "invalid_order_date";

export type SportsConnectParseIssue = {
  code: SportsConnectParseIssueCode;
  message: string;
  field?: string;
};

export type SportsConnectParsedRow = {
  rowNumber: number;
  rowHash: string;
  raw: SportsConnectRawRow;
  normalized: SportsConnectNormalizedRow;
  issues: SportsConnectParseIssue[];
  warnings: string[];
};

export type SportsConnectMappingKind = "program" | "division" | "team";
export type SportsConnectMappingMode = "create" | "existing";

export type SportsConnectMappingCandidate = {
  id: string;
  label: string;
  parentLabel: string | null;
};

export type SportsConnectMappingRequirement = {
  key: string;
  kind: SportsConnectMappingKind;
  label: string;
  sourceProgramKey: string;
  sourceDivisionKey: string | null;
  required: boolean;
  selectedMode: SportsConnectMappingMode | null;
  selectedCandidateId: string | null;
  candidates: SportsConnectMappingCandidate[];
};

export type SportsConnectDryRunSummary = {
  totalRows: number;
  validRows: number;
  rowsWithIssues: number;
  requiredMappings: number;
  unresolvedMappings: number;
  uniquePrograms: number;
  uniqueDivisions: number;
  uniqueTeams: number;
};

export type SportsConnectRunHistoryItem = {
  id: string;
  status: "dry_run" | "ready" | "committed" | "failed";
  sourceFilename: string | null;
  rowCount: number;
  summary: Record<string, unknown>;
  createdAt: string;
  committedAt: string | null;
  errorText: string | null;
};

export type SportsConnectProjectedPlayer = {
  key: string;
  name: string;
  birthDateIso: string | null;
  guardianEmail: string | null;
  rowCount: number;
};

export type SportsConnectProjectedTeam = {
  key: string;
  name: string;
  players: SportsConnectProjectedPlayer[];
};

export type SportsConnectProjectedDivision = {
  key: string;
  name: string;
  teams: SportsConnectProjectedTeam[];
  unallocatedPlayers: SportsConnectProjectedPlayer[];
};

export type SportsConnectProjectedProgram = {
  key: string;
  name: string;
  divisions: SportsConnectProjectedDivision[];
};

export type SportsConnectRunProjection = {
  runId: string;
  status: "dry_run" | "ready";
  unresolvedMappings: number;
  summary: {
    programs: number;
    newPrograms: number;
    existingPrograms: number;
    divisions: number;
    newDivisions: number;
    existingDivisions: number;
    teams: number;
    newTeams: number;
    existingTeams: number;
    players: number;
    newPlayers: number;
    existingPlayers: number;
    accounts: number;
    newAccounts: number;
    existingAccounts: number;
    unallocatedPlayers: number;
    skippedRowsWithIssues: number;
  };
  programs: SportsConnectProjectedProgram[];
};

export type SportsConnectDryRunResult = {
  runId: string;
  status: "dry_run" | "ready";
  sourceFilename: string | null;
  summary: SportsConnectDryRunSummary;
  mappingRequirements: SportsConnectMappingRequirement[];
  rowIssues: Array<{
    rowNumber: number;
    messages: string[];
  }>;
};

export type SportsConnectResolveMappingResult = {
  runId: string;
  status: "dry_run" | "ready";
  unresolvedMappings: number;
  mappingRequirements: SportsConnectMappingRequirement[];
};

export type SportsConnectCommitSummary = {
  processedRows: number;
  skippedRows: number;
  failedRows: number;

  createdUsers: number;
  linkedExistingUsers: number;
  createdPlayers: number;
  linkedGuardians: number;

  createdPrograms: number;
  createdDivisions: number;
  createdTeams: number;

  createdSubmissions: number;
  createdRegistrations: number;
  createdTeamMembers: number;

  createdOrders: number;
  createdOrderItems: number;
  createdOrderPayments: number;
};

export type SportsConnectCommitResult = {
  runId: string;
  status: "committed" | "failed";
  summary: SportsConnectCommitSummary;
  failures: Array<{
    rowNumber: number;
    message: string;
  }>;
  warnings: Array<{
    rowNumber: number;
    message: string;
  }>;
  orders: Array<{
    orderId: string;
    sourceOrderId: string;
    sourceOrderNo: string | null;
    sourcePaymentStatus: string | null;
  }>;
};

export type SportsConnectActivationLookup = {
  found: boolean;
  requiresActivation: boolean;
};

export type SportsConnectActivationSendResult = {
  ok: boolean;
  message: string;
};
