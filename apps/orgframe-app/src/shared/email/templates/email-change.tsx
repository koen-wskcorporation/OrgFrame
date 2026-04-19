import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_layout";

export type EmailChangeProps = {
  actionUrl: string;
  token: string;
  newEmail?: string;
};

export default function EmailChangeEmail({ actionUrl, token, newEmail }: EmailChangeProps) {
  return (
    <EmailLayout
      preview="Confirm your new OrgFrame email"
      footerNote="If you did not request this change, please reset your password immediately."
    >
      <Heading as="h1" style={emailStyles.heading}>Confirm email change</Heading>
      <Text style={emailStyles.paragraph}>
        A request was made to change your OrgFrame account email{newEmail ? ` to ${newEmail}` : ""}. Confirm this change to keep it.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={actionUrl} style={emailStyles.button}>Confirm change</Button>
      </Section>
      <Text style={emailStyles.muted}>
        Or paste this link into your browser:<br />
        <Link href={actionUrl} style={emailStyles.link}>{actionUrl}</Link>
      </Text>
      <Text style={emailStyles.muted}>
        One-time code: <span style={emailStyles.code}>{token}</span>
      </Text>
    </EmailLayout>
  );
}
