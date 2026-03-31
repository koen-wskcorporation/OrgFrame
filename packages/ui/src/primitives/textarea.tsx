import * as React from "react";
import { formControlDisabledClass, formControlFocusClass, formControlShellClass } from "./form-control";
import { cn } from "./utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          `min-h-[120px] w-full rounded-control px-3 py-2 text-sm placeholder:text-text-muted transition-colors duration-150 ${formControlShellClass} ${formControlFocusClass} ${formControlDisabledClass}`,
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
