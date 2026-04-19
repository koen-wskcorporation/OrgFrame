import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Program Structure"
};

export default async function OrgManageProgramStructurePage() {
  return <Alert variant="info">Structure tab placeholder: program structure map is temporarily disabled.</Alert>;
}
