import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_layout";

export type InviteEmailProps = {
  actionUrl: string;
  token: string;
};

export default function InviteEmail({ actionUrl, token }: InviteEmailProps) {
  return (
    <EmailLayout
      preview="You've been invited to OrgFrame"
      footerNote="If you weren't expecting this invite, you can safely ignore this email."
    >
      <Heading as="h1" style={emailStyles.heading}>
        You're invited to OrgFrame
      </Heading>
      <Text style={emailStyles.paragraph}>
        An admin has invited you to join their organization on OrgFrame. Accept below to set up your account and get
        started.
      </Text>
      <Section style={emailStyles.buttonRow}>
        <Button href={actionUrl} style={emailStyles.button}>
          Accept invite
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
