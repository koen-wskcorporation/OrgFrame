export default function OrgManageLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-44 animate-pulse rounded-control bg-surface-muted" />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <div className="h-40 animate-pulse rounded-card border bg-surface-muted" />
        <div className="h-40 animate-pulse rounded-card border bg-surface-muted" />
        <div className="h-40 animate-pulse rounded-card border bg-surface-muted" />
      </div>
    </div>
  );
}
