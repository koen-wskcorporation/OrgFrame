import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_layout";

export type InviteEmailProps = {
  actionUrl: string;
  token: string;
};

export default function InviteEmail({ actionUrl, token }: InviteEmailProps) {
  return (
    <EmailLayout preview="You've been invited to OrgFrame">
      <Heading as="h1" style={emailStyles.heading}>You're invited</Heading>
      <Text style={emailStyles.paragraph}>
        An OrgFrame admin has invited you to join their organization. Accept the invite to set up your account.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={actionUrl} style={emailStyles.button}>Accept invite</Button>
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
