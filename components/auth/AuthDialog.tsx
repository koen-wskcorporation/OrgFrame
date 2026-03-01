"use client";

import Link from "next/link";
import { useEffect, useId, useState, type CSSProperties } from "react";
import { signInAction, signUpAction } from "@/app/auth/actions";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Panel } from "@/components/ui/panel";
import { SubmitButton } from "@/components/ui/submit-button";

export type AuthMode = "signin" | "signup";

type AuthDialogProps = {
  open: boolean;
  onClose: () => void;
  initialMode?: AuthMode;
  errorMessage?: string | null;
  infoMessage?: string | null;
  nextPath?: string;
};

export function AuthDialog({
  open,
  onClose,
  initialMode = "signin",
  errorMessage = null,
  infoMessage = null,
  nextPath = "/"
}: AuthDialogProps) {
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const signInEmailId = useId();
  const signInPasswordId = useId();
  const signUpEmailId = useId();
  const signUpPasswordId = useId();

  useEffect(() => {
    if (!open) {
      return;
    }

    setMode(initialMode);
  }, [initialMode, open]);

  const appBrandingVars = {
    "--accent": "var(--app-accent)",
    "--accent-foreground": "var(--app-accent-foreground)",
    "--ring": "var(--app-ring)"
  } as CSSProperties;

  return (
    <Panel
      onClose={onClose}
      open={open}
      panelStyle={appBrandingVars}
      subtitle="Sign in or create an account to open your dashboard and organizations."
      title="Account Access"
    >
      <div className="space-y-4">
        {errorMessage ? <Alert variant="destructive">{errorMessage}</Alert> : null}
        {infoMessage ? <Alert variant="info">{infoMessage}</Alert> : null}

        <div className="grid grid-cols-2 gap-2">
          <Button onClick={() => setMode("signin")} type="button" variant={mode === "signin" ? "secondary" : "ghost"}>
            Sign in
          </Button>
          <Button onClick={() => setMode("signup")} type="button" variant={mode === "signup" ? "secondary" : "ghost"}>
            Create account
          </Button>
        </div>

        {mode === "signin" ? (
          <form action={signInAction} className="space-y-3">
            <input name="next" type="hidden" value={nextPath} />
            <FormField htmlFor={signInEmailId} label="Email">
              <Input autoComplete="email" id={signInEmailId} name="email" required type="email" />
            </FormField>
            <FormField htmlFor={signInPasswordId} label="Password">
              <Input autoComplete="current-password" id={signInPasswordId} name="password" required type="password" />
            </FormField>
            <p className="text-right text-xs">
              <Link className="text-link underline-offset-2 hover:underline" href="/auth/reset" onClick={onClose}>
                Forgot password?
              </Link>
            </p>
            <SubmitButton className="w-full">Sign in</SubmitButton>
          </form>
        ) : (
          <form action={signUpAction} className="space-y-3">
            <input name="next" type="hidden" value={nextPath} />
            <FormField htmlFor={signUpEmailId} label="Email">
              <Input autoComplete="email" id={signUpEmailId} name="email" required type="email" />
            </FormField>
            <FormField hint="Minimum 8 characters" htmlFor={signUpPasswordId} label="Password">
              <Input autoComplete="new-password" id={signUpPasswordId} name="password" required type="password" />
            </FormField>
            <SubmitButton className="w-full" variant="secondary">
              Create account
            </SubmitButton>
          </form>
        )}
      </div>
    </Panel>
  );
}
