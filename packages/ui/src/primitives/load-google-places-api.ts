"use client";

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-places-script";

let loadingPromise: Promise<void> | null = null;

export function loadGooglePlacesApi(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Places API can only be loaded in a browser."));
  }

  const googleValue = (window as Window & { google?: any }).google;
  if (googleValue?.maps?.places) {
    return Promise.resolve();
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = new Promise<void>((resolve, reject) => {
    const existing = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    const completeIfReady = () => {
      const loadedGoogle = (window as Window & { google?: any }).google;
      if (loadedGoogle?.maps?.places) {
        resolve();
        return true;
      }

      return false;
    };

    if (existing) {
      if (!completeIfReady()) {
        existing.addEventListener("load", () => {
          if (completeIfReady()) {
            return;
          }

          reject(new Error("Google Places API failed to initialize."));
        });
        existing.addEventListener("error", () => reject(new Error("Failed to load Google Places API script.")));
      }
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.async = true;
    script.defer = true;
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&libraries=places`;
    script.addEventListener("load", () => {
      if (completeIfReady()) {
        return;
      }

      reject(new Error("Google Places API failed to initialize."));
    });
    script.addEventListener("error", () => reject(new Error("Failed to load Google Places API script.")));
    document.head.appendChild(script);
  }).catch((error) => {
    loadingPromise = null;
    throw error;
  });

  return loadingPromise;
}
