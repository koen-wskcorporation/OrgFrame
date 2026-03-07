import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { AppPage, CardGrid, PageStack } from "@/components/ui/layout";
import { getSessionUser } from "@/lib/auth/getSessionUser";
import { getWebsiteProducts } from "@/lib/website/products";

export const metadata: Metadata = {
  title: "Sports SaaS"
};

const valuePoints = [
  {
    title: "Website + Operations in One Place",
    description: "Publish public pages and run internal workflows from the same system with shared org data."
  },
  {
    title: "Built for Sports Organizations",
    description: "Programs, registrations, facilities, events, and communications are organized for real sports operations."
  },
  {
    title: "Fast Team Adoption",
    description: "Simple account onboarding, role-based access, and clear tool boundaries for directors and staff."
  }
];

export default async function WebsitePage() {
  const products = getWebsiteProducts();
  const sessionUser = await getSessionUser();
  const primaryHref = sessionUser ? "/" : "/auth/login?mode=signup";
  const primaryLabel = sessionUser ? "Open dashboard" : "Create account";

  return (
    <AppPage className="py-8 md:py-10">
      <PageStack>
        <section
          className="rounded-card border px-5 py-8 shadow-card md:px-8 md:py-10"
          style={{
            background:
              "radial-gradient(circle at top left, hsl(var(--accent) / 0.12), transparent 45%), linear-gradient(140deg, hsl(var(--surface)), hsl(var(--surface-muted) / 0.7))"
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-text-muted">Sports SaaS</p>
          <h1 className="mt-2 max-w-3xl text-balance text-3xl font-semibold tracking-tight text-text md:text-5xl">The website and operations app for modern sports organizations.</h1>
          <p className="mt-4 max-w-2xl text-sm leading-relaxed text-text-muted md:text-base">
            Launch a public-facing site, manage day-to-day operations, and keep teams aligned across programs, registrations, and facilities.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button href={primaryHref}>{primaryLabel}</Button>
            {!sessionUser ? (
              <Button href="/auth/login" variant="secondary">
                Sign in
              </Button>
            ) : null}
          </div>
        </section>

        <CardGrid>
          {valuePoints.map((point) => (
            <Card key={point.title}>
              <CardHeader>
                <CardTitle>{point.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{point.description}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </CardGrid>

        <div>
          <h2>Platform Modules</h2>
          <p className="mt-2 text-sm text-text-muted">Each module is available in the same organization workspace with shared access and publishing controls.</p>
        </div>

        <CardGrid className="xl:grid-cols-3">
          {products.map((product) => (
            <Card key={product.slug}>
              <CardHeader>
                <CardTitle>{product.name}</CardTitle>
                <CardDescription>{product.summary}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-sm font-semibold text-text">{product.priceLabel}</p>
                  <p className="text-xs text-text-muted">{product.billingInterval}</p>
                </div>
                <ul className="space-y-1 text-sm text-text-muted">
                  {product.highlights.map((highlight) => (
                    <li key={highlight}>• {highlight}</li>
                  ))}
                </ul>
                <Button href={primaryHref} variant="secondary">
                  {sessionUser ? "Open app" : "Start with this module"}
                </Button>
              </CardContent>
            </Card>
          ))}
        </CardGrid>
      </PageStack>
    </AppPage>
  );
}
