"use server";

import { headers } from "next/headers";
import { createSupabaseServer } from "@/src/shared/supabase/server";

const TOPICS = new Set(["demo", "sales", "roadmap", "other"]);
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ContactFormState =
  | { status: "idle" }
  | { status: "success" }
  | { status: "error"; message: string; fieldErrors?: Partial<Record<keyof ContactFields, string>> };

type ContactFields = {
  name: string;
  email: string;
  org_name: string;
  org_type: string;
  topic: string;
  message: string;
  source_path: string;
};

function trim(value: FormDataEntryValue | null, max: number): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

export async function submitContactForm(_prev: ContactFormState, formData: FormData): Promise<ContactFormState> {
  const fields: ContactFields = {
    name: trim(formData.get("name"), 200),
    email: trim(formData.get("email"), 320),
    org_name: trim(formData.get("org_name"), 200),
    org_type: trim(formData.get("org_type"), 80),
    topic: trim(formData.get("topic"), 40),
    message: trim(formData.get("message"), 5000),
    source_path: trim(formData.get("source_path"), 500)
  };

  const fieldErrors: Partial<Record<keyof ContactFields, string>> = {};

  if (!fields.name) fieldErrors.name = "Please enter your name.";
  if (!fields.email) {
    fieldErrors.email = "Please enter your email.";
  } else if (!EMAIL_RE.test(fields.email)) {
    fieldErrors.email = "That doesn't look like a valid email address.";
  }
  if (!fields.topic || !TOPICS.has(fields.topic)) fieldErrors.topic = "Please select a topic.";
  if (!fields.message || fields.message.length < 4) fieldErrors.message = "A sentence or two, please.";

  if (Object.keys(fieldErrors).length > 0) {
    return { status: "error", message: "Please fix the highlighted fields.", fieldErrors };
  }

  const headerStore = await headers();
  const userAgent = (headerStore.get("user-agent") ?? "").slice(0, 500);
  const referrer = (headerStore.get("referer") ?? "").slice(0, 500);

  try {
    const supabase = await createSupabaseServer();
    const { error } = await supabase.from("marketing_leads").insert({
      name: fields.name,
      email: fields.email,
      org_name: fields.org_name || null,
      org_type: fields.org_type || null,
      topic: fields.topic,
      message: fields.message,
      source_path: fields.source_path || null,
      user_agent: userAgent || null,
      referrer: referrer || null
    });

    if (error) {
      console.error("[marketing_leads.insert]", error);
      return {
        status: "error",
        message: "We couldn't save your message. Please try again or email us directly."
      };
    }
  } catch (err) {
    console.error("[marketing_leads.exception]", err);
    return {
      status: "error",
      message: "Something went wrong on our end. Please try again or email us directly."
    };
  }

  return { status: "success" };
}
