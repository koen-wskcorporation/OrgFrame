# OrgFrame Web

Marketing site for OrgFrame.

## Setup

```bash
npm install
```

## Development

```bash
npm run dev --workspace orgframe-web
```

## Build and start

```bash
npm run build --workspace orgframe-web
npm run start --workspace orgframe-web
```

## Deploy to Vercel

1. Create a separate Vercel project named `orgframe-web`.
2. Import this monorepo and set the Root Directory to `apps/orgframe-web`.
3. Keep framework preset as Next.js and deploy.
