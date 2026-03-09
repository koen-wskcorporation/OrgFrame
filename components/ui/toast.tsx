"use client";

import * as React from "react";
import {
  AlertTriangle,
  Bell,
  CheckCircle2,
  Info,
  Lightbulb,
  Loader2,
  Undo2,
  X,
  XCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ToastType = "success" | "info" | "warning" | "error" | "loading" | "neutral" | "tip";
export type ToastVariant = ToastType | "destructive";

export type ToastAction = {
  label: string;
  onClick?: () => void;
  href?: string;
  closeOnClick?: boolean;
};

export type ToastAnchor = {
  x: number;
  y: number;
};

export type ToastOptions = {
  title: string;
  description?: string;
  meta?: string;
  details?: string;
  type?: ToastType;
  variant?: ToastVariant;
  duration?: number;
  sticky?: boolean;
  open?: boolean;
  compact?: boolean;
  expanded?: boolean;
  primaryAction?: ToastAction;
  secondaryAction?: ToastAction;
  undoAction?: ToastAction;
  onOpen?: () => void;
  anchor?: ToastAnchor;
  entityKind?: string;
  groupKey?: string;
  groupLabel?: string;
  groupWindowMs?: number;
  group?: boolean;
  actionLabel?: string;
  onAction?: () => void;
};

export type ToastUpdate = Partial<Omit<ToastOptions, "title">> & {
  title?: string;
  type?: ToastType;
  variant?: ToastVariant;
  open?: boolean;
};

type ToastItem = {
  id: string;
  type: ToastType;
  title: string;
  description?: string;
  meta?: string;
  durationMs: number | null;
  sticky: boolean;
  compact: boolean;
  expanded: boolean;
  primaryAction?: ToastAction;
  secondaryAction?: ToastAction;
  undoAction?: ToastAction;
  onOpen?: () => void;
  anchor?: ToastAnchor;
  groupKey?: string;
  groupLabel?: string;
  groupWindowMs: number;
  grouped: boolean;
  groupCount: number;
  baseTitle: string;
  entityKind?: string;
  timerKey: number;
  createdAt: number;
  updatedAt: number;
  open: boolean;
  dismissReason?: "manual" | "timeout" | "swipe" | "clear";
};

type ToastState = {
  toasts: ToastItem[];
};

type ToastStoreEvent =
  | {
      type: "add";
      toast: ToastOptions & { id?: string };
    }
  | {
      type: "update";
      id: string;
      patch: ToastUpdate;
    }
  | {
      type: "dismiss";
      id?: string;
      reason?: "manual" | "timeout" | "swipe" | "clear";
    }
  | {
      type: "clear";
    };

type ToastPromiseOptions<T> = {
  loading: ToastOptions;
  success: ToastOptions | ((value: T) => ToastOptions);
  error: ToastOptions | ((error: unknown) => ToastOptions);
};

type ToastApi = ((options: ToastOptions) => string) & {
  success: (options: Omit<ToastOptions, "type" | "variant">) => string;
  info: (options: Omit<ToastOptions, "type" | "variant">) => string;
  warning: (options: Omit<ToastOptions, "type" | "variant">) => string;
  error: (options: Omit<ToastOptions, "type" | "variant">) => string;
  loading: (options: Omit<ToastOptions, "type" | "variant">) => string;
  neutral: (options: Omit<ToastOptions, "type" | "variant">) => string;
  tip: (options: Omit<ToastOptions, "type" | "variant">) => string;
  update: (id: string, patch: ToastUpdate) => void;
  dismiss: (id?: string) => void;
  clearAll: () => void;
  promise: <T>(promise: Promise<T>, options: ToastPromiseOptions<T>) => Promise<T>;
};

type ToastContextValue = {
  toasts: ToastItem[];
  toast: ToastApi;
  dismiss: (id?: string) => void;
  clear: () => void;
};

const EXIT_ANIMATION_MS = 180;
const MAX_TOASTS = 6;
const DEFAULT_GROUP_WINDOW_MS = 2500;
const defaultTypeDuration: Record<ToastType, number | null> = {
  success: 4000,
  info: 5000,
  warning: null,
  error: null,
  loading: null,
  neutral: 5000,
  tip: 5000
};

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

function normalizeType(input?: ToastType | ToastVariant) {
  if (input === "destructive") {
    return "error" as const;
  }

  if (input === "success" || input === "info" || input === "warning" || input === "error" || input === "loading" || input === "tip") {
    return input;
  }

  return "neutral" as const;
}

function toTitleCase(value: string) {
  return value.slice(0, 1).toUpperCase() + value.slice(1).toLowerCase();
}

function buildGroupSignature(type: ToastType, options: ToastOptions) {
  const source = options.groupKey ?? `${options.entityKind ?? ""}:${options.title}:${options.description ?? ""}`;
  return `${type}:${source.trim().toLowerCase().replace(/\s+/g, " ")}`;
}

function buildGroupedTitle(baseTitle: string, count: number, groupLabel?: string) {
  if (groupLabel) {
    return `${count} ${groupLabel}`;
  }

  const words = baseTitle.trim().split(/\s+/);
  if (words.length > 1 && !words[0].toLowerCase().endsWith("s")) {
    words[0] = `${words[0]}s`;
  }
  return `${count} ${words.join(" ")}`;
}

function computeOriginOffset(anchor?: ToastAnchor) {
  if (!anchor || typeof window === "undefined") {
    return { x: 0, y: 12 };
  }

  const viewportX = window.innerWidth - 36;
  const viewportY = window.innerHeight - 36;
  const offsetX = Math.max(-42, Math.min(42, (anchor.x - viewportX) * 0.08));
  const offsetY = Math.max(-30, Math.min(30, (anchor.y - viewportY) * 0.08));

  return { x: offsetX, y: offsetY };
}

function normalizeOptions(options: ToastOptions & { id?: string }, now: number, previous?: ToastItem): ToastItem {
  const type = normalizeType(options.type ?? options.variant ?? previous?.type);
  const stickyByDefault = defaultTypeDuration[type] === null;
  const sticky = options.sticky ?? previous?.sticky ?? stickyByDefault;
  const explicitDuration = options.duration ?? previous?.durationMs;
  const durationMs = sticky ? null : explicitDuration ?? defaultTypeDuration[type];
  const primaryAction =
    options.primaryAction ??
    (options.actionLabel && options.onAction
      ? {
          label: options.actionLabel,
          onClick: options.onAction
        }
      : undefined) ??
    previous?.primaryAction;

  const secondaryAction = options.secondaryAction ?? previous?.secondaryAction;
  const undoAction = options.undoAction ?? previous?.undoAction;
  const meta = options.meta ?? options.details ?? previous?.meta;
  const hasActions = Boolean(primaryAction || secondaryAction || undoAction);
  const expanded = options.expanded ?? previous?.expanded ?? (type === "warning" || type === "error" || hasActions);
  const compact = options.compact ?? previous?.compact ?? (!expanded && !meta && !hasActions);
  const groupWindowMs = options.groupWindowMs ?? previous?.groupWindowMs ?? DEFAULT_GROUP_WINDOW_MS;
  const groupEnabled = options.group ?? previous?.grouped ?? ["success", "info", "tip", "neutral"].includes(type);
  const baseTitle = previous?.baseTitle ?? options.title;

  return {
    id: options.id ?? previous?.id ?? createToastId(),
    type,
    title: options.title ?? previous?.title ?? "Notification",
    description: options.description ?? previous?.description,
    meta,
    durationMs: durationMs ?? null,
    sticky,
    compact,
    expanded,
    primaryAction,
    secondaryAction,
    undoAction,
    onOpen: options.onOpen ?? previous?.onOpen,
    anchor: options.anchor ?? previous?.anchor,
    groupKey: options.groupKey ?? previous?.groupKey ?? buildGroupSignature(type, options),
    groupLabel: options.groupLabel ?? previous?.groupLabel,
    groupWindowMs,
    grouped: groupEnabled,
    groupCount: previous?.groupCount ?? 1,
    baseTitle,
    entityKind: options.entityKind ?? previous?.entityKind,
    timerKey: (previous?.timerKey ?? 0) + 1,
    createdAt: previous?.createdAt ?? now,
    updatedAt: now,
    open: options.open ?? previous?.open ?? true
  };
}

const variantStyles: Record<ToastType, { tint: string; iconTint: string; progressTint: string; ring: string }> = {
  info: {
    tint: "bg-accent/8",
    iconTint: "text-accent-foreground",
    progressTint: "bg-accent/45",
    ring: "ring-accent/35"
  },
  success: {
    tint: "bg-success/10",
    iconTint: "text-success",
    progressTint: "bg-success/65",
    ring: "ring-success/30"
  },
  warning: {
    tint: "bg-amber-500/10",
    iconTint: "text-amber-600 dark:text-amber-300",
    progressTint: "bg-amber-500/55",
    ring: "ring-amber-500/25"
  },
  error: {
    tint: "bg-destructive/10",
    iconTint: "text-destructive",
    progressTint: "bg-destructive/60",
    ring: "ring-destructive/25"
  },
  loading: {
    tint: "bg-accent/8",
    iconTint: "text-accent-foreground",
    progressTint: "bg-accent/45",
    ring: "ring-accent/25"
  },
  neutral: {
    tint: "bg-surface-muted/45",
    iconTint: "text-text-muted",
    progressTint: "bg-text-muted/35",
    ring: "ring-border"
  },
  tip: {
    tint: "bg-emerald-500/10",
    iconTint: "text-emerald-600 dark:text-emerald-300",
    progressTint: "bg-emerald-500/55",
    ring: "ring-emerald-500/25"
  }
};

function iconForType(type: ToastType) {
  if (type === "success") return CheckCircle2;
  if (type === "warning") return AlertTriangle;
  if (type === "error") return XCircle;
  if (type === "loading") return Loader2;
  if (type === "tip") return Lightbulb;
  if (type === "neutral") return Bell;
  return Info;
}

function reduceState(state: ToastState, event: ToastStoreEvent): ToastState {
  const now = Date.now();

  if (event.type === "add") {
    const normalized = normalizeOptions(event.toast, now);
    const groupedInto = state.toasts.find((item) => {
      if (!item.open || !item.grouped || !normalized.grouped) {
        return false;
      }
      if (item.groupKey !== normalized.groupKey || item.type !== normalized.type) {
        return false;
      }
      return now - item.updatedAt <= Math.min(item.groupWindowMs, normalized.groupWindowMs);
    });

    if (groupedInto) {
      const nextCount = groupedInto.groupCount + 1;
      const title = buildGroupedTitle(groupedInto.baseTitle, nextCount, groupedInto.groupLabel);

      const toasts = state.toasts.map((item) =>
        item.id === groupedInto.id
          ? {
              ...item,
              title,
              description: normalized.description ?? item.description,
              meta: normalized.meta ?? item.meta,
              groupCount: nextCount,
              updatedAt: now,
              timerKey: item.timerKey + 1
            }
          : item
      );

      return {
        ...state,
        toasts
      };
    }

    const nextToast: ToastItem = {
      ...normalized,
      anchor: normalized.anchor ? { ...normalized.anchor } : undefined
    };

    return {
      ...state,
      toasts: [nextToast, ...state.toasts].slice(0, MAX_TOASTS)
    };
  }

  if (event.type === "update") {
    const target = state.toasts.find((item) => item.id === event.id);
    if (!target) {
      return state;
    }

    const merged = normalizeOptions(
      {
        ...target,
        ...event.patch,
        title: event.patch.title ?? target.title
      },
      now,
      target
    );

    const toasts = state.toasts.map((item) => (item.id === event.id ? merged : item));
    return {
      ...state,
      toasts
    };
  }

  if (event.type === "dismiss") {
    return {
      ...state,
      toasts: state.toasts.map((toastItem) => {
        if (!event.id || event.id === toastItem.id) {
          return { ...toastItem, open: false, dismissReason: event.reason ?? "manual", updatedAt: now };
        }

        return toastItem;
      })
    };
  }

  if (event.type === "clear") {
    return {
      ...state,
      toasts: state.toasts.map((toastItem) => ({ ...toastItem, open: false, dismissReason: "clear", updatedAt: now }))
    };
  }

  return state;
}

function trimExitedToasts(toasts: ToastItem[]) {
  const now = Date.now();
  return toasts.filter((item) => item.open || now - item.updatedAt <= EXIT_ANIMATION_MS + 40);
}

function emitToast(options: ToastOptions) {
  const id = createToastId();

  dispatchToastEvent({
    type: "add",
    toast: { ...options, id }
  });

  return id;
}

function emitTypedToast(type: ToastType, options: Omit<ToastOptions, "type" | "variant">) {
  return emitToast({ ...options, type });
}

export function dismissToast(id?: string) {
  dispatchToastEvent({
    type: "dismiss",
    id,
    reason: "manual"
  });
}

export function clearToasts() {
  dispatchToastEvent({
    type: "clear"
  });
}

function updateToast(id: string, patch: ToastUpdate) {
  dispatchToastEvent({
    type: "update",
    id,
    patch
  });
}

function dismissToastWithReason(id: string, reason: "manual" | "timeout" | "swipe") {
  dispatchToastEvent({
    type: "dismiss",
    id,
    reason
  });
}

function buildToastApi(): ToastApi {
  const api = ((options: ToastOptions) => emitToast(options)) as ToastApi;
  api.success = (options) => emitTypedToast("success", options);
  api.info = (options) => emitTypedToast("info", options);
  api.warning = (options) => emitTypedToast("warning", options);
  api.error = (options) => emitTypedToast("error", options);
  api.loading = (options) => emitTypedToast("loading", options);
  api.neutral = (options) => emitTypedToast("neutral", options);
  api.tip = (options) => emitTypedToast("tip", options);
  api.update = updateToast;
  api.dismiss = dismissToast;
  api.clearAll = clearToasts;
  api.promise = async <T,>(promise: Promise<T>, options: ToastPromiseOptions<T>) => {
    const loadingId = api.loading(options.loading);
    try {
      const value = await promise;
      const successOptions = typeof options.success === "function" ? options.success(value) : options.success;
      api.update(loadingId, { ...successOptions, type: "success", sticky: false, open: true });
      return value;
    } catch (error) {
      const errorOptions = typeof options.error === "function" ? options.error(error) : options.error;
      api.update(loadingId, { ...errorOptions, type: "error", sticky: true, open: true });
      throw error;
    }
  };

  return api;
}

export const toast = buildToastApi();

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = React.useState<ToastState>({
    toasts: []
  });

  React.useEffect(() => {
    return subscribeToast((event) => {
      setState((current) => reduceState(current, event));
    });
  }, []);

  React.useEffect(() => {
    if (state.toasts.every((item) => item.open)) {
      return;
    }

    const timer = window.setTimeout(() => {
      setState((current) => ({
        ...current,
        toasts: trimExitedToasts(current.toasts)
      }));
    }, EXIT_ANIMATION_MS + 45);

    return () => {
      window.clearTimeout(timer);
    };
  }, [state.toasts]);

  const contextValue = React.useMemo<ToastContextValue>(() => {
    return {
      toasts: state.toasts,
      toast,
      dismiss: dismissToast,
      clear: clearToasts
    };
  }, [state.toasts]);

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      <ToastViewport toasts={contextValue.toasts} />
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

function usePrefersReducedMotion() {
  const [reduced, setReduced] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduced(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return reduced;
}

function ToastViewport({ toasts }: { toasts: ToastItem[] }) {
  const reducedMotion = usePrefersReducedMotion();

  return (
    <div className="pointer-events-none fixed inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] z-[80] flex flex-col gap-2 sm:inset-x-auto sm:bottom-6 sm:right-6 sm:w-[min(92vw,440px)]">
      {toasts.map((item) => (
        <ToastCard key={item.id} item={item} onDismiss={dismissToastWithReason} reducedMotion={reducedMotion} />
      ))}
    </div>
  );
}

function ToastCard({
  item,
  onDismiss,
  reducedMotion
}: {
  item: ToastItem;
  onDismiss: (id: string, reason: "manual" | "timeout" | "swipe") => void;
  reducedMotion: boolean;
}) {
  const style = variantStyles[item.type];
  const Icon = iconForType(item.type);
  const [paused, setPaused] = React.useState(false);
  const [progress, setProgress] = React.useState(0);
  const timeoutRef = React.useRef<number | null>(null);
  const rafRef = React.useRef<number | null>(null);
  const startedAtRef = React.useRef<number | null>(null);
  const remainingRef = React.useRef<number>(item.durationMs ?? 0);
  const [swipeX, setSwipeX] = React.useState(0);
  const [dragging, setDragging] = React.useState(false);
  const pointerIdRef = React.useRef<number | null>(null);
  const pointerStartXRef = React.useRef(0);
  const prefersCompact = item.compact && !item.expanded && !item.meta && !item.primaryAction && !item.secondaryAction && !item.undoAction;

  const clearTimers = React.useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const startTimer = React.useCallback(() => {
    if (paused || !item.open || item.durationMs === null || item.durationMs <= 0) {
      return;
    }

    clearTimers();
    startedAtRef.current = performance.now();

    const tick = () => {
      if (startedAtRef.current === null || item.durationMs === null || item.durationMs <= 0) {
        return;
      }
      const elapsed = Math.max(0, performance.now() - startedAtRef.current);
      const consumed = item.durationMs - Math.max(0, remainingRef.current - elapsed);
      setProgress(Math.max(0, Math.min(1, consumed / item.durationMs)));
      rafRef.current = window.requestAnimationFrame(tick);
    };

    const remaining = Math.max(0, remainingRef.current);
    timeoutRef.current = window.setTimeout(() => {
      onDismiss(item.id, "timeout");
    }, remaining);

    if (item.durationMs > 0) {
      rafRef.current = window.requestAnimationFrame(tick);
    }
  }, [clearTimers, item.durationMs, item.id, item.open, onDismiss, paused]);

  React.useEffect(() => {
    remainingRef.current = item.durationMs ?? 0;
    startedAtRef.current = null;
    setProgress(0);
    setPaused(false);
    setSwipeX(0);
  }, [item.timerKey, item.durationMs]);

  React.useEffect(() => {
    if (item.durationMs === null || paused || !item.open) {
      clearTimers();
      return;
    }
    startTimer();
    return clearTimers;
  }, [clearTimers, item.durationMs, item.open, paused, startTimer]);

  const pauseTimer = React.useCallback(() => {
    if (item.durationMs === null || paused) {
      return;
    }
    if (startedAtRef.current !== null) {
      const elapsed = Math.max(0, performance.now() - startedAtRef.current);
      remainingRef.current = Math.max(0, remainingRef.current - elapsed);
    }
    startedAtRef.current = null;
    clearTimers();
    setPaused(true);
  }, [clearTimers, item.durationMs, paused]);

  const resumeTimer = React.useCallback(() => {
    if (item.durationMs === null || !paused) {
      return;
    }
    setPaused(false);
  }, [item.durationMs, paused]);

  const isCritical = item.type === "error" || item.type === "warning";
  const origin = computeOriginOffset(item.anchor);
  const enterClass = reducedMotion
    ? item.open
      ? "opacity-100"
      : "opacity-0"
    : item.open
      ? "opacity-100 translate-y-0 scale-100"
      : "opacity-0 translate-y-2 scale-[0.98]";

  return (
    <section
      aria-live={isCritical ? "assertive" : "polite"}
      className={cn(
        "group pointer-events-auto relative overflow-hidden rounded-card border border-border/70 bg-surface/92 shadow-floating backdrop-blur-md ring-1 ring-inset transition-all",
        style.ring,
        enterClass,
        reducedMotion ? "duration-75" : "duration-200",
        dragging ? "select-none" : ""
      )}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
          resumeTimer();
        }
      }}
      onFocusCapture={pauseTimer}
      onMouseEnter={pauseTimer}
      onMouseLeave={resumeTimer}
      onPointerCancel={() => {
        pointerIdRef.current = null;
        setDragging(false);
        setSwipeX(0);
      }}
      onPointerDown={(event) => {
        const target = event.target as HTMLElement;
        if (target.closest("button,a")) {
          return;
        }
        if (event.pointerType === "mouse" && window.innerWidth > 767) {
          return;
        }
        pointerIdRef.current = event.pointerId;
        pointerStartXRef.current = event.clientX;
        setDragging(true);
        setSwipeX(0);
      }}
      onPointerMove={(event) => {
        if (pointerIdRef.current !== event.pointerId) {
          return;
        }
        const delta = event.clientX - pointerStartXRef.current;
        setSwipeX(delta);
      }}
      onPointerUp={(event) => {
        if (pointerIdRef.current !== event.pointerId) {
          return;
        }
        const threshold = Math.max(80, Math.min(140, window.innerWidth * 0.22));
        const shouldDismiss = Math.abs(swipeX) >= threshold;
        pointerIdRef.current = null;
        setDragging(false);
        if (shouldDismiss) {
          onDismiss(item.id, "swipe");
          setSwipeX(0);
          return;
        }
        setSwipeX(0);
      }}
      role={isCritical ? "alert" : "status"}
      style={{
        transform: reducedMotion
          ? `translate3d(${swipeX}px,0,0)`
          : `translate3d(${swipeX + (item.open ? 0 : origin.x)}px,${item.open ? 0 : origin.y}px,0)`,
        opacity: dragging ? Math.max(0.5, 1 - Math.abs(swipeX) / 240) : undefined
      }}
      tabIndex={0}
    >
      {item.durationMs !== null && item.durationMs > 0 ? (
        <div className="absolute inset-x-0 top-0 h-0.5 bg-border/40">
          <span
            className={cn("block h-full w-full origin-left will-change-transform", style.progressTint)}
            style={{ transform: `scaleX(${Math.max(0.01, 1 - progress)})` }}
          />
        </div>
      ) : null}

      <div className={cn("flex items-start gap-3 p-3.5 sm:p-4", prefersCompact ? "sm:items-center" : "")}>
        <span className={cn("mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full", style.tint)}>
          <Icon className={cn("h-4 w-4", style.iconTint, item.type === "loading" ? "animate-spin" : "")} />
        </span>

        <div className="min-w-0 flex-1 space-y-1">
          <p className={cn("truncate text-sm font-semibold text-text", !item.expanded ? "sm:text-[0.95rem]" : "sm:text-base")}>{item.title}</p>
          {item.description ? <p className="line-clamp-3 text-sm text-text-muted">{item.description}</p> : null}
          {item.meta ? <p className="truncate text-xs font-medium uppercase tracking-wide text-text-muted">{item.meta}</p> : null}

          {item.primaryAction || item.secondaryAction || item.undoAction ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {item.primaryAction ? (
                <ActionButton
                  action={item.primaryAction}
                  onPress={() => {
                    item.primaryAction?.onClick?.();
                    if (item.primaryAction?.closeOnClick !== false) {
                      onDismiss(item.id, "manual");
                    }
                  }}
                  variant="secondary"
                />
              ) : null}
              {item.secondaryAction ? (
                <ActionButton
                  action={item.secondaryAction}
                  onPress={() => {
                    item.secondaryAction?.onClick?.();
                    if (item.secondaryAction?.closeOnClick !== false) {
                      onDismiss(item.id, "manual");
                    }
                  }}
                  variant="ghost"
                />
              ) : null}
              {item.undoAction ? (
                <ActionButton
                  action={{ ...item.undoAction, label: item.undoAction.label || "Undo" }}
                  icon={<Undo2 className="h-3.5 w-3.5" />}
                  onPress={() => {
                    item.undoAction?.onClick?.();
                    if (item.undoAction?.closeOnClick !== false) {
                      onDismiss(item.id, "manual");
                    }
                  }}
                  variant="ghost"
                />
              ) : null}
            </div>
          ) : null}
        </div>

        <button
          aria-label={`Dismiss ${toTitleCase(item.type)} notification`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-text-muted transition hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onDismiss(item.id, "manual")}
          type="button"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

function ActionButton({
  action,
  onPress,
  variant,
  icon
}: {
  action: ToastAction;
  onPress: () => void;
  variant: "secondary" | "ghost";
  icon?: React.ReactNode;
}) {
  if (action.href) {
    return (
      <Button className="h-8 rounded-full px-3 text-xs" href={action.href} size="sm" variant={variant}>
        {icon}
        {action.label}
      </Button>
    );
  }

  return (
    <Button className="h-8 rounded-full px-3 text-xs" onClick={onPress} size="sm" variant={variant}>
      {icon}
      {action.label}
    </Button>
  );
}
