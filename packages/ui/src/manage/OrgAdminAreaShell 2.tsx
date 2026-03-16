import { UniversalAppShell } from "@orgframe/ui/shared/UniversalAppShell";

type OrgAdminAreaShellProps = React.ComponentProps<typeof UniversalAppShell>;

export function OrgAdminAreaShell(props: OrgAdminAreaShellProps) {
  return <UniversalAppShell {...props} />;
}
