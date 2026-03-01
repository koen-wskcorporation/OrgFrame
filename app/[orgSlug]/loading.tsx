export default function OrgRouteLoading() {
  return (
    <main className="w-full px-6 py-6 md:px-8">
      <div className="space-y-4">
        <div className="h-10 w-56 animate-pulse rounded-control bg-surface-muted" />
        <div className="h-40 animate-pulse rounded-card border bg-surface-muted" />
        <div className="grid gap-4 md:grid-cols-2">
          <div className="h-28 animate-pulse rounded-card border bg-surface-muted" />
          <div className="h-28 animate-pulse rounded-card border bg-surface-muted" />
        </div>
      </div>
    </main>
  );
}
