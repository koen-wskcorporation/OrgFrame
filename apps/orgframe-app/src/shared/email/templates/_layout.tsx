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

type EmailLayoutProps = {
  preview: string;
  children: ReactNode;
  footerNote?: string;
};

const COLORS = {
  bg: "#f5f6f8",
  card: "#ffffff",
  text: "#1a1d21",
  muted: "#697079",
  brand: "#0b5cff",
  border: "#e5e7eb"
};

const styles = {
  body: { backgroundColor: COLORS.bg, margin: 0, padding: "32px 0", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif" },
  container: { backgroundColor: COLORS.card, borderRadius: "12px", maxWidth: "560px", margin: "0 auto", padding: "40px", border: `1px solid ${COLORS.border}` },
  brand: { color: COLORS.brand, fontWeight: 700, fontSize: "18px", letterSpacing: "-0.01em", margin: 0 },
  divider: { borderTop: `1px solid ${COLORS.border}`, margin: "32px 0 24px" },
  footer: { color: COLORS.muted, fontSize: "12px", lineHeight: "18px", margin: 0 },
  footerLink: { color: COLORS.muted, textDecoration: "underline" }
};

export function EmailLayout({ preview, children, footerNote }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section>
            <Text style={styles.brand}>OrgFrame</Text>
          </Section>
          {children}
          <Hr style={styles.divider} />
          <Section>
            {footerNote ? <Text style={styles.footer}>{footerNote}</Text> : null}
            <Text style={styles.footer}>
              OrgFrame &middot; <Link href="https://orgframe.app" style={styles.footerLink}>orgframe.app</Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

export const emailStyles = {
  heading: { color: COLORS.text, fontSize: "22px", fontWeight: 600, lineHeight: "28px", margin: "24px 0 12px" },
  paragraph: { color: COLORS.text, fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" },
  muted: { color: COLORS.muted, fontSize: "13px", lineHeight: "20px", margin: "16px 0 0" },
  button: {
    backgroundColor: COLORS.brand,
    color: "#ffffff",
    padding: "12px 22px",
    borderRadius: "8px",
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "15px",
    display: "inline-block"
  },
  code: {
    display: "inline-block",
    padding: "10px 14px",
    backgroundColor: "#f1f2f4",
    border: `1px solid ${COLORS.border}`,
    borderRadius: "8px",
    fontFamily: "Menlo, Monaco, monospace",
    fontSize: "16px",
    letterSpacing: "2px"
  },
  link: { color: COLORS.brand, wordBreak: "break-all" as const }
};
