"use client";

import * as React from "react";
import { AddressAutocompleteInput, type SelectedPlace } from "@orgframe/ui/primitives/address-autocomplete-input";
import { GoogleMapLayer } from "@orgframe/ui/primitives/google-map-layer";

export type LocationValue = {
  lat: number;
  lng: number;
  address: string;
};

type LocationPickerProps = {
  value: LocationValue | null;
  onChange: (value: LocationValue) => void;
  /** When the user types but hasn't picked a prediction yet. */
  searchText?: string;
  onSearchTextChange?: (value: string) => void;
  heightClass?: string;
  disabled?: boolean;
};

const DEFAULT_CENTER = { lat: 39.8283, lng: -98.5795 };
const DEFAULT_ZOOM = 4;
const PICKED_ZOOM = 19;

export function LocationPicker({
  value,
  onChange,
  searchText,
  onSearchTextChange,
  heightClass = "h-[320px]",
  disabled
}: LocationPickerProps) {
  const [internalSearch, setInternalSearch] = React.useState(value?.address ?? "");
  const search = searchText ?? internalSearch;
  const setSearch = (next: string) => {
    if (onSearchTextChange) onSearchTextChange(next);
    else setInternalSearch(next);
  };

  const mapRef = React.useRef<any>(null);
  const markerRef = React.useRef<any>(null);
  const clickListenerRef = React.useRef<any>(null);

  function handleMapReady(rawMap: unknown) {
    const map = rawMap as any;
    mapRef.current = map;
    if (clickListenerRef.current?.remove) clickListenerRef.current.remove();
    clickListenerRef.current = map.addListener("click", (event: any) => {
      const lat = event.latLng?.lat?.();
      const lng = event.latLng?.lng?.();
      if (typeof lat === "number" && typeof lng === "number") {
        onChange({ lat, lng, address: value?.address ?? search });
      }
    });
    if (value) ensureMarker(map, value);
  }

  function ensureMarker(map: any, position: { lat: number; lng: number }) {
    const google = (window as Window & { google?: any }).google;
    if (!map || !google?.maps?.Marker) return;
    if (markerRef.current) {
      markerRef.current.setPosition(position);
      return;
    }
    const marker = new google.maps.Marker({ map, position, draggable: true });
    marker.addListener("dragend", () => {
      const pos = marker.getPosition();
      if (!pos) return;
      onChange({ lat: pos.lat(), lng: pos.lng(), address: value?.address ?? search });
    });
    markerRef.current = marker;
  }

  React.useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    if (!value) {
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      return;
    }
    ensureMarker(map, value);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value?.lat, value?.lng]);

  React.useEffect(() => {
    return () => {
      if (clickListenerRef.current?.remove) clickListenerRef.current.remove();
      clickListenerRef.current = null;
      if (markerRef.current) {
        markerRef.current.setMap(null);
        markerRef.current = null;
      }
      mapRef.current = null;
    };
  }, []);

  function handlePlaceSelected(place: SelectedPlace) {
    setSearch(place.description);
    if (place.location) {
      onChange({ lat: place.location.lat, lng: place.location.lng, address: place.description });
    }
  }

  const center = value ?? DEFAULT_CENTER;
  const zoom = value ? PICKED_ZOOM : DEFAULT_ZOOM;

  return (
    <div className="space-y-3">
      <AddressAutocompleteInput
        disabled={disabled}
        onChange={setSearch}
        onSelectPlace={handlePlaceSelected}
        placeholder="Search an address or place"
        value={search}
      />
      <div className={`${heightClass} overflow-hidden rounded-card border bg-canvas`}>
        <GoogleMapLayer center={center} mapTypeId="hybrid" onMapReady={handleMapReady} passive={false} zoom={zoom} />
      </div>
      {value ? (
        <p className="text-xs text-text-muted">
          Selected: {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
        </p>
      ) : (
        <p className="text-xs text-text-muted">Click the map or pick a search result to place the marker.</p>
      )}
    </div>
  );
}
