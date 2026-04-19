import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_layout";

export type MagicLinkEmailProps = {
  actionUrl: string;
  token: string;
};

export default function MagicLinkEmail({ actionUrl, token }: MagicLinkEmailProps) {
  return (
    <EmailLayout
      preview="Your OrgFrame sign-in link"
      footerNote="If you did not request this link, you can ignore this email."
    >
      <Heading as="h1" style={emailStyles.heading}>Sign in to OrgFrame</Heading>
      <Text style={emailStyles.paragraph}>Click the button below to sign in. This link will expire shortly.</Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={actionUrl} style={emailStyles.button}>Sign in</Button>
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
