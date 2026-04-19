"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, Circle, ExternalLink } from "lucide-react";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button, buttonVariants } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { SubmitButton } from "@orgframe/ui/primitives/submit-button";
import { useToast } from "@orgframe/ui/primitives/toast";

type DomainRecord = {
  domain: string;
  status: "pending" | "verified" | "failed";
  verification_token: string;
  verified_at: string | null;
  last_error: string | null;
};

type GoDaddyQuickConnect = {
  available: boolean;
  reason: string | null;
  applyUrl: string | null;
  providerLabel: string;
};

type RequiredDnsRecord = {
  type: string;
  host: string;
  value: string;
  note: string | null;
};

type RegistrarOption = {
  key: string;
  label: string;
  description: string;
  quickConnectUrl: (domain: string) => string;
};

const registrarOptions: RegistrarOption[] = [
  {
    key: "godaddy",
    label: "GoDaddy",
    description: "Open your domain DNS page directly in GoDaddy.",
    quickConnectUrl: (domain) => `https://dcc.godaddy.com/manage/${encodeURIComponent(domain)}/dns`
  },
  {
    key: "namecheap",
    label: "Namecheap",
    description: "Jump to Advanced DNS for this domain.",
    quickConnectUrl: (domain) =>
      `https://ap.www.namecheap.com/domains/domaincontrolpanel/${encodeURIComponent(domain)}/advancedns`
  },
  {
    key: "cloudflare",
    label: "Cloudflare",
    description: "Open Cloudflare and choose this zone's DNS tab.",
    quickConnectUrl: () => "https://dash.cloudflare.com/"
  },
  {
    key: "squarespace",
    label: "Squarespace Domains",
    description: "Open Squarespace Domains DNS settings.",
    quickConnectUrl: () => "https://account.squarespace.com/domains"
  }
];

function buildWizardHref(orgSlug: string, step: number, method?: string) {
  const params = new URLSearchParams({
    setup: "1",
    step: String(step)
  });

  if (method) {
    params.set("method", method);
  }

  return `/tools/domains?${params.toString()}`;
}

function StepBadge({ active, done, label, number }: { active: boolean; done: boolean; label: string; number: number }) {
  return (
    <div className="flex items-center gap-2">
      {done ? (
        <CheckCircle2 className="h-4 w-4 text-accent" />
      ) : active ? (
        <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-accent text-[10px] font-semibold text-accent">{number}</span>
      ) : (
        <Circle className="h-4 w-4 text-text-muted" />
      )}
      <span className={active ? "text-sm font-semibold text-text" : "text-sm text-text-muted"}>{label}</span>
    </div>
  );
}

export function DomainSetupModal({
  canManage,
  customDomain,
  initialMethod,
  initialOpen,
  initialStep,
  quickConnect,
  requiredDnsRecords,
  orgSlug,
  platformHost,
  saveAction,
  verifyAction
}: {
  orgSlug: string;
  canManage: boolean;
  platformHost: string;
  customDomain: DomainRecord | null;
  initialOpen: boolean;
  initialStep: number;
  initialMethod: string | null;
  quickConnect: GoDaddyQuickConnect;
  requiredDnsRecords: RequiredDnsRecord[];
  saveAction: (formData: FormData) => void;
  verifyAction: (formData: FormData) => void;
}) {
  const router = useRouter();
  const { toast } = useToast();

  const selectedMethod = initialMethod ?? "manual";
  const selectedRegistrar = registrarOptions.find((option) => option.key === selectedMethod) ?? null;
  const verificationHost = customDomain ? `_orgframe-verification.${customDomain.domain}` : "";

  async function copyValue(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      toast({ title: `${label} copied`, variant: "success" });
    } catch {
      toast({
        title: "Unable to copy",
        description: "Copy the value manually.",
        variant: "destructive"
      });
    }
  }

  return (
    <Popup
      onClose={() => router.push(`/tools/domains`)}
      open={initialOpen}
      size="lg"
      subtitle="Follow three simple steps. Use registrar quick connect first, manual DNS only if you need it."
      title="Connect your custom domain"
    >
      <div className="space-y-5">
        <div className="grid gap-2 rounded-card border bg-surface-muted p-3 md:grid-cols-3">
          <StepBadge active={initialStep === 1} done={initialStep > 1} label="Enter domain" number={1} />
          <StepBadge active={initialStep === 2} done={initialStep > 2} label="Pick registrar" number={2} />
          <StepBadge active={initialStep === 3} done={false} label="Finish and verify" number={3} />
        </div>

        {initialStep === 1 ? (
          <form action={saveAction} className="space-y-4">
            <input name="setup" type="hidden" value="1" />
            <input name="next_step" type="hidden" value="2" />
            <FormField hint="Use the domain people will visit, like www.example.com" htmlFor="domain-setup-input" label="Your custom domain">
              <Input defaultValue={customDomain?.domain ?? ""} id="domain-setup-input" name="domain" placeholder="www.example.com" required />
            </FormField>

            {!canManage ? <Alert variant="warning">You have read-only access to this setting.</Alert> : null}

            <div className="flex items-center justify-end gap-2">
              <Button href={`/tools/domains`} variant="ghost">
                Cancel
              </Button>
              <SubmitButton disabled={!canManage}>
                Save and continue
              </SubmitButton>
            </div>
          </form>
        ) : null}

        {initialStep === 2 ? (
          <div className="space-y-4">
            {!customDomain ? (
              <Alert variant="warning">Add your domain in Step 1 first.</Alert>
            ) : (
              <>
                <div className="rounded-card border bg-surface p-3">
                  <p className="text-sm font-semibold text-text">Quick connect (GoDaddy)</p>
                  <p className="mt-1 text-xs text-text-muted">One consent screen in GoDaddy can apply the DNS records automatically.</p>
                  {quickConnect.available && quickConnect.applyUrl ? (
                    <div className="mt-3 flex gap-2">
                      <Button href={buildWizardHref(orgSlug, 3, "godaddy")} size="sm" variant="secondary">
                        I used quick connect
                      </Button>
                      <a className={buttonVariants({ size: "sm", variant: "ghost" })} href={quickConnect.applyUrl} rel="noreferrer" target="_blank">
                        Connect in {quickConnect.providerLabel}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-2">
                      <p className="text-xs text-text-muted">{quickConnect.reason ?? "Quick connect is unavailable for this domain."}</p>
                      <Button href={`/tools/domains/diagnostics`} size="sm" variant="ghost">
                        Why it is unavailable
                      </Button>
                    </div>
                  )}
                </div>

                <p className="text-sm text-text-muted">Choose where your domain is registered. We will send you to their quick setup flow.</p>
                <div className="grid gap-3 md:grid-cols-2">
                  {registrarOptions.map((option) => (
                    <div className="rounded-card border bg-surface p-3" key={option.key}>
                      <p className="text-sm font-semibold text-text">{option.label}</p>
                      <p className="mt-1 text-xs text-text-muted">{option.description}</p>
                      <div className="mt-3 flex gap-2">
                        <Button href={buildWizardHref(orgSlug, 3, option.key)} size="sm" variant="secondary">
                          Use this registrar
                        </Button>
                        <a
                          className={buttonVariants({ size: "sm", variant: "ghost" })}
                          href={option.quickConnectUrl(customDomain.domain)}
                          rel="noreferrer"
                          target="_blank"
                        >
                          Open
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="rounded-card border bg-surface p-3">
                  <p className="text-sm font-semibold text-text">I want manual DNS setup</p>
                  <p className="mt-1 text-xs text-text-muted">Use this if your registrar is not listed or you prefer to paste records yourself.</p>
                  <div className="mt-3">
                    <Button href={buildWizardHref(orgSlug, 3, "manual")} size="sm" variant="secondary">
                      Continue with manual setup
                    </Button>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button href={buildWizardHref(orgSlug, 1)} variant="ghost">
                Back
              </Button>
              <Button href={`/tools/domains`} variant="ghost">
                Close
              </Button>
            </div>
          </div>
        ) : null}

        {initialStep === 3 ? (
          <div className="space-y-4">
            {!customDomain ? (
              <Alert variant="warning">Add your domain in Step 1 first.</Alert>
            ) : (
              <>
                <div className="rounded-card border bg-surface-muted p-3">
                  <p className="text-sm font-semibold text-text">Domain</p>
                  <p className="text-sm text-text-muted">{customDomain.domain}</p>
                </div>

                {selectedRegistrar ? (
                  <div className="rounded-card border bg-surface p-3">
                    <p className="text-sm font-semibold text-text">Quick connect with {selectedRegistrar.label}</p>
                    <p className="mt-1 text-xs text-text-muted">Open your registrar, add the verification TXT record, then point your domain CNAME to our host.</p>
                    <div className="mt-3">
                      <a
                        className={buttonVariants({ size: "sm", variant: "secondary" })}
                        href={selectedRegistrar.quickConnectUrl(customDomain.domain)}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open {selectedRegistrar.label}
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>
                ) : null}

                <div className="rounded-card border bg-surface p-3">
                  <p className="text-sm font-semibold text-text">DNS records to add</p>
                  <p className="mt-1 text-xs text-text-muted">Add every record below exactly as shown at your DNS provider.</p>
                  <div className="mt-3 space-y-3">
                    {requiredDnsRecords.map((record, index) => (
                      <div className="space-y-2 rounded-control border bg-surface-muted p-3" key={`${record.type}-${record.host}-${index}`}>
                        <p className="text-xs font-semibold text-text">{record.type}</p>
                        <FormField label="Host / Name">
                          <div className="flex items-center gap-2">
                            <Input readOnly value={record.host} />
                            <Button onClick={() => copyValue(record.host, `${record.type} host`)} size="sm" type="button" variant="secondary">
                              Copy
                            </Button>
                          </div>
                        </FormField>
                        <FormField label="Value / Points to">
                          <div className="flex items-center gap-2">
                            <Input readOnly value={record.value} />
                            <Button onClick={() => copyValue(record.value, `${record.type} value`)} size="sm" type="button" variant="secondary">
                              Copy
                            </Button>
                          </div>
                        </FormField>
                        {record.note ? <p className="text-xs text-text-muted">{record.note}</p> : null}
                      </div>
                    ))}
                    {requiredDnsRecords.length === 0 ? <Alert variant="warning">No DNS records were generated yet. Save the domain first.</Alert> : null}
                  </div>
                </div>

                {customDomain.last_error ? <Alert variant="warning">Latest check: {customDomain.last_error}</Alert> : null}
              </>
            )}

            <div className="flex items-center justify-between gap-2">
              <Button href={buildWizardHref(orgSlug, 2)} variant="ghost">
                Back
              </Button>

              <div className="flex items-center gap-2">
                <Button href={`/tools/domains`} variant="ghost">
                  Close
                </Button>
                {canManage && customDomain ? (
                  <form action={verifyAction}>
                    <input name="setup" type="hidden" value="1" />
                    <input name="step" type="hidden" value="3" />
                    <input name="method" type="hidden" value={selectedMethod} />
                    <SubmitButton size="sm" variant="secondary">
                      Verify domain
                    </SubmitButton>
                  </form>
                ) : null}
              </div>
            </div>

            <p className="text-xs text-text-muted">
              Need help? Search your registrar for <span className="font-semibold">DNS</span> or <span className="font-semibold">Connect existing domain</span>, then
              follow the values above.
            </p>
            <Alert variant="info">
              If you see <span className="font-semibold">DEPLOYMENT_NOT_FOUND</span>, add this exact domain in Vercel
              <span className="font-semibold"> Project Settings {"->"} Domains</span>, wait a minute, then click Verify again.
            </Alert>
          </div>
        ) : null}

        <p className="text-[11px] text-text-muted">
          By connecting a domain, you confirm you control this DNS zone.
          <Link className="ml-1 underline" href="https://www.icann.org/resources/pages/dnssec-what-is-it-why-important-2019-03-05-en" rel="noreferrer" target="_blank">
            Learn more
          </Link>
          .
        </p>
      </div>
    </Popup>
  );
}
