import type { Metadata } from "next";
import { Alert } from "@orgframe/ui/primitives/alert";

export const metadata: Metadata = {
  title: "Program Teams"
};

export default async function ProgramTeamsPage() {
  return <Alert variant="info">Placeholder: teams tab for this program.</Alert>;
}
