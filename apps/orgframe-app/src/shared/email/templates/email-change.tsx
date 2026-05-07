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
      footerNote="If you did not request this change, reset your password immediately and contact support."
    >
      <Heading as="h1" style={emailStyles.heading}>
        Confirm email change
      </Heading>
      <Text style={emailStyles.paragraph}>
        A request was made to change the email on your OrgFrame account{newEmail ? (
          <>
            {" "}to <strong>{newEmail}</strong>
          </>
        ) : null}
        . Confirm below to keep this change.
      </Text>
      <Section style={emailStyles.buttonRow}>
        <Button href={actionUrl} style={emailStyles.button}>
          Confirm change
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
