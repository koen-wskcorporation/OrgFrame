"use client";

import Link from "next/link";
import { useEffect, useId, useMemo, useState, useTransition, type CSSProperties } from "react";
import { ChevronRight, X } from "lucide-react";
import { lookupAuthAccountAction, sendActivationEmail, signInAction, signUpAction } from "@/app/auth/actions";
import { Alert } from "@orgframe/ui/primitives/alert";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { SubmitIconButton } from "@orgframe/ui/primitives/submit-icon-button";
import { Input } from "@orgframe/ui/primitives/input";
import { Popup } from "@orgframe/ui/primitives/popup";
import { SpinnerIcon } from "@orgframe/ui/primitives/spinner-icon";

export type AuthMode = "signin" | "signup";

type AuthDialogProps = {
  open: boolean;
  onClose: () => void;
  presentation?: "popup" | "inline";
  initialMode?: AuthMode;
  errorMessage?: string | null;
  infoMessage?: string | null;
  nextPath?: string;
  returnTo?: string | null;
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

const SAVED_ACCOUNTS_KEY = "orgframe:saved-accounts";
const SAVED_ACCOUNTS_MAX = 5;

type SavedAccount = {
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  lastUsedAt: number;
};

function readSavedAccounts(): SavedAccount[] {
  if (typeof window === "undefined") {
    return [];
  }
  try {
    const raw = window.localStorage.getItem(SAVED_ACCOUNTS_KEY);
    if (!raw) {
      return [];
    }
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .filter((entry): entry is SavedAccount => {
        return (
          typeof entry === "object" &&
          entry !== null &&
          typeof (entry as SavedAccount).email === "string" &&
          typeof (entry as SavedAccount).lastUsedAt === "number"
        );
      })
      .sort((a, b) => b.lastUsedAt - a.lastUsedAt);
  } catch {
    return [];
  }
}

function writeSavedAccounts(accounts: SavedAccount[]) {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(accounts.slice(0, SAVED_ACCOUNTS_MAX)));
  } catch {
    // Ignore storage errors (private mode, quota, etc.).
  }
}

function upsertSavedAccount(next: Omit<SavedAccount, "lastUsedAt">): SavedAccount[] {
  const current = readSavedAccounts().filter((entry) => entry.email !== next.email);
  const merged: SavedAccount[] = [{ ...next, lastUsedAt: Date.now() }, ...current].slice(0, SAVED_ACCOUNTS_MAX);
  writeSavedAccounts(merged);
  return merged;
}

function removeSavedAccount(email: string): SavedAccount[] {
  const next = readSavedAccounts().filter((entry) => entry.email !== email);
  writeSavedAccounts(next);
  return next;
}

function getAccountInitials(name: string | null, email: string) {
  if (name && name.trim().length > 0) {
    const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
    const initials = parts.map((part) => part[0]?.toUpperCase() ?? "").join("");
    if (initials.length > 0) {
      return initials;
    }
  }
  return email.slice(0, 2).toUpperCase();
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
  nextPath = "/",
  returnTo = null
}: AuthDialogProps) {
  const emailId = useId();
  const existingPasswordId = useId();
  const newPasswordId = useId();

  const [step, setStep] = useState<FlowStep>("email");
  const [stepDirection, setStepDirection] = useState<FlowDirection>("forward");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [account, setAccount] = useState<AccountPreview | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);

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
    setSavedAccounts(readSavedAccounts());
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

      if (nextAccount.exists && !nextAccount.requiresActivation) {
        setSavedAccounts(
          upsertSavedAccount({
            email: normalizedEmail,
            displayName: nextAccount.displayName,
            avatarUrl: nextAccount.avatarUrl
          })
        );
      }

      if (nextAccount.exists && nextAccount.requiresActivation) {
        setStepDirection("forward");
        setStep("activation");
        return;
      }

      setStepDirection("forward");
      setStep(nextAccount.exists ? "existing-password" : "new-account");
    });
  }

  function handleSelectSavedAccount(saved: SavedAccount) {
    setMessage(null);
    setEmail(saved.email);
    setAccount({
      exists: true,
      requiresActivation: false,
      displayName: saved.displayName,
      avatarUrl: saved.avatarUrl
    });
    setSavedAccounts(
      upsertSavedAccount({
        email: saved.email,
        displayName: saved.displayName,
        avatarUrl: saved.avatarUrl
      })
    );
    setStepDirection("forward");
    setStep("existing-password");
  }

  function handleRemoveSavedAccount(event: React.MouseEvent<HTMLButtonElement>, savedEmail: string) {
    event.stopPropagation();
    setSavedAccounts(removeSavedAccount(savedEmail));
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

      {step === "email" && savedAccounts.length > 0 ? (
        <div className="space-y-2">
          <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
            {savedAccounts.map((saved) => (
              <li className="group relative flex items-center" key={saved.email}>
                <button
                  className="flex w-full items-center gap-3 px-3 py-2 pr-10 text-left hover:bg-surface-muted focus:bg-surface-muted focus:outline-none"
                  onClick={() => handleSelectSavedAccount(saved)}
                  type="button"
                >
                  {saved.avatarUrl ? (
                    <img alt="" className="h-9 w-9 flex-none rounded-full object-cover" src={saved.avatarUrl} />
                  ) : (
                    <div className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-surface-muted text-xs font-semibold text-text">
                      {getAccountInitials(saved.displayName, saved.email)}
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    {saved.displayName ? (
                      <p className="truncate text-sm font-medium text-text">{saved.displayName}</p>
                    ) : null}
                    <p className="truncate text-xs text-text-muted">{saved.email}</p>
                  </div>
                </button>
                <button
                  aria-label={`Remove ${saved.email}`}
                  className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-text-muted opacity-0 transition hover:bg-surface hover:text-text focus:opacity-100 group-hover:opacity-100"
                  onClick={(event) => handleRemoveSavedAccount(event, saved.email)}
                  type="button"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
          <p className="text-center text-xs text-text-muted">or use a different email</p>
        </div>
      ) : null}

      {step === "email" ? (
        <form className="space-y-3" onSubmit={handleEmailStepSubmit}>
          <FormField htmlFor={emailId} label="Email">
            <div className="flex items-center gap-2">
              <Input
                autoComplete="username webauthn"
                className="flex-1"
                id={emailId}
                name="email"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="name@you.com"
                required
                type="email"
                value={email}
              />
              <Button
                iconOnly
                aria-label={isCheckingEmail ? "Checking email" : "Continue"}
                className="h-10 w-10 rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
                disabled={isCheckingEmail}
                type="submit"
              >
                {isCheckingEmail ? <SpinnerIcon className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
              </Button>
            </div>
          </FormField>
          {message ? <Alert variant="warning">{message}</Alert> : null}
        </form>
      ) : null}

      {step === "existing-password" || step === "new-account" ? (
        <div className="space-y-4">
          <div className="flex flex-col items-center gap-3 text-center">
            {account?.avatarUrl ? (
              <img alt="" className="h-16 w-16 rounded-full object-cover" src={account.avatarUrl} />
            ) : (
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted text-base font-semibold text-text">{avatarInitials}</div>
            )}
            <div className="min-w-0">
              <p className="truncate text-base font-semibold text-text">{account?.displayName ?? (step === "existing-password" ? "Welcome back" : "Create your account")}</p>
              <p className="truncate text-sm text-text-muted">{normalizedEmail}</p>
            </div>
          </div>

          {step === "existing-password" ? (
            <form action={signInAction} className="space-y-3">
              <input name="next" type="hidden" value={nextPath} />
              {returnTo ? <input name="return_to" type="hidden" value={returnTo} /> : null}
              <input
                aria-hidden="true"
                autoComplete="username"
                className="sr-only"
                name="email"
                onChange={() => {}}
                readOnly
                tabIndex={-1}
                type="email"
                value={normalizedEmail}
              />
              <FormField htmlFor={existingPasswordId} label="Password">
                <div className="flex items-center gap-2">
                  <Input autoComplete="current-password" autoFocus className="flex-1" id={existingPasswordId} name="password" required type="password" />
                  <SubmitIconButton
                    className="h-10 w-10 rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
                    icon={<ChevronRight className="h-4 w-4" />}
                    label="Sign in"
                  />
                </div>
              </FormField>
            </form>
          ) : (
            <form action={signUpAction} className="space-y-3">
              <input name="next" type="hidden" value={nextPath} />
              {returnTo ? <input name="return_to" type="hidden" value={returnTo} /> : null}
              <input
                aria-hidden="true"
                autoComplete="username"
                className="sr-only"
                name="email"
                onChange={() => {}}
                readOnly
                tabIndex={-1}
                type="email"
                value={normalizedEmail}
              />
              <FormField hint="Minimum 8 characters" htmlFor={newPasswordId} label="Create a password">
                <div className="flex items-center gap-2">
                  <Input autoComplete="new-password" autoFocus className="flex-1" id={newPasswordId} name="password" required type="password" />
                  <SubmitIconButton
                    className="h-10 w-10 rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
                    icon={<ChevronRight className="h-4 w-4" />}
                    label="Create account"
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
      <div className="w-full" style={appBrandingVars}>
        {content}
      </div>
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
