"use client";

import { useEffect, useId, useMemo, useState, useTransition, type CSSProperties } from "react";
import { ArrowLeft, Check, ChevronRight, Monitor, Moon, Search, Sun, X } from "lucide-react";
import {
  completeSignupOnboardingAction,
  listPublicOrgsAction,
  lookupAuthAccountAction,
  sendActivationEmail,
  sendPasswordResetEmailAction,
  signInAction,
  signUpAction,
  startGoogleOAuthAction
} from "@/app/auth/actions";
import { Button } from "@orgframe/ui/primitives/button";
import { FormField } from "@orgframe/ui/primitives/form-field";
import { Popup } from "@orgframe/ui/primitives/popup";
import { SpinnerIcon } from "@orgframe/ui/primitives/spinner-icon";
import { SubmitIconButton } from "@orgframe/ui/primitives/submit-icon-button";
import { toast } from "@orgframe/ui/primitives/toast";
import { useThemeMode, type ThemeMode } from "@orgframe/ui/primitives/theme-mode";

function notifyAuthError(description: string, title = "Authentication error") {
  toast({ variant: "destructive", title, description });
}

function notifyAuthInfo(title: string, description?: string) {
  toast({ variant: "info", title, description });
}

const authInputClass =
  "h-10 w-full rounded-control border border-border bg-surface px-3 py-2 text-sm text-text shadow-[inset_0_1px_0_hsl(var(--canvas)/0.35)] placeholder:text-text-muted focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

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

type FlowStep =
  | "email"
  | "existing-password"
  | "new-account"
  | "profile-name"
  | "theme"
  | "orgs"
  | "activation";
type FlowDirection = "forward" | "back";

type PublicOrg = {
  id: string;
  slug: string;
  name: string;
  logoUrl: string | null;
};

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

function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg aria-hidden="true" className={className} viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2582h2.9086c1.7018-1.5668 2.6836-3.874 2.6836-6.6151z" fill="#4285F4" />
      <path d="M9 18c2.43 0 4.4673-.806 5.9564-2.1805l-2.9086-2.2582c-.806.54-1.8368.8591-3.0477.8591-2.3441 0-4.3282-1.5832-5.0359-3.7104H.9574v2.3318C2.4382 15.9832 5.4818 18 9 18z" fill="#34A853" />
      <path d="M3.9641 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573A8.9965 8.9965 0 0 0 0 9c0 1.4523.3477 2.8268.9573 4.0418L3.964 10.71z" fill="#FBBC05" />
      <path d="M9 3.5795c1.3214 0 2.5077.4545 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.6559 3.5795 9 3.5795z" fill="#EA4335" />
    </svg>
  );
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
  const firstNameId = useId();
  const lastNameId = useId();
  const orgSearchId = useId();

  const themeContext = useThemeMode();

  const [step, setStep] = useState<FlowStep>("email");
  const [stepDirection, setStepDirection] = useState<FlowDirection>("forward");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<AccountPreview | null>(null);
  const [savedAccounts, setSavedAccounts] = useState<SavedAccount[]>([]);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [themeChoice, setThemeChoice] = useState<ThemeMode>("auto");
  const [orgs, setOrgs] = useState<PublicOrg[]>([]);
  const [orgsLoaded, setOrgsLoaded] = useState(false);
  const [orgQuery, setOrgQuery] = useState("");
  const [selectedOrgIds, setSelectedOrgIds] = useState<string[]>([]);

  const [isCheckingEmail, startCheckingEmail] = useTransition();
  const [isSendingActivationEmail, startSendingActivationEmail] = useTransition();
  const [isStartingGoogleOAuth, startGoogleOAuth] = useTransition();
  const [isSendingPasswordReset, startSendingPasswordReset] = useTransition();
  const [isCreatingAccount, startCreatingAccount] = useTransition();
  const [isFinishingOnboarding, startFinishingOnboarding] = useTransition();
  const [isLoadingOrgs, startLoadingOrgs] = useTransition();

  useEffect(() => {
    if (!open) {
      return;
    }

    setStep("email");
    setStepDirection("forward");
    setEmail("");
    setPassword("");
    setAccount(null);
    setFirstName("");
    setLastName("");
    setThemeChoice(themeContext.mode);
    setSelectedOrgIds([]);
    setOrgQuery("");

    const initial = readSavedAccounts();
    setSavedAccounts(initial);

    if (initial.length === 0) {
      return;
    }

    let cancelled = false;
    void Promise.all(
      initial.map(async (saved) => {
        const formData = new FormData();
        formData.set("email", saved.email);
        try {
          const result = await lookupAuthAccountAction(formData);
          if (!result.ok || !result.exists) {
            return saved;
          }
          return {
            ...saved,
            displayName: result.displayName ?? saved.displayName,
            avatarUrl: result.avatarUrl ?? null
          } satisfies SavedAccount;
        } catch {
          return saved;
        }
      })
    ).then((refreshed) => {
      if (cancelled) {
        return;
      }
      const merged = refreshed.map((entry) => ({ ...entry, lastUsedAt: entry.lastUsedAt }));
      writeSavedAccounts(merged);
      setSavedAccounts(merged);
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (errorMessage) {
      notifyAuthError(errorMessage);
    }
    if (infoMessage) {
      notifyAuthInfo(infoMessage);
    }
  }, [open, errorMessage, infoMessage]);

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
      notifyAuthError("Enter a valid email address.");
      return;
    }

    const formData = new FormData();
    formData.set("email", normalizedEmail);

    startCheckingEmail(async () => {
      const result = await lookupAuthAccountAction(formData);

      if (!result.ok) {
        notifyAuthError("Unable to check that email right now.");
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
      notifyAuthError("Enter a valid email address.");
      return;
    }

    startSendingActivationEmail(async () => {
      const result = await sendActivationEmail({ email: normalizedEmail });
      if (result.ok) {
        notifyAuthInfo(result.message);
      } else {
        notifyAuthError(result.message);
      }
    });
  }

  function handleCreateAccountSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8) {
      notifyAuthError("Password must be at least 8 characters.");
      return;
    }
    startCreatingAccount(async () => {
      const result = await signUpAction({ email: normalizedEmail, password, nextPath, returnTo });
      if (!result.ok) {
        notifyAuthError(result.error, "Couldn't create account");
        return;
      }
      if (result.needsEmailConfirmation) {
        setStepDirection("forward");
        setStep("activation");
        return;
      }
      setSavedAccounts(
        upsertSavedAccount({
          email: normalizedEmail,
          displayName: account?.displayName ?? null,
          avatarUrl: null
        })
      );
      setStepDirection("forward");
      setStep("profile-name");
    });
  }

  function handleProfileNameContinue(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStepDirection("forward");
    setStep("theme");
  }

  function handleThemeContinue() {
    themeContext.setMode(themeChoice);
    if (!orgsLoaded) {
      startLoadingOrgs(async () => {
        const result = await listPublicOrgsAction();
        if (result.ok) {
          setOrgs(result.orgs);
        } else {
          notifyAuthError(result.error, "Couldn't load organizations");
        }
        setOrgsLoaded(true);
      });
    }
    setStepDirection("forward");
    setStep("orgs");
  }

  function handleFinishOnboarding() {
    startFinishingOnboarding(async () => {
      const result = await completeSignupOnboardingAction({
        firstName,
        lastName,
        themeMode: themeChoice,
        orgIds: selectedOrgIds,
        nextPath,
        returnTo
      });
      if (!result.ok) {
        notifyAuthError(result.error, "Couldn't finish setup");
        return;
      }
      window.location.href = result.redirectUrl;
    });
  }

  function toggleOrgSelection(orgId: string) {
    setSelectedOrgIds((prev) => (prev.includes(orgId) ? prev.filter((id) => id !== orgId) : [...prev, orgId]));
  }

  const filteredOrgs = useMemo(() => {
    const q = orgQuery.trim().toLowerCase();
    if (!q) return orgs;
    return orgs.filter((org) => org.name.toLowerCase().includes(q) || org.slug.toLowerCase().includes(q));
  }, [orgs, orgQuery]);

  const popupTitle =
    step === "profile-name"
      ? "Your name"
      : step === "theme"
        ? "Appearance"
        : step === "orgs"
          ? "Join organizations"
          : step === "activation"
            ? "Verify your email"
            : "Sign in or create account";
  const popupSubtitle =
    step === "profile-name"
      ? "Step 1 of 3 — tell us who you are."
      : step === "theme"
        ? "Step 2 of 3 — pick your preferred appearance."
        : step === "orgs"
          ? "Step 3 of 3 — find organizations you belong to."
          : step === "activation"
            ? "We sent a link to confirm this email."
            : "Enter your email to sign in. New accounts are created from the same screen.";

  const content = (
    <div className="space-y-4">

      {step === "email" && savedAccounts.length > 0 ? (
        <ul className="space-y-2">
          {savedAccounts.map((saved) => (
            <li className="group relative flex items-center" key={saved.email}>
              <button
                className="flex w-full items-center gap-3 rounded-full border border-border bg-surface py-1.5 pl-1.5 pr-12 text-left transition hover:bg-surface-muted focus:bg-surface-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
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
              <Button
                iconOnly
                aria-label={`Remove ${saved.email}`}
                className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 transition group-hover:opacity-100 focus:opacity-100"
                onClick={(event) => handleRemoveSavedAccount(event, saved.email)}
                type="button"
              >
                <X className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}

      {step === "email" ? (
        <div className="space-y-3">
          <form className="space-y-3" onSubmit={handleEmailStepSubmit}>
            <FormField htmlFor={emailId} label="Email">
              <div className="flex items-center gap-2">
                <input
                  autoComplete="username webauthn"
                  className={`${authInputClass} flex-1`}
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
          </form>
          <div className="flex items-center gap-3 text-xs text-text-muted">
            <span className="h-px flex-1 bg-border" />
            <span>or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button
            className="w-full justify-center gap-2 border border-border bg-surface text-text hover:bg-surface-muted"
            disabled={isStartingGoogleOAuth}
            onClick={() => {
              startGoogleOAuth(async () => {
                const result = await startGoogleOAuthAction({ nextPath, returnTo });
                if (!result.ok) {
                  notifyAuthError(result.error, "Google sign-in failed");
                  return;
                }
                window.location.href = result.url;
              });
            }}
            type="button"
            variant="secondary"
          >
            {isStartingGoogleOAuth ? <SpinnerIcon className="h-4 w-4" /> : <GoogleIcon className="h-4 w-4" />}
            Continue with Google
          </Button>
        </div>
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
            <>
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
                    <input
                      autoComplete="current-password"
                      autoFocus
                      className={`${authInputClass} flex-1`}
                      id={existingPasswordId}
                      name="password"
                      required
                      type="password"
                    />
                    <SubmitIconButton
                      className="h-10 w-10 rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
                      icon={<ChevronRight className="h-4 w-4" />}
                      label="Sign in"
                    />
                  </div>
                </FormField>
              </form>
              <div className="flex items-center justify-between">
                <Button
                  className="gap-1.5"
                  onClick={() => {
                    setStepDirection("back");
                    setStep("email");
                  }}
                  type="button"
                  variant="secondary"
                >
                  Use different email
                </Button>
                <Button
                  disabled={isSendingPasswordReset}
                  onClick={() => {
                    if (!normalizedEmail) {
                      return;
                    }
                    startSendingPasswordReset(async () => {
                      const result = await sendPasswordResetEmailAction({ email: normalizedEmail });
                      if (result.ok) {
                        notifyAuthInfo("Reset email sent", `Check your inbox at ${normalizedEmail}.`);
                      } else {
                        notifyAuthError(result.error, "Couldn't send reset email");
                      }
                    });
                  }}
                  type="button"
                  variant="ghost"
                >
                  {isSendingPasswordReset ? "Sending..." : "Forgot password?"}
                </Button>
              </div>
            </>
          ) : (
            <form className="space-y-3" onSubmit={handleCreateAccountSubmit}>
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
                  <input
                    autoComplete="new-password"
                    autoFocus
                    className={`${authInputClass} flex-1`}
                    id={newPasswordId}
                    name="password"
                    onChange={(event) => setPassword(event.target.value)}
                    required
                    type="password"
                    value={password}
                  />
                  <Button
                    iconOnly
                    aria-label="Create account"
                    className="h-10 w-10 rounded-full border border-border bg-surface text-text shadow-sm hover:bg-surface-muted"
                    disabled={isCreatingAccount}
                    type="submit"
                  >
                    {isCreatingAccount ? <SpinnerIcon className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </div>
              </FormField>
              <div className="flex">
                <Button
                  className="gap-1.5"
                  onClick={() => {
                    setStepDirection("back");
                    setStep("email");
                  }}
                  type="button"
                  variant="ghost"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Use different email
                </Button>
              </div>
            </form>
          )}
        </div>
      ) : null}

      {step === "profile-name" ? (
        <form className="space-y-4" onSubmit={handleProfileNameContinue}>
          <p className="text-sm text-text-muted">Tell us your name. This is how you'll appear across organizations.</p>
          <FormField htmlFor={firstNameId} label="First name">
            <input
              autoComplete="given-name"
              autoFocus
              className={authInputClass}
              id={firstNameId}
              name="firstName"
              onChange={(event) => setFirstName(event.target.value)}
              required
              type="text"
              value={firstName}
            />
          </FormField>
          <FormField htmlFor={lastNameId} label="Last name">
            <input
              autoComplete="family-name"
              className={authInputClass}
              id={lastNameId}
              name="lastName"
              onChange={(event) => setLastName(event.target.value)}
              required
              type="text"
              value={lastName}
            />
          </FormField>
          <div className="flex justify-end">
            <Button className="gap-1.5" type="submit">
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </form>
      ) : null}

      {step === "theme" ? (
        <div className="space-y-4">
          <p className="text-sm text-text-muted">Pick your appearance. You can change it any time in settings.</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { value: "light", label: "Light", icon: Sun },
                { value: "dark", label: "Dark", icon: Moon },
                { value: "auto", label: "System", icon: Monitor }
              ] as const
            ).map((option) => {
              const isActive = themeChoice === option.value;
              const Icon = option.icon;
              return (
                <button
                  aria-pressed={isActive}
                  className={`flex flex-col items-center gap-2 rounded-card border p-4 text-sm transition focus:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas ${
                    isActive ? "border-accent bg-accent/10 text-text" : "border-border bg-surface text-text-muted hover:bg-surface-muted hover:text-text"
                  }`}
                  key={option.value}
                  onClick={() => {
                    setThemeChoice(option.value);
                    themeContext.setMode(option.value);
                  }}
                  type="button"
                >
                  <Icon className="h-5 w-5" />
                  <span className="font-medium">{option.label}</span>
                </button>
              );
            })}
          </div>
          <div className="flex items-center justify-between">
            <Button
              className="gap-1.5"
              onClick={() => {
                setStepDirection("back");
                setStep("profile-name");
              }}
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button className="gap-1.5" onClick={handleThemeContinue} type="button">
              Continue
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ) : null}

      {step === "orgs" ? (
        <div className="space-y-3">
          <p className="text-sm text-text-muted">Join organizations you're part of. You can also skip and join later.</p>
          <div className="relative">
            <Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <input
              autoComplete="off"
              className={`${authInputClass} pl-9`}
              id={orgSearchId}
              onChange={(event) => setOrgQuery(event.target.value)}
              placeholder="Search organizations"
              type="search"
              value={orgQuery}
            />
          </div>
          <div className="max-h-64 overflow-y-auto rounded-card border border-border bg-surface">
            {isLoadingOrgs && !orgsLoaded ? (
              <div className="flex items-center justify-center gap-2 p-6 text-sm text-text-muted">
                <SpinnerIcon className="h-4 w-4" />
                Loading organizations...
              </div>
            ) : filteredOrgs.length === 0 ? (
              <p className="p-6 text-center text-sm text-text-muted">
                {orgs.length === 0 ? "No public organizations available yet." : "No organizations match your search."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filteredOrgs.map((org) => {
                  const checked = selectedOrgIds.includes(org.id);
                  return (
                    <li key={org.id}>
                      <button
                        aria-pressed={checked}
                        className={`flex w-full items-center gap-3 px-3 py-2 text-left transition hover:bg-surface-muted focus:bg-surface-muted focus:outline-none ${checked ? "bg-accent/5" : ""}`}
                        onClick={() => toggleOrgSelection(org.id)}
                        type="button"
                      >
                        <span
                          className={`flex h-5 w-5 flex-none items-center justify-center rounded-control border ${
                            checked ? "border-accent bg-accent text-accent-foreground" : "border-border bg-surface"
                          }`}
                        >
                          {checked ? <Check className="h-3.5 w-3.5" /> : null}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-text">{org.name}</p>
                          <p className="truncate text-xs text-text-muted">{org.slug}</p>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="flex items-center justify-between">
            <Button
              className="gap-1.5"
              onClick={() => {
                setStepDirection("back");
                setStep("theme");
              }}
              type="button"
              variant="ghost"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            <Button className="gap-1.5" disabled={isFinishingOnboarding} onClick={handleFinishOnboarding} type="button">
              {isFinishingOnboarding ? <SpinnerIcon className="h-4 w-4" /> : null}
              {selectedOrgIds.length > 0 ? `Finish (${selectedOrgIds.length})` : "Skip and finish"}
            </Button>
          </div>
        </div>
      ) : null}

      {step === "activation" ? (
        <div className="space-y-3">
          <div className="rounded-card border border-warning/40 bg-warning/10 p-4">
            <p className="text-sm font-medium text-text">Email verification required</p>
            <p className="mt-1 text-xs text-text-muted">This account needs activation before password sign in is enabled.</p>
          </div>
          <p className="text-xs text-text-muted">{normalizedEmail}</p>
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
      subtitle={popupSubtitle}
      title={popupTitle}
      viewKey={step}
      viewDirection={stepDirection}
    >
      {content}
    </Popup>
  );
}
