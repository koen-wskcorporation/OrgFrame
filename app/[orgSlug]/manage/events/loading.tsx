export default function ManageEventsLoading() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-52 animate-pulse rounded-control bg-surface-muted" />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="h-40 animate-pulse rounded-card border bg-surface-muted" />
        <div className="h-40 animate-pulse rounded-card border bg-surface-muted" />
      </div>
      <div className="h-56 animate-pulse rounded-card border bg-surface-muted" />
    </div>
  );
}
