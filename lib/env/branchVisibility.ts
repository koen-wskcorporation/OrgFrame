function getGitBranch() {
  return process.env.VERCEL_GIT_COMMIT_REF ?? process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_REF ?? null;
}

export function shouldShowBranchHeaders() {
  return getGitBranch() === "develop";
}
