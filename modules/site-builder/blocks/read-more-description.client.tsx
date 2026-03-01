"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ReadMoreDescriptionProps = {
  children: string;
};

export function ReadMoreDescription({ children }: ReadMoreDescriptionProps) {
  const contentRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canExpand, setCanExpand] = useState(false);
  const [collapsedMaxHeight, setCollapsedMaxHeight] = useState<number | null>(null);

  useEffect(() => {
    const element = contentRef.current;

    if (!element) {
      return;
    }

    const measureOverflow = () => {
      const style = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(style.lineHeight);

      if (!Number.isFinite(lineHeight) || lineHeight <= 0) {
        setCanExpand(false);
        setCollapsedMaxHeight(null);
        return;
      }

      setCollapsedMaxHeight(lineHeight);
      setCanExpand(element.scrollHeight > lineHeight + 1);
    };

    measureOverflow();
    const observer = new ResizeObserver(measureOverflow);
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [children, expanded]);

  return (
    <div className="min-w-0 w-full text-left">
      <p
        className={cn(
          "min-w-0 text-sm text-text-muted whitespace-normal break-words break-all",
          !expanded && "overflow-hidden"
        )}
        ref={contentRef}
        style={!expanded && collapsedMaxHeight ? { maxHeight: `${collapsedMaxHeight}px` } : undefined}
      >
        {children}
      </p>
      {canExpand ? (
        <Button
          className="mt-2 h-auto px-0 text-xs"
          onClick={() => setExpanded((value) => !value)}
          size="sm"
          type="button"
          variant="link"
        >
          {expanded ? "Read less" : "Read more"}
        </Button>
      ) : null}
    </div>
  );
}
