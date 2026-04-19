import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Facility Settings"
};

export default async function OrgManageFacilitySettingsPage() {
  return <Alert variant="info">Placeholder: settings tab for this facility.</Alert>;
}
