import {
  getOptionalSupabaseServiceRoleConfig as getRawOptionalSupabaseServiceRoleConfig,
  getSupabasePublicConfig as getRawSupabasePublicConfig,
  getSupabaseServiceRoleConfig as getRawSupabaseServiceRoleConfig
} from "@/src/shared/supabase/config";

// Centralized config gateway for the in-app Data API layer.
export function getDataApiPublicConfig() {
  return getRawSupabasePublicConfig();
}

export function getDataApiServiceRoleConfig() {
  return getRawSupabaseServiceRoleConfig();
}

export function getOptionalDataApiServiceRoleConfig() {
  return getRawOptionalSupabaseServiceRoleConfig();
}

// Backward-compatible aliases used during migration.
export const getSupabasePublicConfig = getDataApiPublicConfig;
export const getSupabaseServiceRoleConfig = getDataApiServiceRoleConfig;
export const getOptionalSupabaseServiceRoleConfig = getOptionalDataApiServiceRoleConfig;
