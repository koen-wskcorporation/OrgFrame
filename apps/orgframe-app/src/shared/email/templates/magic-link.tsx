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
      footerNote="If you did not request this link, you can safely ignore this email."
    >
      <Heading as="h1" style={emailStyles.heading}>
        Sign in to OrgFrame
      </Heading>
      <Text style={emailStyles.paragraph}>
        Click the button below to sign in. The link is single-use and expires shortly.
      </Text>
      <Section style={emailStyles.buttonRow}>
        <Button href={actionUrl} style={emailStyles.button}>
          Sign in
        </Button>
      </Section>
      <Section style={emailStyles.panel}>
        <Text style={emailStyles.panelLabel}>One-time code</Text>
        <Text style={emailStyles.code}>{token}</Text>
      </Section>
      <Section style={emailStyles.panel}>
        <Text style={emailStyles.panelLabel}>Or paste this link</Text>
        <Link href={actionUrl} style={emailStyles.fallbackLink}>
          {actionUrl}
        </Link>
      </Section>
    </EmailLayout>
  );
}
