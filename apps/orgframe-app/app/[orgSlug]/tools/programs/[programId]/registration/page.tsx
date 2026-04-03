import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Program Registration"
};

export default async function OrgManageProgramRegistrationPage() {
  return <Alert variant="info">Placeholder: registration tab for this program.</Alert>;
}
