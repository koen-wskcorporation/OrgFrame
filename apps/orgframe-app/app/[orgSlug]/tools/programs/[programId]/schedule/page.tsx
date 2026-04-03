import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Program Schedule"
};

export default async function OrgManageProgramSchedulePage() {
  return <Alert variant="info">Placeholder: schedule tab for this program.</Alert>;
}
