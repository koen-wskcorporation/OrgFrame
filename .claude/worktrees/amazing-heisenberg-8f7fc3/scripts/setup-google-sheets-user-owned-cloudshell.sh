#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash scripts/setup-google-sheets-user-owned-cloudshell.sh
#
# Optional overrides:
#   PROJECT_ID=your-project-id
#   PROJECT_NUMBER=your-project-number
#   VERCEL_TEAM_SLUG=orgframe
#   VERCEL_PROJECT_SLUG=orgframe-app
#   APP_DOMAIN=wskcorporation.com
#   POOL_ID=vercel
#   PROVIDER_ID=vercel
#   SERVICE_ACCOUNT_NAME=sheet-sync

PROJECT_ID="${PROJECT_ID:-project-b4a550a3-7332-479c-afc}"
PROJECT_NUMBER="${PROJECT_NUMBER:-}"
VERCEL_TEAM_SLUG="${VERCEL_TEAM_SLUG:-orgframe}"
VERCEL_PROJECT_SLUG="${VERCEL_PROJECT_SLUG:-orgframe-app}"
APP_DOMAIN="${APP_DOMAIN:-wskcorporation.com}"
POOL_ID="${POOL_ID:-vercel}"
PROVIDER_ID="${PROVIDER_ID:-vercel}"
SERVICE_ACCOUNT_NAME="${SERVICE_ACCOUNT_NAME:-sheet-sync}"

if [[ -z "${PROJECT_NUMBER}" ]]; then
  PROJECT_NUMBER="$(gcloud projects describe "${PROJECT_ID}" --format='value(projectNumber)')"
fi

if [[ -z "${PROJECT_NUMBER}" ]]; then
  echo "Unable to resolve PROJECT_NUMBER for PROJECT_ID=${PROJECT_ID}" >&2
  exit 1
fi

SERVICE_ACCOUNT_EMAIL="${SERVICE_ACCOUNT_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
ISSUER_URI="https://oidc.vercel.com/${VERCEL_TEAM_SLUG}"
ALLOWED_AUDIENCE="https://vercel.com/${VERCEL_TEAM_SLUG}"a
PRINCIPAL_SET="principalSet://iam.googleapis.com/projects/${PROJECT_NUMBER}/locations/global/workloadIdentityPools/${POOL_ID}/*"
APP_ORIGIN="https://${APP_DOMAIN}"
GOOGLE_SHEETS_OAUTH_REDIRECT_URI="${APP_ORIGIN}/api/integrations/google-sheets/oauth/callback"
GOOGLE_SHEETS_OAUTH_STATE_SECRET="$(openssl rand -hex 32)"
GOOGLE_SHEETS_WEBHOOK_HMAC_SECRET="$(openssl rand -hex 32)"
GOOGLE_SHEETS_CRON_BEARER_TOKEN="$(openssl rand -hex 32)"

echo "==> Using project: ${PROJECT_ID} (${PROJECT_NUMBER})"
gcloud config set project "${PROJECT_ID}" >/dev/null

echo "==> Enabling required APIs"
gcloud services enable \
  iam.googleapis.com \
  iamcredentials.googleapis.com \
  sts.googleapis.com \
  sheets.googleapis.com \
  drive.googleapis.com \
  serviceusage.googleapis.com \
  cloudresourcemanager.googleapis.com \
  --project="${PROJECT_ID}"

echo "==> Ensuring service account exists: ${SERVICE_ACCOUNT_EMAIL}"
if ! gcloud iam service-accounts describe "${SERVICE_ACCOUNT_EMAIL}" --project="${PROJECT_ID}" >/dev/null 2>&1; then
  gcloud iam service-accounts create "${SERVICE_ACCOUNT_NAME}" \
    --project="${PROJECT_ID}" \
    --display-name="OrgFrame Google Sheets Sync"
fi

echo "==> Ensuring Workload Identity Pool exists: ${POOL_ID}"
if ! gcloud iam workload-identity-pools describe "${POOL_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools create "${POOL_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --display-name="Vercel Workload Pool"
fi

echo "==> Ensuring OIDC provider exists/updated: ${PROVIDER_ID}"
if ! gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" >/dev/null 2>&1; then
  gcloud iam workload-identity-pools providers create-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --display-name="Vercel OIDC Provider" \
    --issuer-uri="${ISSUER_URI}" \
    --allowed-audiences="${ALLOWED_AUDIENCE}" \
    --attribute-mapping="google.subject=assertion.sub"
else
  gcloud iam workload-identity-pools providers update-oidc "${PROVIDER_ID}" \
    --project="${PROJECT_ID}" \
    --location="global" \
    --workload-identity-pool="${POOL_ID}" \
    --issuer-uri="${ISSUER_URI}" \
    --allowed-audiences="${ALLOWED_AUDIENCE}" \
    --attribute-mapping="google.subject=assertion.sub"
fi

echo "==> Granting WIF principal access to service account"
gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.workloadIdentityUser" \
  --member="${PRINCIPAL_SET}"

gcloud iam service-accounts add-iam-policy-binding "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" \
  --role="roles/iam.serviceAccountTokenCreator" \
  --member="${PRINCIPAL_SET}"

echo "==> Granting service usage consumer role to service account"
gcloud projects add-iam-policy-binding "${PROJECT_ID}" \
  --member="serviceAccount:${SERVICE_ACCOUNT_EMAIL}" \
  --role="roles/serviceusage.serviceUsageConsumer"

echo
echo "==> Verification"
gcloud iam workload-identity-pools providers describe "${PROVIDER_ID}" \
  --project="${PROJECT_ID}" \
  --location="global" \
  --workload-identity-pool="${POOL_ID}" \
  --format="yaml(oidc.issuerUri,oidc.allowedAudiences,attributeMapping,state)"

echo
gcloud iam service-accounts get-iam-policy "${SERVICE_ACCOUNT_EMAIL}" \
  --project="${PROJECT_ID}" \
  --format="yaml(bindings)"

echo
echo "============================================================"
echo "Add these Vercel env vars to project: ${VERCEL_TEAM_SLUG}/${VERCEL_PROJECT_SLUG}"
echo "============================================================"
cat <<EOF
GOOGLE_SHEETS_AUTH_MODE=vercel_oidc
GCP_PROJECT_NUMBER=${PROJECT_NUMBER}
GCP_WORKLOAD_IDENTITY_POOL_ID=${POOL_ID}
GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID=${PROVIDER_ID}
GCP_SERVICE_ACCOUNT_EMAIL=${SERVICE_ACCOUNT_EMAIL}

# User-owned Google Sheets OAuth (set in Vercel after creating OAuth client in Google Cloud)
GOOGLE_SHEETS_OAUTH_CLIENT_ID=
GOOGLE_SHEETS_OAUTH_CLIENT_SECRET=
GOOGLE_SHEETS_OAUTH_STATE_SECRET=${GOOGLE_SHEETS_OAUTH_STATE_SECRET}
GOOGLE_SHEETS_OAUTH_REDIRECT_URI=${GOOGLE_SHEETS_OAUTH_REDIRECT_URI}

# Existing webhook/cron secrets for sync workers
GOOGLE_SHEETS_WEBHOOK_HMAC_SECRET=${GOOGLE_SHEETS_WEBHOOK_HMAC_SECRET}
GOOGLE_SHEETS_CRON_BEARER_TOKEN=${GOOGLE_SHEETS_CRON_BEARER_TOKEN}
EOF

echo
echo "============================================================"
echo "Manual one-time Google OAuth client setup (Google Cloud Console)"
echo "============================================================"
echo "1) APIs & Services -> Credentials -> Create Credentials -> OAuth client ID (Web application)"
echo "2) Authorized redirect URI: ${GOOGLE_SHEETS_OAUTH_REDIRECT_URI}"
echo "3) Put client ID/secret into Vercel env vars above"
echo "4) Redeploy Vercel project and reconnect Google Sheets from the app UI"
