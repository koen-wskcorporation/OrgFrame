import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Facility Structure"
};

export default async function OrgManageFacilityStructurePage() {
  return <Alert variant="info">Structure tab placeholder: facility map editing is temporarily disabled.</Alert>;
}
