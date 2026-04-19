import type { Metadata } from "next";
import { Section } from "@/components/marketing/Section";
import { Prose } from "@/components/marketing/Prose";

export const metadata: Metadata = {
  title: "Terms — OrgFrame",
  description: "The terms that govern your use of OrgFrame."
};

export default function TermsPage() {
  return (
    <>
      <section className="border-b border-[hsl(var(--rule))]">
        <div className="container-editorial py-20 md:py-24">
          <span className="eyebrow eyebrow-accent">Legal</span>
          <h1 className="headline mt-4">Terms of Service</h1>
          <p className="mt-4 text-sm text-[hsl(var(--muted-ink))]">Last updated: April 18, 2026</p>
        </div>
      </section>

      <Section tone="paper" size="md">
        <Prose>
          <p>
            This page is a placeholder while we prepare the formal terms for general availability. OrgFrame is currently operated under
            direct agreements with our private beta partners; those agreements govern the relationship until these terms replace them.
          </p>

          <h2>Use of the service</h2>
          <p>
            You may use OrgFrame to operate your sports organization. You may not use it to violate applicable law, infringe on the rights
            of others, or circumvent the controls that protect other organizations on the platform.
          </p>

          <h2>Your data</h2>
          <p>
            Your organization owns the data you upload to OrgFrame. We operate it on your behalf under the Privacy Policy and the Data
            Processing Agreement provided to beta partners.
          </p>

          <h2>Availability</h2>
          <p>
            We work to keep OrgFrame available and performant. When incidents happen, we communicate openly and credit accordingly where
            service-level commitments apply.
          </p>

          <h2>Changes</h2>
          <p>
            We may update these terms. Material changes will be communicated in advance via email to account administrators.
          </p>

          <h2>Contact</h2>
          <p>
            Questions? <a href="mailto:legal@orgframe.com">legal@orgframe.com</a>.
          </p>
        </Prose>
      </Section>
    </>
  );
}
