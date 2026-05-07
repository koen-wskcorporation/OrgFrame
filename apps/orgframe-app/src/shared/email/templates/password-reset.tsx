import { Button, Heading, Link, Section, Text } from "@react-email/components";
import { EmailLayout, emailStyles } from "./_layout";

export type PasswordResetEmailProps = {
  actionUrl: string;
  token: string;
};

export default function PasswordResetEmail({ actionUrl, token }: PasswordResetEmailProps) {
  return (
    <EmailLayout
      preview="Reset your OrgFrame password"
      footerNote="If you did not request a password reset, you can safely ignore this email — your account is unchanged."
    >
      <Heading as="h1" style={emailStyles.heading}>
        Reset your password
      </Heading>
      <Text style={emailStyles.paragraph}>
        We received a request to reset the password on your OrgFrame account. Click the button below to choose a new
        one. The link expires in <strong>1 hour</strong>.
      </Text>
      <Section style={emailStyles.buttonRow}>
        <Button href={actionUrl} style={emailStyles.button}>
          Reset password
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
