import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { Prose } from "@/components/marketing/Prose";

export const metadata: Metadata = {
  title: "Privacy — OrgFrame",
  description: "How OrgFrame collects, uses, and protects the information your organization trusts us with."
};

export default function PrivacyPage() {
  return (
    <>
      <section className="border-b border-[hsl(var(--rule))]">
        <div className="container-editorial py-20 md:py-24">
          <span className="eyebrow eyebrow-accent">Legal</span>
          <h1 className="headline mt-4">Privacy Policy</h1>
          <p className="mt-4 text-sm text-[hsl(var(--muted-ink))]">Last updated: April 18, 2026</p>
        </div>
      </section>

      <Section tone="paper" size="md">
        <Prose>
          <p>
            This page is a placeholder while we prepare our final privacy policy. The short version: we store the data your organization
            entrusts to OrgFrame to run your operations. We do not sell it. We do not train models on it. We do not share it with
            third parties except the subprocessors required to run the service (payments, email delivery, infrastructure).
          </p>

          <h2>Information we collect</h2>
          <p>
            When you use OrgFrame, we collect the information you provide (registrations, rosters, payment details), information required to
            operate the service (authentication, audit logs), and basic device information (browser, IP address).
          </p>

          <h2>How we use it</h2>
          <p>
            To run your organization's workspace, to provide support, to improve the product, and to comply with legal obligations. That is
            the entire list.
          </p>

          <h2>Who we share it with</h2>
          <p>
            Subprocessors required to deliver the service (Supabase, Stripe, our email provider) under data processing agreements. We do
            not sell data. We do not share data with advertisers.
          </p>

          <h2>Your rights</h2>
          <p>
            You can request access, correction, or deletion of your personal data at any time by emailing{" "}
            <a href="mailto:privacy@orgframe.com">privacy@orgframe.com</a>.
          </p>

          <h2>Contact</h2>
          <p>
            Questions about this policy? <a href="mailto:privacy@orgframe.com">privacy@orgframe.com</a>.
          </p>
        </Prose>
      </Section>
    </>
  );
}
