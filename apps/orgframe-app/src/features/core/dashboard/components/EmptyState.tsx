import { Button } from "@orgframe/ui/primitives/button";
import { InlineEmptyState } from "@orgframe/ui/primitives/state";

type EmptyStateProps = {
  demoOrgSlug?: string | null;
};

export function EmptyState({ demoOrgSlug }: EmptyStateProps) {
  return (
    <InlineEmptyState
      actions={
        <>
          <Button href="/settings" size="sm" variant="secondary">
            Settings
          </Button>
          {demoOrgSlug ? (
            <Button href={`/${demoOrgSlug}`} size="sm" variant="ghost">
              View Demo Organization
            </Button>
          ) : null}
        </>
      }
      description="Your account is active, but you do not have organization memberships yet."
      title="No organizations yet"
    />
  );
}
