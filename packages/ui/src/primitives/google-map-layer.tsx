"use client";

import * as React from "react";
import { loadGooglePlacesApi } from "./load-google-places-api";
import { cn } from "./utils";

export type GoogleMapLayerProps = {
  apiKey?: string;
  /** Map center in lat/lng. */
  center: { lat: number; lng: number };
  /** Map zoom level (Google Maps integer; floats accepted). */
  zoom: number;
  className?: string;
  /** Map type. Defaults to satellite for outdoor facility imagery. */
  mapTypeId?: "satellite" | "hybrid" | "roadmap" | "terrain";
  /** Disables all user interactions on the map (canvas above drives it). */
  passive?: boolean;
  /** Children render inside the wrapper, on top of the map. */
  children?: React.ReactNode;
  /** Tilt; satellite default is 0 (top-down). */
  tilt?: number;
  /** Fires once with the underlying google.maps.Map instance. */
  onMapReady?: (map: unknown) => void;
};

/**
 * Imperative Google Maps layer. Controlled by `center` + `zoom` props; the
 * underlying map is mutated via setCenter/setZoom rather than re-mounted.
 * Default: passive (no user input), satellite, top-down. Compose another
 * element on top to capture interaction.
 */
export function GoogleMapLayer({
  apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY,
  center,
  zoom,
  className,
  mapTypeId = "satellite",
  passive = true,
  tilt = 0,
  onMapReady,
  children
}: GoogleMapLayerProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const mapRef = React.useRef<any>(null);
  const [ready, setReady] = React.useState(false);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!apiKey) {
      setLoadError("Missing Google Maps API key.");
      return;
    }
    let cancelled = false;
    loadGooglePlacesApi(apiKey)
      .then(() => {
        if (cancelled) return;
        const google = (window as Window & { google?: any }).google;
        if (!google?.maps?.Map || !containerRef.current) return;
        const map = new google.maps.Map(containerRef.current, {
          center,
          zoom,
          mapTypeId,
          disableDefaultUI: true,
          clickableIcons: false,
          keyboardShortcuts: !passive,
          draggable: !passive,
          scrollwheel: !passive,
          zoomControl: !passive,
          gestureHandling: passive ? "none" : "auto",
          tilt,
          // Critical for the satellite raster layer — without this Google rounds
          // zoom to integers and overlays sourced from a continuously-zooming
          // canvas drift relative to the imagery between integer zoom levels.
          isFractionalZoomEnabled: true
        });
        mapRef.current = map;
        setReady(true);
        onMapReady?.(map);
      })
      .catch(() => {
        if (cancelled) return;
        setLoadError("Couldn't load satellite imagery.");
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiKey]);

  // Latest center kept in a ref so the ResizeObserver (mounted once) can
  // re-center to the current value without re-attaching on every prop change.
  const centerRef = React.useRef(center);
  centerRef.current = center;

  // useLayoutEffect so the imperative map mutation is committed in the same
  // frame as the React render — minimizes the lag between the canvas (which
  // updates synchronously via SVG viewBox) and the map underneath.
  React.useLayoutEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setCenter(center);
  }, [ready, center.lat, center.lng]);

  React.useLayoutEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setZoom(zoom);
  }, [ready, zoom]);

  React.useEffect(() => {
    if (!ready || !mapRef.current) return;
    mapRef.current.setMapTypeId(mapTypeId);
  }, [ready, mapTypeId]);

  // Google Maps doesn't auto-redraw when its container resizes (e.g. popup
  // enter animations or panel toggles). One-time observer; pulls latest center
  // from the ref so we don't re-attach on every prop change.
  React.useEffect(() => {
    if (!ready || !mapRef.current || !containerRef.current) return;
    const google = (window as Window & { google?: any }).google;
    const map = mapRef.current;
    function refresh() {
      if (!google?.maps?.event) return;
      google.maps.event.trigger(map, "resize");
      map.setCenter(centerRef.current);
    }
    const observer = new ResizeObserver(() => refresh());
    observer.observe(containerRef.current);
    refresh();
    return () => observer.disconnect();
  }, [ready]);

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div className="absolute inset-0" ref={containerRef} />
      {loadError ? (
        <div className="pointer-events-none absolute inset-x-0 top-3 mx-auto w-fit rounded-control border bg-surface px-3 py-1.5 text-xs text-text-muted shadow-sm">
          {loadError}
        </div>
      ) : null}
      {children}
    </div>
  );
}
