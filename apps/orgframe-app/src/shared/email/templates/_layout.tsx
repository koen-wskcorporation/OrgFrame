import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Img,
  Link,
  Preview,
  Section,
  Text
} from "@react-email/components";
import type { CSSProperties, ReactNode } from "react";

// Absolute URL to the OrgFrame wordmark+mark lockup. Email clients can't
// resolve relative URLs, so we serve the SVG from /public/brand/logo.svg.
// Hostname comes from the same NEXT_PUBLIC_PLATFORM_HOST as the rest of
// the stack.
const PLATFORM_HOST = (process.env.NEXT_PUBLIC_PLATFORM_HOST?.trim() || "orgframe.app").replace(/^https?:\/\//, "").replace(/\/.*$/, "");
const PLATFORM_PROTOCOL = PLATFORM_HOST.endsWith(".test") || PLATFORM_HOST.endsWith(".local") || PLATFORM_HOST === "localhost" ? "http" : "https";
const LOGO_URL = `${PLATFORM_PROTOCOL}://${PLATFORM_HOST}/brand/logo.svg`;

// Mirrors the app's design tokens from apps/orgframe-app/app/globals.css and
// packages/theme/src/tailwind-preset.js. Email clients don't support CSS
// variables, so we resolve the HSL tokens to hex values once here. Keep this
// file in lockstep with globals.css.
const tokens = {
  canvas: "#f7fafb", // hsl(200 33% 98%)
  surface: "#ffffff",
  surfaceMuted: "#ecf1f3", // hsl(200 26% 95%)
  border: "#cdd6da", // hsl(202 18% 84%)
  text: "#1f2632", // hsl(220 24% 16%)
  textMuted: "#626a78", // hsl(220 11% 43%)
  accent: "#00e5ff", // hsl(185 100% 50%)
  accentForeground: "#11192a", // hsl(220 35% 10%)
  success: "#277a4a", // hsl(145 58% 36%)
  destructive: "#dc2828", // hsl(0 72% 50%)
  // radii mirror --radius (24) and rounded-control (20)
  radiusCard: "24px",
  radiusControl: "20px",
  radiusPill: "9999px",
  // font stack matches body { font-family } in globals.css
  fontFamily: "\"Avenir Next\", \"Segoe UI\", -apple-system, BlinkMacSystemFont, Helvetica, Arial, sans-serif"
};

type EmailLayoutProps = {
  preview: string;
  children: ReactNode;
  /** Optional small note rendered above the standard footer line. */
  footerNote?: string;
};

const styles = {
  body: {
    backgroundColor: tokens.canvas,
    margin: 0,
    padding: "40px 16px",
    fontFamily: tokens.fontFamily,
    color: tokens.text,
    WebkitFontSmoothing: "antialiased",
    MozOsxFontSmoothing: "grayscale"
  } as CSSProperties,
  container: {
    backgroundColor: tokens.surface,
    borderRadius: tokens.radiusCard,
    border: `1px solid ${tokens.border}`,
    maxWidth: "560px",
    margin: "0 auto",
    padding: "0",
    overflow: "hidden",
    // Soft drop shadow approximating var(--shadow) in light mode.
    boxShadow: "0 10px 28px rgba(40, 52, 80, 0.08)"
  } as CSSProperties,
  header: {
    backgroundColor: tokens.canvas,
    padding: "28px 36px 20px",
    borderBottom: `1px solid ${tokens.border}`
  } as CSSProperties,
  logo: {
    display: "block",
    height: "22px",
    width: "auto",
    // Source SVG aspect ratio is ~5.69:1, so 22px tall ≈ 125px wide.
    maxWidth: "140px",
    margin: 0
  } as CSSProperties,
  content: {
    padding: "32px 36px 12px"
  } as CSSProperties,
  divider: {
    border: "none",
    borderTop: `1px solid ${tokens.border}`,
    margin: "28px 0 20px"
  } as CSSProperties,
  footer: {
    padding: "0 36px 32px"
  } as CSSProperties,
  footerText: {
    color: tokens.textMuted,
    fontSize: "12px",
    lineHeight: "18px",
    margin: 0
  } as CSSProperties,
  footerLink: {
    color: tokens.textMuted,
    textDecoration: "underline"
  } as CSSProperties
};

export function EmailLayout({ preview, children, footerNote }: EmailLayoutProps) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={styles.body}>
        <Container style={styles.container}>
          <Section style={styles.header}>
            <Img alt="OrgFrame" height="22" src={LOGO_URL} style={styles.logo} />
          </Section>
          <Section style={styles.content}>{children}</Section>
          <Hr style={styles.divider} />
          <Section style={styles.footer}>
            {footerNote ? (
              <Text style={{ ...styles.footerText, marginBottom: "8px" }}>{footerNote}</Text>
            ) : null}
            <Text style={styles.footerText}>
              OrgFrame &middot;{" "}
              <Link href="https://orgframe.app" style={styles.footerLink}>
                orgframe.app
              </Link>
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  );
}

// Reusable inline styles for body content within emails. Imported by every
// template so the visual language stays in lockstep with the app shell.
export const emailStyles = {
  heading: {
    color: tokens.text,
    fontSize: "24px",
    fontWeight: 600,
    lineHeight: "32px",
    letterSpacing: "-0.01em",
    margin: "0 0 12px"
  } as CSSProperties,
  paragraph: {
    color: tokens.text,
    fontSize: "15px",
    lineHeight: "24px",
    margin: "0 0 16px"
  } as CSSProperties,
  muted: {
    color: tokens.textMuted,
    fontSize: "13px",
    lineHeight: "20px",
    margin: "0 0 16px"
  } as CSSProperties,
  button: {
    backgroundColor: tokens.accent,
    color: tokens.accentForeground,
    padding: "12px 24px",
    borderRadius: tokens.radiusPill,
    textDecoration: "none",
    fontWeight: 600,
    fontSize: "15px",
    display: "inline-block",
    border: "none"
  } as CSSProperties,
  buttonRow: {
    margin: "20px 0 24px"
  } as CSSProperties,
  // Surface card mirroring the app's `rounded-card border bg-surface-muted` pattern,
  // used for OTP code panels and "fallback link" blocks.
  panel: {
    backgroundColor: tokens.surfaceMuted,
    border: `1px solid ${tokens.border}`,
    borderRadius: tokens.radiusControl,
    padding: "16px 18px",
    margin: "0 0 20px"
  } as CSSProperties,
  panelLabel: {
    color: tokens.textMuted,
    fontSize: "11px",
    fontWeight: 600,
    letterSpacing: "0.08em",
    textTransform: "uppercase",
    margin: "0 0 8px"
  } as CSSProperties,
  code: {
    color: tokens.text,
    fontFamily: "Menlo, Monaco, \"SF Mono\", Consolas, monospace",
    fontSize: "20px",
    fontWeight: 600,
    letterSpacing: "4px",
    margin: 0
  } as CSSProperties,
  fallbackLink: {
    color: tokens.text,
    fontSize: "13px",
    lineHeight: "20px",
    wordBreak: "break-all" as const,
    margin: 0
  } as CSSProperties,
  link: { color: tokens.accentForeground, textDecoration: "underline", wordBreak: "break-all" as const } as CSSProperties
};

export const emailTokens = tokens;
