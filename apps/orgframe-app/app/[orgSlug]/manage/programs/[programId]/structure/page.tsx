import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Program Structure"
};

export default async function OrgManageProgramStructurePage() {
  return <Alert variant="info">Program map is intentionally deferred in this phase. Facility map v1 is the active canvas implementation.</Alert>;
}
