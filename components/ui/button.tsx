import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { SpinnerIcon } from "@/components/ui/spinner-icon";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-control border border-transparent text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:cursor-not-allowed disabled:opacity-55",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground hover:bg-accent/90",
        secondary: "border-border bg-surface-muted text-text hover:bg-surface",
        ghost: "border-0 bg-transparent text-text hover:bg-transparent active:bg-transparent",
        link: "border-transparent bg-transparent px-0 text-accent underline-offset-4 hover:underline",
        destructive: "bg-destructive text-canvas hover:bg-destructive/90"
      },
      size: {
        sm: "h-9 px-3 text-xs",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-[15px]"
      }
    },
    defaultVariants: {
      variant: "primary",
      size: "md"
    }
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ children, className, disabled, loading = false, variant, size, type = "button", ...props }, ref) => {
    return (
      <button
        aria-busy={loading || undefined}
        className={cn(buttonVariants({ variant, size }), className)}
        disabled={disabled || loading}
        ref={ref}
        type={type}
        {...props}
      >
        {loading ? <SpinnerIcon className="h-4 w-4" /> : null}
        <span className={cn("inline-flex items-center gap-2", loading ? "[&_svg]:opacity-0" : undefined)}>{children}</span>
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
