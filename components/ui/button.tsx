import * as React from "react";
import Link from "next/link";
import { cva, type VariantProps } from "class-variance-authority";
import { SpinnerIcon } from "@/components/ui/spinner-icon";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border border-transparent px-4 text-sm font-semibold leading-none transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-55 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        primary: "bg-accent text-accent-foreground shadow-sm hover:bg-accent/90",
        secondary: "border-border bg-surface text-text shadow-sm hover:bg-surface-muted/60",
        ghost: "border-transparent bg-transparent text-text hover:border-border/60 hover:bg-surface-muted"
      },
      size: {
        sm: "h-9 px-3",
        md: "h-10",
        lg: "h-11 px-5"
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
  href?: string;
  loading?: boolean;
  prefetch?: boolean;
  replace?: boolean;
  scroll?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement | HTMLAnchorElement, ButtonProps>(
  ({ children, className, href, loading = false, prefetch, replace, scroll, variant, size, ...props }, ref) => {
    const classes = cn(buttonVariants({ variant, size }), className);
    const content = (
      <>
        {loading ? <SpinnerIcon className="h-4 w-4" /> : null}
        <span className={cn("inline-flex items-center gap-2", loading ? "[&_svg]:opacity-0" : undefined)}>{children}</span>
      </>
    );

    if (typeof href === "string") {
      const isDisabled = Boolean(props.disabled || loading);
      const { disabled: _disabled, type: _type, value: _value, ...buttonishProps } = props;
      const linkProps = buttonishProps as Omit<React.ComponentProps<typeof Link>, "href">;

      return (
        <Link
          aria-busy={loading || undefined}
          aria-disabled={isDisabled || undefined}
          className={cn(classes, isDisabled ? "pointer-events-none opacity-55" : undefined)}
          href={href}
          prefetch={prefetch}
          ref={ref as React.Ref<HTMLAnchorElement>}
          replace={replace}
          scroll={scroll}
          tabIndex={isDisabled ? -1 : linkProps.tabIndex}
          {...linkProps}
        >
          {content}
        </Link>
      );
    }

    const { disabled, type = "button", ...buttonProps } = props;

    return (
      <button
        aria-busy={loading || undefined}
        className={classes}
        disabled={disabled || loading}
        ref={ref as React.Ref<HTMLButtonElement>}
        type={type}
        {...buttonProps}
      >
        {content}
      </button>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
