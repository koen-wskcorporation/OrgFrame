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
      footerNote="If you did not request a password reset, you can safely ignore this email."
    >
      <Heading as="h1" style={emailStyles.heading}>Reset your password</Heading>
      <Text style={emailStyles.paragraph}>
        We received a request to reset the password on your OrgFrame account. Click the button below to choose a new one.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={actionUrl} style={emailStyles.button}>Reset password</Button>
      </Section>
      <Text style={emailStyles.muted}>
        Or paste this link into your browser:<br />
        <Link href={actionUrl} style={emailStyles.link}>{actionUrl}</Link>
      </Text>
      <Text style={emailStyles.muted}>
        If the link does not work, use this one-time code: <span style={emailStyles.code}>{token}</span>
      </Text>
      <Text style={emailStyles.muted}>This link expires in 1 hour.</Text>
    </EmailLayout>
  );
}
