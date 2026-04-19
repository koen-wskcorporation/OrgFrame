import type { NextRequest, NextResponse } from "next/server";
import {
  createSupabaseServer as createRawSupabaseServer,
  createSupabaseServerForRequest as createRawSupabaseServerForRequest
} from "@/src/shared/supabase/server";
import {
  createOptionalSupabaseServiceRoleClient as createRawOptionalSupabaseServiceRoleClient,
  createSupabaseServiceRoleClient as createRawSupabaseServiceRoleClient
} from "@/src/shared/supabase/service-role";

// Centralized in-app Data API gateway.
// Feature code should import from this module instead of directly from shared/supabase/*.
export async function createDataApiServer() {
  return createRawSupabaseServer();
}

export function createDataApiServerForRequest(request: NextRequest, response: NextResponse) {
  return createRawSupabaseServerForRequest(request, response);
}

export function createDataApiServiceRoleClient() {
  return createRawSupabaseServiceRoleClient();
}

export function createOptionalDataApiServiceRoleClient() {
  return createRawOptionalSupabaseServiceRoleClient();
}

// Backward-compatible aliases used during migration.
export const createSupabaseServer = createDataApiServer;
export const createSupabaseServerClient = createDataApiServer;
export const createSupabaseServerForRequest = createDataApiServerForRequest;
export const createSupabaseServiceRoleClient = createDataApiServiceRoleClient;
export const createOptionalSupabaseServiceRoleClient = createOptionalDataApiServiceRoleClient;
