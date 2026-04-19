import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text
} from "@react-email/components";
import type { ReactNode } from "react";

type TenantEmailLayoutProps = {
  preview: string;
  orgName: string;
  children: ReactNode;
};

// The unsubscribe URL is injected by the send pipeline (send.ts) — templates
// just render the marker "{{UNSUBSCRIBE_URL}}" which gets replaced at send time.
// This keeps templates org-agnostic and lets the platform guarantee a working
// unsubscribe link on every tenant email (CAN-SPAM compliance).
export function TenantEmailLayout({ preview, orgName, children }: TenantEmailLayoutProps) {
  const colors = {
    bg: "#f5f6f8",
    card: "#ffffff",
    text: "#1a1d21",
    muted: "#697079",
    border: "#e5e7eb"
  };

  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.bg, margin: 0, padding: "32px 0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" }}>
        <Container style={{ backgroundColor: colors.card, borderRadius: "12px", maxWidth: "560px", margin: "0 auto", padding: "40px", border: `1px solid ${colors.border}` }}>
          <Section>
            <Text style={{ color: colors.text, fontWeight: 700, fontSize: "18px", margin: 0 }}>{orgName}</Text>
          </Section>
          {children}
          <Hr style={{ borderTop: `1px solid ${colors.border}`, margin: "32px 0 16px" }} />
          <Section>
            <Text style={{ color: colors.muted, fontSize: "12px", lineHeight: "18px", margin: 0 }}>
              You received this email from {"{{ORG_NAME}}"}. <Link href="{{UNSUBSCRIBE_URL}}" style={{ color: colors.muted, textDecoration: "underline" }}>Unsubscribe</Link>.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const tenantEmailStyles = {
  heading: { color: "#1a1d21", fontSize: "22px", fontWeight: 600, lineHeight: "28px", margin: "24px 0 12px" },
  paragraph: { color: "#1a1d21", fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" }
};
