function getGitBranch() {
  return (process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? "").trim().toLowerCase();
}

function getVercelEnv() {
  return (process.env.VERCEL_ENV ?? process.env.NEXT_PUBLIC_VERCEL_ENV ?? "").trim().toLowerCase();
}

export function shouldShowBranchHeaders() {
  const gitBranch = getGitBranch();
  const vercelEnv = getVercelEnv();
  const isMainProduction = vercelEnv === "production" && gitBranch === "main";

  return !isMainProduction;
}
