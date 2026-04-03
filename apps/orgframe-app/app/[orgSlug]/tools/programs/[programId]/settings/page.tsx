import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Program Settings"
};

export default async function OrgManageProgramSettingsPage() {
  return <Alert variant="info">Placeholder: settings tab for this program.</Alert>;
}
