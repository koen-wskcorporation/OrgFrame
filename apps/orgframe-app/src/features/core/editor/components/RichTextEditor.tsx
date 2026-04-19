"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Bold, Italic, Link as LinkIcon, List, ListOrdered, Underline } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { cn } from "@orgframe/ui/primitives/utils";

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
      <div className="flex flex-wrap items-center gap-1 border-b px-1.5 py-1.5">
        <Button iconOnly aria-label="Bold" onClick={() => applyCommand("bold")} type="button">
          <Bold />
        </Button>
        <Button iconOnly aria-label="Italic" onClick={() => applyCommand("italic")} type="button">
          <Italic />
        </Button>
        <Button iconOnly aria-label="Underline" onClick={() => applyCommand("underline")} type="button">
          <Underline />
        </Button>
        <Button iconOnly aria-label="Bulleted list" onClick={() => applyCommand("insertUnorderedList")} type="button">
          <List />
        </Button>
        <Button iconOnly aria-label="Numbered list" onClick={() => applyCommand("insertOrderedList")} type="button">
          <ListOrdered />
        </Button>
        <Button iconOnly aria-label="Insert link" onClick={addLink} type="button">
          <LinkIcon />
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
