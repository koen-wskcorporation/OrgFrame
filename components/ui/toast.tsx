"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ToastVariant = "info" | "success" | "warning" | "destructive";

export type ToastOptions = {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
  actionLabel?: string;
  onAction?: () => void;
};

type ToastItem = ToastOptions & {
  id: string;
  createdAt: number;
  open: boolean;
};

type ToastStoreEvent =
  | {
      type: "add";
      toast: ToastItem;
    }
  | {
      type: "dismiss";
      id?: string;
    }
  | {
      type: "clear";
    };

type ToastContextValue = {
  toasts: ToastItem[];
  toast: (options: ToastOptions) => string;
  dismiss: (id?: string) => void;
  clear: () => void;
};

const DEFAULT_DURATION_MS = 4500;
const EXIT_ANIMATION_MS = 220;
const MAX_TOASTS = 5;

const toastListeners = new Set<(event: ToastStoreEvent) => void>();
const ToastContext = React.createContext<ToastContextValue | null>(null);

function createToastId() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function dispatchToastEvent(event: ToastStoreEvent) {
  toastListeners.forEach((listener) => {
    listener(event);
  });
}

function subscribeToast(listener: (event: ToastStoreEvent) => void) {
  toastListeners.add(listener);

  return () => {
    toastListeners.delete(listener);
  };
}

const variantStyles: Record<ToastVariant, { accent: string; badge: string }> = {
  info: {
    accent: "bg-accent/45",
    badge: "text-accent-foreground"
  },
  success: {
    accent: "bg-success/45",
    badge: "text-success"
  },
  warning: {
    accent: "bg-accent/35",
    badge: "text-accent-foreground"
  },
  destructive: {
    accent: "bg-destructive/45",
    badge: "text-destructive"
  }
};

function reduceToasts(toasts: ToastItem[], event: ToastStoreEvent) {
  if (event.type === "add") {
    return [event.toast, ...toasts].slice(0, MAX_TOASTS);
  }

  if (event.type === "dismiss") {
    return toasts.map((toast) => {
      if (!event.id || event.id === toast.id) {
        return { ...toast, open: false };
      }

      return toast;
    });
  }

  return [];
}

export function toast(options: ToastOptions) {
  const id = createToastId();

  dispatchToastEvent({
    type: "add",
    toast: {
      id,
      createdAt: Date.now(),
      open: true,
      variant: "info",
      duration: DEFAULT_DURATION_MS,
      ...options
    }
  });

  return id;
}

export function dismissToast(id?: string) {
  dispatchToastEvent({
    type: "dismiss",
    id
  });
}

export function clearToasts() {
  dispatchToastEvent({
    type: "clear"
  });
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    return subscribeToast((event) => {
      setToasts((current) => reduceToasts(current, event));
    });
  }, []);

  React.useEffect(() => {
    const closeTimers = toasts
      .filter((item) => item.open && (item.duration ?? DEFAULT_DURATION_MS) > 0)
      .map((item) => {
        const duration = item.duration ?? DEFAULT_DURATION_MS;

        return window.setTimeout(() => {
          dismissToast(item.id);
        }, duration);
      });

    return () => {
      closeTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, [toasts]);

  React.useEffect(() => {
    const removeTimers = toasts
      .filter((item) => !item.open)
      .map((item) =>
        window.setTimeout(() => {
          setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id));
        }, EXIT_ANIMATION_MS)
      );

    return () => {
      removeTimers.forEach((timerId) => {
        window.clearTimeout(timerId);
      });
    };
  }, [toasts]);

  const contextValue = React.useMemo<ToastContextValue>(() => {
    return {
      toasts,
      toast,
      dismiss: dismissToast,
      clear: clearToasts
    };
  }, [toasts]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastViewport toasts={toasts} />
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = React.useContext(ToastContext);

  if (!context) {
    throw new Error("useToast must be used within ToastProvider.");
  }

  return context;
}

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(92vw,420px)]">
      {toasts.map((item) => {
        const variant = item.variant ?? "info";
        const variantStyle = variantStyles[variant];

        return (
          <section
            aria-live={variant === "destructive" ? "assertive" : "polite"}
            className={cn(
              "pointer-events-auto relative overflow-hidden rounded-card border bg-surface p-4 shadow-card transition-all duration-200",
              item.open ? "translate-y-0 opacity-100" : "translate-y-2 opacity-0"
            )}
            key={item.id}
            role={variant === "destructive" ? "alert" : "status"}
          >
            <span className={cn("absolute inset-y-0 left-0 w-1", variantStyle.accent)} />

            <div className="space-y-3 pl-3">
              <div className="space-y-1">
                <p className={cn("text-xs font-semibold tracking-wide", variantStyle.badge)}>{variant}</p>
                <p className="text-sm font-semibold text-text">{item.title}</p>
                {item.description ? <p className="text-sm text-text-muted">{item.description}</p> : null}
              </div>

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
                {item.actionLabel && item.onAction ? (
                  <Button
                    className="w-full sm:w-auto"
                    onClick={() => {
                      item.onAction?.();
                      dismissToast(item.id);
                    }}
                    size="sm"
                    variant="secondary"
                  >
                    {item.actionLabel}
                  </Button>
                ) : null}

                <Button className="w-full sm:ml-auto sm:w-auto" onClick={() => dismissToast(item.id)} size="sm" variant="ghost">
                  Dismiss
                </Button>
              </div>
            </div>
          </section>
        );
      })}
    </div>
  );
}
