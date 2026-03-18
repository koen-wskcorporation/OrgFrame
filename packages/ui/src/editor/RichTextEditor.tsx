"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Underline } from "lucide-react";
import { Button } from "@orgframe/ui/ui/button";
import { cn } from "@/lib/utils";

type RichTextEditorProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  minHeight?: number;
  placeholder?: string;
};

function normalizeHtml(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function RichTextEditor({ value, onChange, className, minHeight = 130, placeholder = "Write description..." }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement | null>(null);
  const [focused, setFocused] = useState(false);

  const isEmpty = useMemo(() => !value || normalizeHtml(value) === "", [value]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor) {
      return;
    }

    const current = normalizeHtml(editor.innerHTML);
    const next = normalizeHtml(value);
    if (current !== next) {
      editor.innerHTML = value || "";
    }
  }, [value]);

  function applyCommand(command: "bold" | "italic" | "underline" | "insertUnorderedList" | "insertOrderedList") {
    document.execCommand(command);
    const html = editorRef.current?.innerHTML ?? "";
    onChange(html);
    editorRef.current?.focus();
  }

  function addLink() {
    const href = window.prompt("Enter URL", "https://");
    if (!href) {
      return;
    }

    document.execCommand("createLink", false, href);
    const html = editorRef.current?.innerHTML ?? "";
    onChange(html);
    editorRef.current?.focus();
  }

  return (
    <div className={cn("rounded-card border bg-surface", focused ? "border-accent" : "border-border", className)}>
      <div className="flex flex-wrap items-center gap-2 border-b px-2 py-2">
        <Button onClick={() => applyCommand("bold")} size="sm" type="button" variant="ghost">
          <Bold className="h-4 w-4" />
          Bold
        </Button>
        <Button onClick={() => applyCommand("italic")} size="sm" type="button" variant="ghost">
          <Italic className="h-4 w-4" />
          Italic
        </Button>
        <Button onClick={() => applyCommand("underline")} size="sm" type="button" variant="ghost">
          <Underline className="h-4 w-4" />
          Underline
        </Button>
        <Button onClick={() => applyCommand("insertUnorderedList")} size="sm" type="button" variant="ghost">
          <List className="h-4 w-4" />
          List
        </Button>
        <Button onClick={() => applyCommand("insertOrderedList")} size="sm" type="button" variant="ghost">
          <ListOrdered className="h-4 w-4" />
          Numbered
        </Button>
        <Button onClick={addLink} size="sm" type="button" variant="ghost">
          <LinkIcon className="h-4 w-4" />
          Link
        </Button>
      </div>
      <div className="relative px-3 py-2">
        {isEmpty ? <span className="pointer-events-none absolute left-3 top-2 text-sm text-text-muted">{placeholder}</span> : null}
        <div
          className="prose prose-sm max-w-none outline-none"
          contentEditable
          onBlur={() => setFocused(false)}
          onFocus={() => setFocused(true)}
          onInput={(event) => {
            onChange((event.target as HTMLDivElement).innerHTML);
          }}
          ref={editorRef}
          style={{ minHeight }}
          suppressContentEditableWarning
        />
      </div>
    </div>
  );
}
