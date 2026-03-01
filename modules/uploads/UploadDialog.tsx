"use client";

import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EditorSettingsDialog } from "@/components/shared/EditorSettingsDialog";
import { cn } from "@/lib/utils";
import { formatFileSize } from "@/modules/uploads/client-utils";

type UploadDialogProps = {
  open: boolean;
  title: string;
  description: string;
  accept?: string;
  maxSizeMB?: number;
  recommendedPx?: {
    w: number;
    h: number;
  };
  file: File | null;
  error?: string | null;
  isSaving: boolean;
  saveLabel?: string;
  canSave: boolean;
  onSelectFile: (file: File) => void | Promise<void>;
  onClose: () => void;
  onSave: () => void;
  onClearSelection: () => void;
};

export function UploadDialog({
  open,
  title,
  description,
  accept,
  maxSizeMB,
  recommendedPx,
  file,
  error,
  isSaving,
  saveLabel = "Save",
  canSave,
  onSelectFile,
  onClose,
  onSave,
  onClearSelection
}: UploadDialogProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  async function handleDrop(event: React.DragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsDragging(false);

    const nextFile = event.dataTransfer.files?.[0] ?? null;
    if (!nextFile) {
      return;
    }

    await onSelectFile(nextFile);
  }

  return (
    <EditorSettingsDialog
      description={description}
      footer={
        <>
          <Button onClick={onClose} size="sm" variant="ghost">
            Cancel
          </Button>
          <Button disabled={!canSave || isSaving} loading={isSaving} onClick={onSave} size="sm">
            {isSaving ? "Saving..." : saveLabel}
          </Button>
        </>
      }
      onClose={onClose}
      open={open}
      title={title}
    >
      <div className="space-y-4">
        <button
          aria-label="Upload file"
          className={cn(
            "group relative flex min-h-[240px] w-full flex-col items-center justify-center gap-3 rounded-card border-2 border-dashed bg-surface-muted px-5 py-8 text-center transition-colors",
            isDragging ? "border-accent bg-accent/10" : "border-border hover:border-accent/60 hover:bg-accent/5"
          )}
          onClick={() => inputRef.current?.click()}
          onDragEnter={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={(event) => {
            event.preventDefault();
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setIsDragging(false);
            }
          }}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDrop={handleDrop}
          type="button"
        >
          <input
            accept={accept}
            className="sr-only"
            onChange={async (event) => {
              const nextFile = event.target.files?.[0] ?? null;
              event.currentTarget.value = "";
              if (!nextFile) {
                return;
              }

              await onSelectFile(nextFile);
            }}
            ref={inputRef}
            tabIndex={-1}
            type="file"
          />
          <Upload className="h-6 w-6 text-text" />
          <div className="space-y-1">
            <p className="text-sm font-semibold text-text">Drag and drop a file</p>
            <p className="text-sm text-text-muted">or click to browse</p>
          </div>
          {accept ? <p className="text-xs text-text-muted">Accepted: {accept}</p> : null}
          {maxSizeMB ? <p className="text-xs text-text-muted">Max file size: {maxSizeMB}MB</p> : null}
          {recommendedPx ? (
            <p className="text-xs text-text-muted">
              Recommended: {recommendedPx.w} x {recommendedPx.h}px
            </p>
          ) : null}
        </button>

        {file ? (
          <div className="rounded-control border bg-surface px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-text">{file.name}</p>
              <span className="text-xs text-text-muted">{formatFileSize(file.size)}</span>
              <span className="text-xs text-text-muted">{file.type || "Unknown type"}</span>
              <Button className="ml-auto" onClick={onClearSelection} size="sm" variant="ghost">
                Clear
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="rounded-control border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>
        ) : null}
      </div>
    </EditorSettingsDialog>
  );
}
