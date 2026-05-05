import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_layout";

export type SignupConfirmationEmailProps = {
  actionUrl: string;
  token: string;
};

export default function SignupConfirmationEmail({ actionUrl, token }: SignupConfirmationEmailProps) {
  return (
    <EmailLayout
      preview="Confirm your OrgFrame email"
      footerNote="If you did not create an OrgFrame account, you can safely ignore this email."
    >
      <Heading as="h1" style={emailStyles.heading}>
        Welcome to OrgFrame
      </Heading>
      <Text style={emailStyles.paragraph}>
        You're one click away. Confirm your email address to finish setting up your account and start managing your
        organization.
      </Text>
      <Section style={emailStyles.buttonRow}>
        <Button href={actionUrl} style={emailStyles.button}>
          Confirm email
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
