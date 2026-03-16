import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseSportsConnectCsv } from "@/modules/sportsconnect/parser";

const REPORT_HEADERS = `Program Name
Division Name
Account First Name
Account Last Name
Player First Name
Player Last Name
Player Gender
Player Birth Date
Street Address
Unit
City
State
Postal Code
User Email
Telephone
Cellphone
Other Phone
Team Name
Order Date
Order No
Order Detail Description
OrderItem Amount
OrderItem Amount Paid
OrderItem Balance
Order Payment Status
Jersey Size
Player Allergies
Player Emergency Contact First Name
Player Emergency Contact Last Name
Player Emergency Telephone
Player Insurance Company
Player Insurance Policy Holder
Player Insurance Policy Number
Player Physical Conditions
Player Waiver
Player Verification Waiver
Shorts Size
Socks Size
Pants Size
Special Player Request
Tetanus Shot
Tetanus Shot Date
Position Played
Race Estimated Finish Time
Race Shirt
New Or Returning
School Name
Little League School Name
Current Grade
Rising Grade
Teammate Request
Coach Request
Previous Coach
Years of Experience
USL Membership Number
Little League Eligibility
Association Player ID
Division Id
Division Start Date
Division End Date
Division Price
Division Gender
Division Open Registration
Division Close Registration
Division Max Players
Division Accept Deposits
Division Deposit Amount
Division Tryout Fee Amount
Division Minimum Age
Division Maximum Age
Enabled Wait List
Order Detail Program Name
Order Detail Division Name
Order Deposit Only
Order Deposit Only Amount
Order Detail Player Id
Order Amount
Order Time Stamp
Billing First Name
Billing Last Name
Billing Address
Last 4 of CC
Order Card Expiry Month
Order Card Expiry Year
Orders Order Notes
Order Status
Order Payment Message
Order Payment Amount
User Paid CC Fee
User Paid Registration Fee
Admin Paid CC Fee
Admin Paid Registration Fee
Total Payment Amount
Order Payment Method
Non-Volunteer Fee
Order Id
Order Notes
ODP Order Detail Payment Id
ODP Order Detail Id
ODP Payment History Id
ODP Paid Amount
ODP Paid Reg Fee
ODP Paid CC Fee
ODP Created By
ODP Created Date
OPH Order Id
OPH Payment Date
OPH Bill To First Name
OPH Bill To Last Name
OPH Bill To Address
OPH Bill To City
OPH Bill To State
OPH Bill To Zip
OPH Payment Amount
OPH Payment Method
OPH Order Notes
OPH Credit Card Number
OPH Card Expiry Month
OPH Card Expiry Year
OPH Transaction Id
OPH Auth Code
OPH Avs Code
OPH Payment Status
OPH Is Open Order Payment
OPH Order Payment History Id
OPH Old Order Payment History Id
OPH Credit Card Type
OPH CC Fee
OPH Per Reg Fee
Player Id
Player Middle Initial
Birth Date Time Stamp
Player Age
Little League Age (Baseball)
Little League Age (Softball)
Player Email
Player Street
Player Unit
Player City
Player State
Player Postal Code
Player Telephone
Player State Abbreviation
Player Cellphone
Registration Number
Player Jersey Number
Player Evaluation Comment
Player Evaluation Rating
Numeric Ranking (Auto Assign)
Birth Certificate Note
Recent Team
Tryout Rejection Email Sent
Tryout Acceptance Status
Tryout Acceptance Email Status
New Registrant
Play Down
Birth Certificate
Verification Note
Player Suffix
Weight
Associated Team Staff`;

function encodeCsvCell(value: string) {
  if (value.includes(",") || value.includes('"') || value.includes("\n")) {
    return `"${value.replace(/"/g, '""')}"`;
  }

  return value;
}

describe("sportsconnect parser", () => {
  it("handles BOM, 161-column reports, quoted values, sparse fields, and redaction", () => {
    const headers = REPORT_HEADERS.split("\n");
    assert.equal(headers.length, 161);

    const row = new Map<string, string>();
    row.set("Program Name", "Spring Soccer");
    row.set("Division Name", "U10 Boys");
    row.set("Account First Name", "Jordan");
    row.set("Account Last Name", "Smith");
    row.set("Player First Name", "Riley");
    row.set("Player Last Name", "Smith");
    row.set("Player Birth Date", "03/01/2016");
    row.set("User Email", "parent@example.org");
    row.set("Telephone", "313-555-1212");
    row.set("Team Name", "Unallocated");
    row.set("Order Date", "02/14/2026 04:31:11 PM");
    row.set("Order Detail Description", "Late fee, weekend");
    row.set("Order Id", "ORD-991");
    row.set("Order No", "991");
    row.set("OrderItem Amount", "125.00");
    row.set("Player Allergies", "Peanuts");
    row.set("Player Physical Conditions", "Asthma");
    row.set("Player Insurance Company", "ABC Health");
    row.set("Player Insurance Policy Holder", "Jordan Smith");
    row.set("School Name", "Acme Academy");
    row.set("Last 4 of CC", "1234");
    row.set("OPH Credit Card Number", "4111111111111111");
    row.set("Order Payment Method", "Visa");

    const values = headers.map((header) => row.get(header) ?? "");
    const csv = `\uFEFF${headers.map(encodeCsvCell).join(",")}\n${values.map(encodeCsvCell).join(",")}\n`;

    const parsed = parseSportsConnectCsv(csv);

    assert.equal(parsed.headerWarnings.length, 0);
    assert.equal(parsed.headers.length, 161);
    assert.equal(parsed.parsedRows.length, 1);

    const first = parsed.parsedRows[0];
    assert.ok(first);
    assert.equal(first?.issues.length, 0);
    assert.equal(first?.normalized.orderDetailDescription, "Late fee, weekend");
    assert.equal(first?.normalized.phonePrimary, "(313) 555-1212");
    assert.equal(first?.normalized.isUnallocatedTeam, true);
    assert.equal(first?.normalized.insuranceCompany, "ABC Health");

    assert.equal(first?.raw["Last 4 of CC"], undefined);
    assert.equal(first?.raw["OPH Credit Card Number"], undefined);
    assert.equal(first?.raw["Order Payment Method"], undefined);

    assert.equal(first?.normalized.metadata["School Name"], "Acme Academy");
  });

  it("reports validation issues for malformed rows", () => {
    const csv = [
      "Program Name,Division Name,Player First Name,Player Last Name,User Email,Player Birth Date,Order Date",
      "Winter Hoops,U12,Gabby,Lopez,bad-email,99/99/2020,not-a-date"
    ].join("\n");

    const parsed = parseSportsConnectCsv(csv);
    assert.equal(parsed.headerWarnings.length, 0);
    assert.equal(parsed.parsedRows.length, 1);

    const first = parsed.parsedRows[0];
    assert.ok(first);

    const codes = new Set(first?.issues.map((issue) => issue.code));
    assert.equal(codes.has("invalid_email"), true);
    assert.equal(codes.has("invalid_birth_date"), true);
    assert.equal(codes.has("invalid_order_date"), true);
  });
});
