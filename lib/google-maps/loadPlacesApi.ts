let placesApiPromise: Promise<void> | null = null;

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-places-script";

function hasPlacesApi() {
  if (typeof window === "undefined") {
    return false;
  }

  const googleValue = (window as Window & { google?: any }).google;
  return Boolean(googleValue?.maps?.places?.AutocompleteService);
}

function buildScriptUrl(apiKey: string) {
  const params = new URLSearchParams({
    key: apiKey,
    libraries: "places",
    loading: "async",
    v: "weekly"
  });

  return `https://maps.googleapis.com/maps/api/js?${params.toString()}`;
}

export function loadGooglePlacesApi(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Places API can only be loaded in the browser."));
  }

  if (!apiKey) {
    return Promise.reject(new Error("Missing Google Maps API key."));
  }

  if (hasPlacesApi()) {
    return Promise.resolve();
  }

  if (placesApiPromise) {
    return placesApiPromise;
  }

  placesApiPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;

    if (existingScript) {
      existingScript.addEventListener("load", () => {
        if (hasPlacesApi()) {
          resolve();
          return;
        }

        reject(new Error("Google Places API did not initialize."));
      });

      existingScript.addEventListener("error", () => {
        reject(new Error("Failed to load Google Places API script."));
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = buildScriptUrl(apiKey);
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (hasPlacesApi()) {
        resolve();
        return;
      }

      reject(new Error("Google Places API did not initialize."));
    };
    script.onerror = () => {
      reject(new Error("Failed to load Google Places API script."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    placesApiPromise = null;
    throw error;
  });

  return placesApiPromise;
}
