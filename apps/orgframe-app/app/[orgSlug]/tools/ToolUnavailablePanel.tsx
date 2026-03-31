import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@orgframe/ui/primitives/card";

type ToolUnavailablePanelProps = {
  title: string;
};

export function ToolUnavailablePanel({ title }: ToolUnavailablePanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title} unavailable</CardTitle>
        <CardDescription>This feature is not available for your organization right now.</CardDescription>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-text-muted">Ask your organization admin to enable this tool in organization settings.</p>
      </CardContent>
    </Card>
  );
}
