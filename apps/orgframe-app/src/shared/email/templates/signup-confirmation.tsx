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
      footerNote="If you did not create an OrgFrame account, you can ignore this email."
    >
      <Heading as="h1" style={emailStyles.heading}>Welcome to OrgFrame</Heading>
      <Text style={emailStyles.paragraph}>
        Confirm your email address to finish setting up your account.
      </Text>
      <Section style={{ margin: "24px 0" }}>
        <Button href={actionUrl} style={emailStyles.button}>Confirm email</Button>
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
