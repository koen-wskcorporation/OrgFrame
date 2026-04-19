import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Facility Overview"
};

export default async function OrgManageFacilityOverviewPage() {
  return <Alert variant="info">Placeholder: overview tab for this facility.</Alert>;
}
