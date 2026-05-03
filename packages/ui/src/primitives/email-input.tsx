"use client";

import * as React from "react";
import { Input } from "./input";

const EMAIL_PATTERN = "[^\\s@]+@[^\\s@]+\\.[^\\s@]+";

type EmailInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">;

export const EmailInput = React.forwardRef<HTMLInputElement, EmailInputProps>(function EmailInput(
  { autoComplete = "email", inputMode = "email", pattern = EMAIL_PATTERN, spellCheck = false, ...rest },
  ref
) {
  return (
    <Input
      ref={ref}
      autoComplete={autoComplete}
      inputMode={inputMode}
      pattern={pattern}
      spellCheck={spellCheck}
      type="email"
      {...rest}
    />
  );
});
