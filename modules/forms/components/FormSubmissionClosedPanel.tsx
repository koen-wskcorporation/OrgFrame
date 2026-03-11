type FormSubmissionClosedPanelProps = {
  title: string;
  description: string;
  submissionCount: number;
  submissionCap: number | null;
};

export function FormSubmissionClosedPanel({ title, description, submissionCount, submissionCap }: FormSubmissionClosedPanelProps) {
  return (
    <div className="space-y-2 rounded-card border bg-surface p-5">
      <h3 className="text-xl font-semibold text-text">{title}</h3>
      <p className="text-sm text-text-muted">{description}</p>
      {submissionCap !== null ? (
        <p className="text-xs text-text-muted">
          Submission limit reached: {submissionCount} of {submissionCap}
        </p>
      ) : null}
    </div>
  );
}
