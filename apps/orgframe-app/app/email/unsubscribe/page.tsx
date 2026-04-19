import { verifyUnsubscribeToken } from "@/src/features/messaging/tenant-email/unsubscribe";
import { addSuppression, removeSuppression } from "@/src/features/messaging/tenant-email/suppression";
import { createSupabaseServiceRoleClient } from "@/src/shared/data-api/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type PageProps = {
  searchParams: Promise<{ t?: string }>;
};

async function confirmUnsubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("t") ?? "");
  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) return;
  await addSuppression({
    orgId: verified.orgId,
    email: verified.email,
    reason: "unsubscribe",
    source: "one_click_link"
  });
}

async function resubscribe(formData: FormData) {
  "use server";
  const token = String(formData.get("t") ?? "");
  const verified = verifyUnsubscribeToken(token);
  if (!verified.ok) return;
  await removeSuppression(verified.orgId, verified.email);
}

async function lookupOrgName(orgId: string): Promise<string> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase.schema("orgs").from("orgs").select("name").eq("id", orgId).maybeSingle();
  return data?.name?.trim() || "this organization";
}

async function isAlreadySuppressed(orgId: string, email: string): Promise<boolean> {
  const supabase = createSupabaseServiceRoleClient();
  const { data } = await supabase
    .schema("messaging")
    .from("suppressions")
    .select("id")
    .eq("org_id", orgId)
    .eq("email_lower", email.toLowerCase())
    .maybeSingle();
  return !!data;
}

export default async function UnsubscribePage({ searchParams }: PageProps) {
  const { t } = await searchParams;

  if (!t) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Unsubscribe link is missing</h1>
          <p style={styles.paragraph}>This link appears to be malformed. Please use the unsubscribe link from a recent email.</p>
        </div>
      </main>
    );
  }

  const verified = verifyUnsubscribeToken(t);
  if (!verified.ok) {
    return (
      <main style={styles.page}>
        <div style={styles.card}>
          <h1 style={styles.heading}>Link expired or invalid</h1>
          <p style={styles.paragraph}>This unsubscribe link is no longer valid. Please use the link from a recent email.</p>
        </div>
      </main>
    );
  }

  const [orgName, suppressed] = await Promise.all([
    lookupOrgName(verified.orgId),
    isAlreadySuppressed(verified.orgId, verified.email)
  ]);

  return (
    <main style={styles.page}>
      <div style={styles.card}>
        {suppressed ? (
          <>
            <h1 style={styles.heading}>You&apos;re unsubscribed</h1>
            <p style={styles.paragraph}>
              <strong>{verified.email}</strong> will no longer receive emails from {orgName}.
            </p>
            <form action={resubscribe}>
              <input type="hidden" name="t" value={t} />
              <button type="submit" style={styles.secondaryButton}>Resubscribe</button>
            </form>
          </>
        ) : (
          <>
            <h1 style={styles.heading}>Unsubscribe from {orgName}?</h1>
            <p style={styles.paragraph}>
              Confirm to stop receiving emails from <strong>{orgName}</strong> at <strong>{verified.email}</strong>.
            </p>
            <form action={confirmUnsubscribe}>
              <input type="hidden" name="t" value={t} />
              <button type="submit" style={styles.primaryButton}>Unsubscribe</button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}

const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: "100vh",
    backgroundColor: "#f5f6f8",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "32px",
    fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif"
  },
  card: {
    backgroundColor: "#ffffff",
    borderRadius: "12px",
    border: "1px solid #e5e7eb",
    padding: "40px",
    maxWidth: "480px",
    width: "100%"
  },
  heading: { fontSize: "22px", fontWeight: 600, color: "#1a1d21", margin: "0 0 12px" },
  paragraph: { fontSize: "15px", lineHeight: "24px", color: "#1a1d21", margin: "0 0 24px" },
  primaryButton: {
    backgroundColor: "#0b5cff",
    color: "#ffffff",
    padding: "10px 18px",
    borderRadius: "8px",
    border: "none",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer"
  },
  secondaryButton: {
    backgroundColor: "transparent",
    color: "#0b5cff",
    padding: "10px 18px",
    borderRadius: "8px",
    border: "1px solid #0b5cff",
    fontSize: "15px",
    fontWeight: 600,
    cursor: "pointer"
  }
};
