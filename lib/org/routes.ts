export type WorkspaceSettingsSection = "general" | "branding" | "domains" | "access" | "features" | "billing";
export type WorkspaceProgramSection = "structure" | "schedule" | "registration" | "teams" | "settings";
export type WorkspaceFormSection = "editor" | "submissions" | "settings";

export function orgRootPath(orgSlug: string) {
  return `/${orgSlug}`;
}

export function orgWorkspacePath(orgSlug: string) {
  return `/${orgSlug}/workspace`;
}

export function orgWorkspaceProgramsPath(orgSlug: string) {
  return `${orgWorkspacePath(orgSlug)}/programs`;
}

export function orgWorkspaceProgramPath(orgSlug: string, programId: string) {
  return `${orgWorkspaceProgramsPath(orgSlug)}/${programId}`;
}

export function orgWorkspaceProgramSectionPath(orgSlug: string, programId: string, section: WorkspaceProgramSection) {
  return `${orgWorkspaceProgramPath(orgSlug, programId)}/${section}`;
}

export function orgWorkspaceFacilitiesPath(orgSlug: string) {
  return `${orgWorkspacePath(orgSlug)}/facilities`;
}

export function orgWorkspaceFacilityPath(orgSlug: string, facilityId: string) {
  return `${orgWorkspaceFacilitiesPath(orgSlug)}/${facilityId}`;
}

export function orgWorkspaceFacilityEditPath(orgSlug: string, facilityId: string) {
  return `${orgWorkspaceFacilityPath(orgSlug, facilityId)}/edit`;
}

export function orgWorkspaceFormsPath(orgSlug: string) {
  return `${orgWorkspacePath(orgSlug)}/forms`;
}

export function orgWorkspaceFormPath(orgSlug: string, formId: string) {
  return `${orgWorkspaceFormsPath(orgSlug)}/${formId}`;
}

export function orgWorkspaceFormSectionPath(orgSlug: string, formId: string, section: WorkspaceFormSection) {
  return `${orgWorkspaceFormPath(orgSlug, formId)}/${section}`;
}

export function orgWorkspaceEventsPath(orgSlug: string) {
  return `${orgWorkspacePath(orgSlug)}/events`;
}

export function orgWorkspaceSettingsPath(orgSlug: string) {
  return `${orgWorkspacePath(orgSlug)}/settings`;
}

export function orgWorkspaceSettingsSectionPath(orgSlug: string, section: WorkspaceSettingsSection) {
  return `${orgWorkspaceSettingsPath(orgSlug)}/${section}`;
}

export function orgPublicProgramsPath(orgSlug: string) {
  return `${orgRootPath(orgSlug)}/programs`;
}

export function orgPublicProgramPath(orgSlug: string, programSlug: string) {
  return `${orgPublicProgramsPath(orgSlug)}/${programSlug}`;
}

export function orgRegisterPath(orgSlug: string, formSlug: string) {
  return `${orgRootPath(orgSlug)}/register/${formSlug}`;
}
