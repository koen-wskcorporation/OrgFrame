import { NextResponse } from "next/server";
import { getDomainConnectTemplateDefinition } from "@/src/shared/domains/domainConnect";

export async function GET() {
  return NextResponse.json(getDomainConnectTemplateDefinition(), {
    headers: {
      "Cache-Control": "no-store"
    }
  });
}
