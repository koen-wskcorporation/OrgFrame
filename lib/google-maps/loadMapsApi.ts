let mapsApiPromise: Promise<void> | null = null;

const GOOGLE_MAPS_SCRIPT_ID = "google-maps-core-script";
const GOOGLE_MAPS_READY_TIMEOUT_MS = 10_000;

function hasMapsApi() {
  if (typeof window === "undefined") {
    return false;
  }

  const googleValue = (window as Window & { google?: any }).google;
  return Boolean(googleValue?.maps?.Map || googleValue?.maps?.importLibrary);
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

async function ensureMapsConstructorsLoaded() {
  const googleValue = (window as Window & { google?: any }).google;
  if (!googleValue?.maps?.importLibrary) {
    return;
  }

  // Newer Maps API loading can expose importLibrary before constructors are attached.
  await googleValue.maps.importLibrary("maps");
  await googleValue.maps.importLibrary("places");
}

function waitForMapsApiReady(timeoutMs = GOOGLE_MAPS_READY_TIMEOUT_MS): Promise<void> {
  const startedAt = Date.now();

  return new Promise<void>((resolve, reject) => {
    const tick = async () => {
      try {
        if (hasMapsApi()) {
          await ensureMapsConstructorsLoaded();
          if (hasMapsApi()) {
            resolve();
            return;
          }
        }
      } catch {
        // Keep waiting until timeout.
      }

      if (Date.now() - startedAt >= timeoutMs) {
        reject(new Error("Google Maps API did not initialize."));
        return;
      }

      window.setTimeout(() => {
        void tick();
      }, 50);
    };

    void tick();
  });
}

export function loadGoogleMapsApi(apiKey: string): Promise<void> {
  if (typeof window === "undefined") {
    return Promise.reject(new Error("Google Maps API can only be loaded in the browser."));
  }

  if (!apiKey) {
    return Promise.reject(new Error("Missing Google Maps API key."));
  }

  if (hasMapsApi()) {
    return Promise.resolve();
  }

  if (mapsApiPromise) {
    return mapsApiPromise;
  }

  mapsApiPromise = new Promise<void>((resolve, reject) => {
    const existingScript = document.getElementById(GOOGLE_MAPS_SCRIPT_ID) as HTMLScriptElement | null;
    const resolveWhenReady = () => {
      waitForMapsApiReady()
        .then(() => resolve())
        .catch((error) => {
          reject(error);
        });
    };

    if (existingScript) {
      if (existingScript.dataset.loaded === "true") {
        resolveWhenReady();
        return;
      }

      existingScript.addEventListener("load", () => {
        existingScript.dataset.loaded = "true";
        resolveWhenReady();
      });

      existingScript.addEventListener("error", () => {
        reject(new Error("Failed to load Google Maps API script."));
      });
      return;
    }

    const script = document.createElement("script");
    script.id = GOOGLE_MAPS_SCRIPT_ID;
    script.src = buildScriptUrl(apiKey);
    script.async = true;
    script.defer = true;
    script.onload = () => {
      script.dataset.loaded = "true";
      resolveWhenReady();
    };
    script.onerror = () => {
      reject(new Error("Failed to load Google Maps API script."));
    };
    document.head.appendChild(script);
  }).catch((error) => {
    mapsApiPromise = null;
    throw error;
  });

  return mapsApiPromise;
}
