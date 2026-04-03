"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import { lookupAuthAccountAction, sendActivationEmail, signInAction, signUpAction } from "@/app/auth/actions";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { IconButton } from "@orgframe/ui/primitives/icon-button";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { SpinnerIcon } from "@orgframe/ui/primitives/spinner-icon";
import { SurfaceBody, SurfaceHeader } from "@orgframe/ui/primitives/surface";

export type AuthMode = "signin" | "signup";

type AuthDialogProps = {
  open: boolean;
  onClose: () => void;
  presentation?: "popup" | "inline";
  initialMode?: AuthMode;
  errorMessage?: string | null;
  infoMessage?: string | null;
  nextPath?: string;
};

type FlowStep = "email" | "existing-password" | "new-account" | "activation";
type FlowDirection = "forward" | "back";

type AccountPreview = {
  exists: boolean;
  requiresActivation: boolean;
  displayName: string | null;
  avatarUrl: string | null;
};

function normalizeEmail(value: string) {
  return value.trim().toLowerCase();
}

function getInitials(name: string | null, email: string) {
  if (name && name.trim().length > 0) {
    const parts = name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2);
    const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
    if (initials.length > 0) {
      return initials;
    }
  }

  return email.slice(0, 2).toUpperCase();
}

export function AuthDialog({
  open,
  onClose,
  presentation = "popup",
  initialMode: _initialMode = "signin",
  errorMessage = null,
  infoMessage = null,
  nextPath = "/"
}: AuthDialogProps) {
  const emailId = useId();
  const existingPasswordId = useId();
  const newPasswordId = useId();

  const [step, setStep] = useState<FlowStep>("email");
  const [stepDirection, setStepDirection] = useState<FlowDirection>("forward");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountPreview | null>(null);

  const [isCheckingEmail, startCheckingEmail] = useTransition();
  const [isSendingActivationEmail, startSendingActivationEmail] = useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    setStep("email");
    setStepDirection("forward");
    setEmail("");
    setMessage(null);
    setAccount(null);
  }, [open]);

  const appBrandingVars = {
    "--accent": "var(--app-accent)",
    "--accent-foreground": "var(--app-accent-foreground)",
    "--ring": "var(--app-ring)"
  } as CSSProperties;

  const normalizedEmail = useMemo(() => normalizeEmail(email), [email]);
  const avatarInitials = useMemo(() => getInitials(account?.displayName ?? null, normalizedEmail), [account?.displayName, normalizedEmail]);

  function handleEmailStepSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setMessage("Enter a valid email address.");
      return;
    }

    setMessage(null);

    const formData = new FormData();
    formData.set("email", normalizedEmail);

    startCheckingEmail(async () => {
      const result = await lookupAuthAccountAction(formData);

      if (!result.ok) {
        setMessage("Unable to check that email right now.");
        return;
      }

      const nextAccount: AccountPreview = {
        exists: result.exists,
        requiresActivation: result.requiresActivation,
        displayName: result.displayName,
        avatarUrl: result.avatarUrl
      };
      setAccount(nextAccount);

      if (nextAccount.exists && nextAccount.requiresActivation) {
        setStepDirection("forward");
        setStep("activation");
        return;
      }

      setStepDirection("forward");
      setStep(nextAccount.exists ? "existing-password" : "new-account");
    });
  }

  function handleSendActivationEmail() {
    if (!normalizedEmail) {
      setMessage("Enter a valid email address.");
      return;
    }

    startSendingActivationEmail(async () => {
      const result = await sendActivationEmail({ email: normalizedEmail });
      setMessage(result.message);
    });
  }

  const content = (
    <div className="space-y-4">
      {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
      {infoMessage ? <Alert variant="info">{infoMessage}</Alert> : null}

      {step === "email" ? (
        <form className="space-y-3" onSubmit={handleEmailStepSubmit}>
          <FormField htmlFor={emailId} label="Email">
            <div className="flex items-center gap-2">
              <Input
                autoComplete="email"
                className="flex-1"
                id={emailId}
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@you.com"
                required
                type="email"
                value={email}
              />
              <IconButton
                className="h-10 w-10 rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
                disabled={isCheckingEmail}
                icon={isCheckingEmail ? <SpinnerIcon className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                label={isCheckingEmail ? "Checking email" : "Continue"}
                type="submit"
              />
            </div>
          </FormField>
          {message ? <Alert variant="warning">{message}</Alert> : null}
        </form>
      ) : null}

      {step === "existing-password" || step === "new-account" ? (
        <div className="space-y-3">
          <div className="rounded-card border border-border/70 bg-gradient-to-br from-muted/70 to-surface p-4">
            <div className="flex items-center gap-3">
              {account?.avatarUrl ? (
                <img alt="Profile" className="h-12 w-12 rounded-full border object-cover shadow-sm" src={account.avatarUrl} />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-full border bg-muted text-sm font-semibold text-text-muted">{avatarInitials}</div>
              )}
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-text">{account?.displayName ?? (step === "existing-password" ? "Welcome back" : "Create your account")}</p>
                <p className="truncate text-xs text-text-muted">{normalizedEmail}</p>
              </div>
            </div>
          </div>

          {step === "existing-password" ? (
            <form action={signInAction} className="space-y-3">
              <input name="next" type="hidden" value={nextPath} />
              <input name="email" type="hidden" value={normalizedEmail} />
              <FormField htmlFor={existingPasswordId} label="Password">
                <div className="flex items-center gap-2">
                  <Input autoComplete="current-password" className="flex-1" id={existingPasswordId} name="password" required type="password" />
                  <IconButton
                    className="h-10 w-10 rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
                    icon={<ChevronRight className="h-4 w-4" />}
                    label="Sign in"
                    type="submit"
                  />
                </div>
              </FormField>
              <p className="text-right text-xs">
                <Link className="text-accent underline-offset-2 hover:underline" href="/auth/reset" onClick={onClose}>
                  Forgot password?
                </Link>
              </p>
              <div className="flex">
                <Button
                  onClick={() => {
                    setStepDirection("back");
                    setStep("email");
                  }}
                  type="button"
                  variant="ghost"
                >
                  Change email
                </Button>
              </div>
            </form>
          ) : (
            <form action={signUpAction} className="space-y-3">
              <input name="next" type="hidden" value={nextPath} />
              <input name="email" type="hidden" value={normalizedEmail} />
              <FormField hint="Minimum 8 characters" htmlFor={newPasswordId} label="Create a password">
                <div className="flex items-center gap-2">
                  <Input autoComplete="new-password" className="flex-1" id={newPasswordId} name="password" required type="password" />
                  <IconButton
                    className="h-10 w-10 rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
                    icon={<ChevronRight className="h-4 w-4" />}
                    label="Create account"
                    type="submit"
                  />
                </div>
              </FormField>
              <div className="flex">
                <Button
                  onClick={() => {
                    setStepDirection("back");
                    setStep("email");
                  }}
                  type="button"
                  variant="ghost"
                >
                  Use a different email
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {step === "activation" ? (
        <div className="space-y-3">
          <div className="rounded-card border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-medium text-text">Email verification required</p>
            <p className="mt-1 text-xs text-text-muted">This account needs activation before password sign in is enabled.</p>
          </div>
          <p className="text-xs text-text-muted">{normalizedEmail}</p>
          {message ? <Alert variant="info">{message}</Alert> : null}
          <div className="flex flex-wrap gap-2">
            <Button disabled={isSendingActivationEmail} onClick={handleSendActivationEmail} type="button" variant="secondary">
              {isSendingActivationEmail ? "Sending..." : "Send activation email"}
            </Button>
            <Button
              onClick={() => {
                setStepDirection("back");
                setStep("email");
              }}
              type="button"
              variant="ghost"
            >
              Use different email
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );

  if (presentation === "inline") {
    return (
      <section className="mx-auto flex w-full max-w-md flex-col overflow-hidden rounded-card border bg-surface shadow-floating" style={appBrandingVars}>
        <SurfaceHeader subtitle="Continue with your email to sign in or create your account." title="Login" />
        <SurfaceBody>{content}</SurfaceBody>
      </section>
    );
  }

  return (
    <Popup
      onClose={onClose}
      open={open}
      popupStyle={appBrandingVars}
      size="sm"
      subtitle="Continue with your email to sign in or create your account."
      title="Login"
      viewKey={step}
      viewDirection={stepDirection}
    >
      {content}
    </Popup>
  );
}
