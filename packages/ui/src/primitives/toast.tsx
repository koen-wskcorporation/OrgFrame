"use client";

import * as React from "react";
import { AlertTriangle, CheckCircle2, Info, X, XCircle } from "lucide-react";
import { Button } from "@orgframe/ui/primitives/button";
import { cn } from "./utils";

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
  | { type: "add"; toast: ToastItem }
  | { type: "dismiss"; id?: string }
  | { type: "clear" };

type ToastContextValue = {
  toasts: ToastItem[];
  toast: (options: ToastOptions) => string;
  dismiss: (id?: string) => void;
  clear: () => void;
};

const DEFAULT_DURATION_MS = 4500;
const EXIT_ANIMATION_MS = 180;
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
  toastListeners.forEach((listener) => listener(event));
}

function subscribeToast(listener: (event: ToastStoreEvent) => void) {
  toastListeners.add(listener);
  return () => {
    toastListeners.delete(listener);
  };
}

const variantStyles: Record<
  ToastVariant,
  { icon: React.ComponentType<{ className?: string }>; iconColor: string; progress: string; ring: string }
> = {
  info: {
    icon: Info,
    iconColor: "text-accent",
    progress: "bg-accent",
    ring: "ring-accent/20"
  },
  success: {
    icon: CheckCircle2,
    iconColor: "text-success",
    progress: "bg-success",
    ring: "ring-success/20"
  },
  warning: {
    icon: AlertTriangle,
    iconColor: "text-warning",
    progress: "bg-warning",
    ring: "ring-warning/20"
  },
  destructive: {
    icon: XCircle,
    iconColor: "text-destructive",
    progress: "bg-destructive",
    ring: "ring-destructive/25"
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
  dispatchToastEvent({ type: "dismiss", id });
}

export function clearToasts() {
  dispatchToastEvent({ type: "clear" });
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastItem[]>([]);

  React.useEffect(() => {
    return subscribeToast((event) => {
      setToasts((current) => reduceToasts(current, event));
    });
  }, []);

  React.useEffect(() => {
    const removeTimers = toasts
      .filter((item) => !item.open)
      .map((item) =>
        window.setTimeout(() => {
          setToasts((current) => current.filter((toastItem) => toastItem.id !== item.id));
        }, EXIT_ANIMATION_MS)
      );

    return () => {
      removeTimers.forEach((timerId) => window.clearTimeout(timerId));
    };
  }, [toasts]);

  const contextValue = React.useMemo<ToastContextValue>(
    () => ({
      toasts,
      toast,
      dismiss: dismissToast,
      clear: clearToasts
    }),
    [toasts]
  );

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
    <div className="pointer-events-none fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[1300] flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(92vw,380px)]">
      <style>{`@keyframes orgframe-toast-progress { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
      {toasts.map((item) => (
        <ToastRow item={item} key={item.id} />
      ))}
    </div>
  );
}

function ToastRow({ item }: { item: ToastItem }) {
  const variant = item.variant ?? "info";
  const style = variantStyles[variant];
  const Icon = style.icon;
  const duration = item.duration ?? DEFAULT_DURATION_MS;

  const [paused, setPaused] = React.useState(false);
  const remainingRef = React.useRef(duration);
  const startRef = React.useRef<number>(Date.now());
  const timerRef = React.useRef<number | null>(null);

  const clearTimer = React.useCallback(() => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    if (!item.open || duration <= 0) {
      clearTimer();
      return;
    }

    if (paused) {
      if (timerRef.current !== null) {
        remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startRef.current));
        clearTimer();
      }
      return;
    }

    startRef.current = Date.now();
    timerRef.current = window.setTimeout(() => {
      dismissToast(item.id);
    }, remainingRef.current);

    return clearTimer;
  }, [paused, item.open, item.id, duration, clearTimer]);

  const hasAction = Boolean(item.actionLabel && item.onAction);

  return (
    <section
      aria-live={variant === "destructive" ? "assertive" : "polite"}
      className={cn(
        "pointer-events-auto group relative overflow-hidden rounded-2xl border border-border/60 bg-surface/95 shadow-floating ring-1 backdrop-blur-md",
        "transition-all duration-[180ms] ease-out",
        style.ring,
        item.open
          ? "translate-x-0 translate-y-0 scale-100 opacity-100"
          : "translate-x-2 translate-y-0 scale-[0.98] opacity-0"
      )}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      role={variant === "destructive" ? "alert" : "status"}
    >
      {duration > 0 && item.open ? (
        <span
          aria-hidden="true"
          className={cn(
            "absolute inset-x-0 top-0 h-[2px] origin-right",
            style.progress,
            "group-hover:[animation-play-state:paused] group-focus-within:[animation-play-state:paused]"
          )}
          style={{
            animation: `orgframe-toast-progress ${duration}ms linear forwards`
          }}
        />
      ) : null}

      <div className="flex items-center gap-2.5 px-3 py-2.5">
        <Icon className={cn("h-4 w-4 shrink-0", style.iconColor)} aria-hidden="true" />

        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-semibold leading-tight text-text">{item.title}</p>
          {item.description ? (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-text-muted">{item.description}</p>
          ) : null}

          {hasAction ? (
            <div className="mt-2 flex">
              <Button
                className="h-7 px-2.5 text-[12px]"
                onClick={() => {
                  item.onAction?.();
                  dismissToast(item.id);
                }}
                size="sm"
                variant="secondary"
              >
                {item.actionLabel}
              </Button>
            </div>
          ) : null}
        </div>

        <Button
          iconOnly
          aria-label="Dismiss"
          className="-mr-1 h-7 w-7 opacity-60 transition-opacity hover:opacity-100"
          onClick={() => dismissToast(item.id)}
        >
          <X />
        </Button>
      </div>
    </section>
  );
}
