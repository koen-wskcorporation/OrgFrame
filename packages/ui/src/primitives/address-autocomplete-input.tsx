"use client";

import * as React from "react";
import { MapPin, Search } from "lucide-react";
import { cn } from "./utils";
import { loadGooglePlacesApi } from "./load-google-places-api";

export type SelectedPlace = {
  /** Free-text description as shown in the predictions list. */
  description: string;
  /** Google `place_id` for downstream lookups (Details / Photos). */
  placeId: string;
  /** Resolved geometry — undefined if Places Details lookup failed. */
  location?: { lat: number; lng: number };
};

type AddressAutocompleteInputProps = Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  /**
   * Fires once per selected prediction with the resolved geometry attached
   * when the Places Details lookup succeeds. Use this when the caller needs
   * lat/lng (e.g. dropping a marker on a map). For pure text input, use
   * `onChange`.
   */
  onSelectPlace?: (place: SelectedPlace) => void;
  apiKey?: string;
  /**
   * Override the Google Places Autocomplete `types` parameter. Defaults to
   * `["address"]`. Pass `["establishment"]` to bias toward businesses /
   * schools / churches / venues. When set, the secondary fallback request
   * is skipped — the caller's filter is honored exactly.
   */
  types?: string[];
};

type PlacesPrediction = {
  description: string;
  placeId: string;
};

export function AddressAutocompleteInput({
  className,
  value,
  onChange,
  onSelectPlace,
  disabled,
  placeholder = "Start typing an address",
  apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  types,
  ...props
}: AddressAutocompleteInputProps) {
  // The new AutocompleteSuggestion API requires `includedPrimaryTypes` to be
  // real Place primary types — the legacy `"address"` table-of-contents value
  // is rejected. Default to no filter so all suggestions surface; callers can
  // narrow with the `types` prop (e.g. `["establishment"]` for schools).
  const resolvedTypes = types ?? [];
  const allowFallback = false;
  const [predictions, setPredictions] = React.useState<PlacesPrediction[]>([]);
  const [isOpen, setIsOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState<number>(-1);
  const [isReady, setIsReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement | null>(null);
  const autocompleteSuggestionRef = React.useRef<any>(null);
  // Suggestions retain a `toPlace()` callback that we need when the user
  // picks a prediction, so cache the live objects alongside the rendered
  // shape. Reset on every fetch.
  const suggestionByIdRef = React.useRef<Map<string, any>>(new Map());
  const requestIdRef = React.useRef(0);
  const sessionTokenRef = React.useRef<any>(null);

  React.useEffect(() => {
    if (!apiKey || disabled) {
      return;
    }

    let isMounted = true;

    loadGooglePlacesApi(apiKey)
      .then(async () => {
        if (!isMounted) {
          return;
        }

        const googleValue = (window as Window & { google?: any }).google;

        try {
          // Always go through importLibrary — when the script was already
          // loaded the global `google.maps.places` namespace can be present
          // but missing the new `AutocompleteSuggestion` class until the
          // dynamic import completes. importLibrary is idempotent.
          const placesLib = googleValue?.maps?.importLibrary
            ? await googleValue.maps.importLibrary("places")
            : googleValue?.maps?.places ?? null;

          if (!placesLib?.AutocompleteSuggestion) {
            setLoadError("Address autocomplete unavailable right now.");
            return;
          }

          autocompleteSuggestionRef.current = placesLib.AutocompleteSuggestion;
          if (placesLib.AutocompleteSessionToken) {
            sessionTokenRef.current = new placesLib.AutocompleteSessionToken();
          }
          setIsReady(true);
        } catch {
          if (isMounted) {
            setLoadError("Address autocomplete unavailable right now.");
          }
        }
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

    const AutocompleteSuggestion = autocompleteSuggestionRef.current;
    if (!AutocompleteSuggestion?.fetchAutocompleteSuggestions) {
      return;
    }

    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    const timer = window.setTimeout(() => {
      const fetchSuggestions = async (typesForRequest: string[] | undefined) => {
        const request: Record<string, unknown> = { input: value.trim() };
        if (typesForRequest && typesForRequest.length > 0) {
          request.includedPrimaryTypes = typesForRequest;
        }
        if (sessionTokenRef.current) {
          request.sessionToken = sessionTokenRef.current;
        }
        const response = await AutocompleteSuggestion.fetchAutocompleteSuggestions(request);
        return Array.isArray(response?.suggestions) ? response.suggestions : [];
      };

      (async () => {
        try {
          let suggestions = await fetchSuggestions(resolvedTypes);
          if (suggestions.length === 0 && allowFallback) {
            suggestions = await fetchSuggestions(undefined);
          }
          if (requestIdRef.current !== requestId) return;

          const map = new Map<string, any>();
          const normalized: PlacesPrediction[] = [];
          for (const suggestion of suggestions) {
            const prediction = suggestion?.placePrediction;
            const placeId = prediction?.placeId;
            const text =
              typeof prediction?.text?.toString === "function"
                ? prediction.text.toString()
                : (prediction?.text ?? "");
            if (!placeId || !text) continue;
            map.set(placeId, suggestion);
            normalized.push({ description: text, placeId });
            if (normalized.length >= 6) break;
          }

          suggestionByIdRef.current = map;
          setPredictions(normalized);
          setIsOpen(normalized.length > 0);
          setActiveIndex(-1);
        } catch {
          if (requestIdRef.current !== requestId) return;
          setPredictions([]);
          setIsOpen(false);
          setActiveIndex(-1);
        }
      })();
    }, 220);

    return () => {
      window.clearTimeout(timer);
    };
    // resolvedTypes is derived from types; key the effect on the joined string
    // so identity-changing array literals don't retrigger needlessly.
  }, [isReady, value, resolvedTypes.join("|"), allowFallback]);

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

    if (!onSelectPlace) return;

    // Resolve geometry via the new Place class so callers (location pickers
    // etc.) can drop a marker. Fail silently — callers still get the
    // description-only `SelectedPlace` and can degrade gracefully.
    const suggestion = suggestionByIdRef.current.get(prediction.placeId);
    const placePrediction = suggestion?.placePrediction;
    if (!placePrediction || typeof placePrediction.toPlace !== "function") {
      onSelectPlace({ description: prediction.description, placeId: prediction.placeId });
      return;
    }

    (async () => {
      try {
        const place = placePrediction.toPlace();
        await place.fetchFields({ fields: ["location", "displayName", "formattedAddress"] });
        const location = place.location;
        if (location && typeof location.lat === "function" && typeof location.lng === "function") {
          onSelectPlace({
            description: prediction.description,
            placeId: prediction.placeId,
            location: { lat: location.lat(), lng: location.lng() }
          });
          return;
        }
      } catch {
        // fall through to description-only callback below
      }
      onSelectPlace({ description: prediction.description, placeId: prediction.placeId });
    })();
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
            "flex h-10 w-full rounded-control border border-border bg-surface py-2 pl-9 pr-3 text-sm text-text shadow-[inset_0_1px_0_hsl(var(--canvas)/0.35)] placeholder:text-text-muted",
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
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-control border bg-surface shadow-floating">
            {predictions.map((prediction, index) => (
              <button
                className={cn(
                  "flex w-full items-start gap-2 px-3 py-2 text-left text-sm text-text transition-colors",
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
