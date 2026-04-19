"use client";

import { useActionState, useEffect, useRef } from "react";
import { Send, CheckCircle2 } from "lucide-react";
import { submitContactForm, type ContactFormState } from "@/app/(marketing)/contact/actions";

interface ContactFormProps {
  defaultTopic?: "demo" | "sales" | "roadmap" | "other";
  defaultModule?: string;
  defaultSolution?: string;
  sourcePath?: string;
}

const INITIAL: ContactFormState = { status: "idle" };

const TOPIC_OPTIONS: { value: "demo" | "sales" | "roadmap" | "other"; label: string }[] = [
  { value: "demo", label: "Book a demo" },
  { value: "sales", label: "Pricing & plans" },
  { value: "roadmap", label: "Roadmap feedback" },
  { value: "other", label: "Something else" }
];

const ORG_TYPE_OPTIONS = ["Club", "League", "Association", "Facility", "Other"];

export function ContactForm({ defaultTopic = "demo", defaultModule, defaultSolution, sourcePath = "/contact" }: ContactFormProps) {
  const [state, formAction, isPending] = useActionState(submitContactForm, INITIAL);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (state.status === "success") {
      formRef.current?.reset();
    }
  }, [state.status]);

  if (state.status === "success") {
    return (
      <div className="flex flex-col items-start gap-4 rounded-[24px] border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))] p-8 md:p-10">
        <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[hsl(var(--accent-bg)/0.15)] text-[hsl(var(--accent-ink))]">
          <CheckCircle2 aria-hidden className="h-5 w-5" />
        </span>
        <h2 className="subhead">Thanks — we'll be in touch.</h2>
        <p className="max-w-lg text-[1.0625rem] leading-relaxed text-[hsl(var(--muted-ink))]">
          Your message landed. One of us will reply within a business day. If you need us sooner, email{" "}
          <a className="marketing-link" href="mailto:hello@orgframe.com">
            hello@orgframe.com
          </a>
          .
        </p>
      </div>
    );
  }

  const err = state.status === "error" ? state.fieldErrors ?? {} : {};
  const topHint = state.status === "error" ? state.message : null;

  return (
    <form ref={formRef} action={formAction} className="flex flex-col gap-6" noValidate>
      <input name="source_path" type="hidden" value={sourcePath} />
      {defaultModule ? <input name="module_hint" type="hidden" value={defaultModule} /> : null}
      {defaultSolution ? <input name="solution_hint" type="hidden" value={defaultSolution} /> : null}

      {topHint ? (
        <div className="rounded-2xl border border-[hsl(var(--destructive)/0.4)] bg-[hsl(var(--destructive)/0.08)] p-4 text-sm text-[hsl(var(--destructive))]">
          {topHint}
        </div>
      ) : null}

      <div className="grid gap-4 md:grid-cols-2">
        <Field error={err.name} label="Your name" name="name">
          <input
            autoComplete="name"
            className={inputClass(Boolean(err.name))}
            name="name"
            placeholder="Jordan Park"
            required
            type="text"
          />
        </Field>
        <Field error={err.email} label="Email" name="email">
          <input
            autoComplete="email"
            className={inputClass(Boolean(err.email))}
            name="email"
            placeholder="jordan@yourclub.org"
            required
            type="email"
          />
        </Field>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Organization" name="org_name">
          <input
            autoComplete="organization"
            className={inputClass(false)}
            name="org_name"
            placeholder="Metro Youth Hockey"
            type="text"
          />
        </Field>
        <Field label="Organization type" name="org_type">
          <select className={inputClass(false)} defaultValue="" name="org_type">
            <option value="" disabled>
              Select one
            </option>
            {ORG_TYPE_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field error={err.topic} label="What are you reaching out about?" name="topic">
        <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
          {TOPIC_OPTIONS.map((t) => (
            <label
              key={t.value}
              className="group flex cursor-pointer items-center gap-2 rounded-full border border-[hsl(var(--rule))] bg-[hsl(var(--paper-2))] px-4 py-2.5 text-sm font-medium text-[hsl(var(--ink))] transition-colors has-[:checked]:border-[hsl(var(--accent-ink))] has-[:checked]:bg-[hsl(var(--accent-bg)/0.12)] has-[:checked]:text-[hsl(var(--accent-ink))] hover:border-[hsl(var(--rule-strong))]"
            >
              <input className="sr-only" defaultChecked={t.value === defaultTopic} name="topic" type="radio" value={t.value} />
              <span className="h-2 w-2 rounded-full border border-[hsl(var(--rule-strong))] group-has-[:checked]:border-[hsl(var(--accent-ink))] group-has-[:checked]:bg-[hsl(var(--accent-ink))]" />
              {t.label}
            </label>
          ))}
        </div>
      </Field>

      <Field error={err.message} label="Message" name="message">
        <textarea
          className={`${inputClass(Boolean(err.message))} min-h-[140px] resize-y py-3 leading-relaxed`}
          name="message"
          placeholder="Tell us a bit about your organization and what you'd like to see."
          required
          rows={5}
        />
      </Field>

      <div className="flex flex-col items-start gap-3 pt-2 md:flex-row md:items-center md:justify-between">
        <p className="text-xs text-[hsl(var(--muted-ink))]">
          We reply within one business day. No mailing list, no drip sequence.
        </p>
        <button
          className="btn-primary-cyan inline-flex h-12 items-center justify-center gap-2 rounded-full border px-6 text-sm font-semibold transition-colors disabled:opacity-60"
          disabled={isPending}
          type="submit"
        >
          {isPending ? "Sending…" : "Send message"}
          <Send aria-hidden className="h-4 w-4" />
        </button>
      </div>
    </form>
  );
}

function Field({
  label,
  name,
  error,
  children
}: {
  label: string;
  name: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2" htmlFor={name}>
      <span className="text-xs font-semibold uppercase tracking-[0.1em] text-[hsl(var(--muted-ink))]">{label}</span>
      {children}
      {error ? <span className="text-xs text-[hsl(var(--destructive))]">{error}</span> : null}
    </label>
  );
}

function inputClass(hasError: boolean) {
  const base =
    "h-12 w-full rounded-full border bg-[hsl(var(--paper-2))] px-4 text-[0.95rem] text-[hsl(var(--ink))] placeholder:text-[hsl(var(--muted-ink))] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-[hsl(var(--paper))]";
  const border = hasError
    ? "border-[hsl(var(--destructive))] focus:ring-[hsl(var(--destructive))]"
    : "border-[hsl(var(--rule-strong))] focus:ring-[hsl(var(--accent-ink))] focus:border-[hsl(var(--accent-ink))]";
  const multiline =
    "[&:is(textarea)]:h-auto [&:is(textarea)]:rounded-[20px] [&:is(textarea)]:py-3";
  return `${base} ${border} ${multiline}`;
}
