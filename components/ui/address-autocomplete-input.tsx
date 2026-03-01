"use client";

import * as React from "react";
import { MapPin, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { loadGooglePlacesApi } from "@/lib/google-maps/loadPlacesApi";

type AddressAutocompleteInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  apiKey?: string;
};

type PlacesPrediction = {
  description: string;
  placeId: string;
};

function normalizePredictions(predictions: any[] | null | undefined): PlacesPrediction[] {
  if (!Array.isArray(predictions)) {
    return [];
  }

  return predictions
    .map((item) => {
      if (!item || typeof item !== "object") {
        return null;
      }

      const description = typeof item.description === "string" ? item.description : "";
      const placeId = typeof item.place_id === "string" ? item.place_id : "";

      if (!description || !placeId) {
        return null;
      }

      return {
        description,
        placeId
      } satisfies PlacesPrediction;
    })
    .filter((item): item is PlacesPrediction => Boolean(item))
    .slice(0, 6);
}

export function AddressAutocompleteInput({
  className,
  value,
  onChange,
  disabled,
  placeholder = "Start typing an address",
  apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  ...props
}: AddressAutocompleteInputProps) {
  const [predictions, setPredictions] = React.useState<PlacesPrediction[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
  const [isReady, setIsReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const autocompleteServiceRef = React.useRef<any>(null);
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    if (!apiKey || disabled) {
      return;
    }

    let isMounted = true;

    loadGooglePlacesApi(apiKey)
      .then(() => {
        if (!isMounted) {
          return;
        }

        const googleValue = (window as Window & { google?: any }).google;

        if (!googleValue?.maps?.places?.AutocompleteService) {
          setLoadError("Address autocomplete unavailable right now.");
          return;
        }

        autocompleteServiceRef.current = new googleValue.maps.places.AutocompleteService();
        setIsReady(true);
      })
      .catch(() => {
        if (!isMounted) {
          return;
        }

        setLoadError("Address autocomplete unavailable right now.");
      });

    return () => {
      isMounted = false;
    };
  }, [apiKey, disabled]);

  React.useEffect(() => {
    if (!isReady || !value.trim()) {
      setPredictions([]);
      setIsOpen(false);
      return;
    }

    const service = autocompleteServiceRef.current;
    if (!service?.getPlacePredictions) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timer = window.setTimeout(() => {
      const googleValue = (window as Window & { google?: any }).google;
      const okStatus = googleValue?.maps?.places?.PlacesServiceStatus?.OK;

      const applyResults = (results: any[] | null, status: string) => {
        if (requestIdRef.current !== requestId) {
          return;
        }

        if (status !== okStatus || !results) {
          setPredictions([]);
          setIsOpen(false);
          setActiveIndex(-1);
          return;
        }

        const normalized = normalizePredictions(results);
        setPredictions(normalized);
        setIsOpen(normalized.length > 0);
        setActiveIndex(-1);
      };

      const fallbackRequest = {
        input: value.trim()
      };

      service.getPlacePredictions(
        {
          input: value.trim(),
          types: ["address"]
        },
        (results: any[] | null, status: string) => {
          if (requestIdRef.current !== requestId) {
            return;
          }

          const normalized = normalizePredictions(results);
          if (status === okStatus && normalized.length > 0) {
            setPredictions(normalized);
            setIsOpen(true);
            setActiveIndex(-1);
            return;
          }

          // Fallback to broader place suggestions (parks, facilities, venues).
          service.getPlacePredictions(fallbackRequest, applyResults);
        }
      );
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isReady, value]);

  React.useEffect(() => {
    if (!isOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;

      if (target && rootRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    };

    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [isOpen]);

  function applyPrediction(prediction: PlacesPrediction) {
    onChange(prediction.description);
    setPredictions([]);
    setIsOpen(false);
    setActiveIndex(-1);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!isOpen || predictions.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => {
        const next = current + 1;
        return next >= predictions.length ? 0 : next;
      });
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => {
        const next = current - 1;
        return next < 0 ? predictions.length - 1 : next;
      });
      return;
    }

    if (event.key === "Enter") {
      if (activeIndex < 0 || activeIndex >= predictions.length) {
        return;
      }

      event.preventDefault();
      applyPrediction(predictions[activeIndex]);
      return;
    }

    if (event.key === "Escape") {
      setIsOpen(false);
    }
  }

  const showPredictions = isOpen && predictions.length > 0 && !disabled;

  return (
    <div className="space-y-1" ref={rootRef}>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
        <input
          {...props}
          className={cn(
            "flex h-10 w-full rounded-control border bg-surface pl-9 pr-3 py-2 text-sm text-text placeholder:text-text-muted",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
            "disabled:cursor-not-allowed disabled:opacity-55",
            className
          )}
          disabled={disabled}
          onChange={(event) => {
            onChange(event.target.value);
          }}
          onFocus={() => {
            if (predictions.length > 0) {
              setIsOpen(true);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          value={value}
        />

        {showPredictions ? (
          <div className="absolute z-30 mt-1 w-full rounded-control border bg-surface shadow-card">
            {predictions.map((prediction, index) => (
              <button
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-text",
                  "hover:bg-surface-muted",
                  index === activeIndex ? "bg-surface-muted" : null
                )}
                key={prediction.placeId}
                onClick={() => applyPrediction(prediction)}
                type="button"
              >
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                <span className="min-w-0 truncate">{prediction.description}</span>
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {loadError ? <p className="text-xs text-text-muted">{loadError}</p> : null}
    </div>
  );
}
