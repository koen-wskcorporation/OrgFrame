/**
 * SAM2 (Segment Anything 2) automatic segmentation via Replicate, with
 * click-point selection layered on top.
 *
 * The `meta/sam-2` Replicate model runs SAM2 in automatic mode — it returns
 * every distinct object it can find as a separate mask. To turn that into
 * "click → outline this thing", we:
 *   1. send the image to SAM2
 *   2. download every returned mask
 *   3. find every mask whose pixel at the user's click is "inside"
 *   4. pick the smallest one (most specific) — outer / parent masks tend to
 *      be much larger and we'd rather give the user the tight field outline
 *      than the whole stadium polygon.
 *
 * Branding: surfaced as "AI" in the UI. SAM2 is a vision foundation model
 * from Meta — calling it AI is honest, not marketing.
 *
 * Configuration:
 *   - REPLICATE_API_TOKEN (required)
 *   - REPLICATE_SAM2_MODEL (optional) — `owner/name:version`. Default is
 *     `meta/sam-2:fe97b...` (image automatic mask generation).
 */

import sharp from "sharp";

const REPLICATE_API_BASE = "https://api.replicate.com/v1";
const POLL_INTERVAL_MS = 1_500;
const MAX_POLL_MS = 180_000;
const DEFAULT_VERSION =
  "meta/sam-2:fe97b453a6455861e3bac769b441ca1f1086110da7466dbb65cf1eecfd60dc83";

type PredictionStatus = "starting" | "processing" | "succeeded" | "failed" | "canceled";

type Prediction = {
  id: string;
  status: PredictionStatus;
  output?: unknown;
  error?: string | null;
  urls?: { get?: string };
};

/**
 * Run SAM2 against an image and return the mask PNG that best matches the
 * user's click point.
 *
 * @param imageDataUri - data URI (`data:image/png;base64,...`) or HTTPS URL
 * @param clickX       - x in image pixels (0..imageWidth)
 * @param clickY       - y in image pixels (0..imageHeight)
 */
export async function runSam2Click(input: {
  imageDataUri: string;
  imageWidth: number;
  imageHeight: number;
  clickX: number;
  clickY: number;
}): Promise<{ mask: Buffer; maskWidth: number; maskHeight: number }> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) {
    throw new Error("REPLICATE_API_TOKEN is not configured.");
  }

  const modelSpec = (process.env.REPLICATE_SAM2_MODEL?.trim() || DEFAULT_VERSION).trim();

  const body = buildCreateBody(modelSpec, input.imageDataUri);
  const createUrl = createEndpointFor(modelSpec);

  const create = await fetch(createUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      Prefer: "wait=10"
    },
    body: JSON.stringify(body)
  });

  if (!create.ok) {
    const text = await create.text();
    throw new Error(`Replicate create failed (${create.status}): ${text.slice(0, 400)}`);
  }

  let prediction = (await create.json()) as Prediction;
  const startedAt = Date.now();
  while (prediction.status !== "succeeded" && prediction.status !== "failed" && prediction.status !== "canceled") {
    if (Date.now() - startedAt > MAX_POLL_MS) {
      throw new Error("SAM2 timed out.");
    }
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    const getUrl = prediction.urls?.get ?? `${REPLICATE_API_BASE}/predictions/${prediction.id}`;
    const next = await fetch(getUrl, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!next.ok) {
      throw new Error(`Replicate poll failed (${next.status}).`);
    }
    prediction = (await next.json()) as Prediction;
  }

  if (prediction.status !== "succeeded") {
    throw new Error(prediction.error || `SAM2 ${prediction.status}.`);
  }

  const maskUrls = collectMaskUrls(prediction.output);
  if (maskUrls.length === 0) {
    throw new Error("SAM2 returned no masks.");
  }

  return await pickBestMaskForClick(maskUrls, input.clickX, input.clickY, input.imageWidth, input.imageHeight);
}

/**
 * Build the request body. If the model spec includes a `:version` suffix we
 * use the global predictions endpoint with `version` in the body; otherwise
 * the path-based endpoint accepts the bare owner/name.
 */
function buildCreateBody(modelSpec: string, imageDataUri: string): Record<string, unknown> {
  const input: Record<string, unknown> = {
    image: imageDataUri,
    // Higher points_per_side gives SAM2 more chances to emit the multi-scale
    // nested masks (e.g. infield ⊂ field ⊂ park), which we union below.
    points_per_side: 32,
    pred_iou_thresh: 0.82,
    stability_score_thresh: 0.9,
    use_m2m: true
  };

  if (modelSpec.includes(":")) {
    return { version: modelSpec.split(":")[1], input };
  }
  return { input };
}

function createEndpointFor(modelSpec: string): string {
  if (modelSpec.includes(":")) {
    return `${REPLICATE_API_BASE}/predictions`;
  }
  return `${REPLICATE_API_BASE}/models/${modelSpec}/predictions`;
}

/**
 * Walk the prediction output and collect every PNG/JPEG URL that looks like a
 * mask. Different SAM2 wrappers return different shapes — accept all of them.
 */
function collectMaskUrls(output: unknown): string[] {
  const urls: string[] = [];
  const visit = (node: unknown) => {
    if (typeof node === "string") {
      if (/^https?:\/\//.test(node)) urls.push(node);
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) visit(item);
      return;
    }
    if (node && typeof node === "object") {
      // Prefer the per-mask list if present; the combined mask is a single
      // colored composite that can't be flood-filled cleanly.
      const obj = node as Record<string, unknown>;
      if (Array.isArray(obj.individual_masks)) {
        visit(obj.individual_masks);
        return;
      }
      for (const value of Object.values(obj)) visit(value);
    }
  };
  visit(output);
  return urls;
}

/**
 * Download every candidate mask, decode each, and pick the smallest mask whose
 * pixel at the click point is "inside". Smallest-containing-mask is the right
 * heuristic for nested SAM2 outputs (e.g. infield ⊂ field ⊂ stadium).
 */
async function pickBestMaskForClick(
  maskUrls: string[],
  clickXImage: number,
  clickYImage: number,
  imageWidth: number,
  imageHeight: number
): Promise<{ mask: Buffer; maskWidth: number; maskHeight: number }> {
  const candidates = await Promise.all(
    maskUrls.map(async (url, idx) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return null;
        const buf = Buffer.from(await res.arrayBuffer());
        // extractChannel(0) hard-forces single-byte-per-pixel output regardless
        // of input mode; previous attempts hit ambiguity where sharp would
        // keep alpha or RGB even after `.grayscale()`.
        const decoded = await sharp(buf)
          .ensureAlpha()
          .extractChannel(0)
          .toColourspace("b-w")
          .raw()
          .toBuffer({ resolveWithObject: true });
        const w = decoded.info.width;
        const h = decoded.info.height;
        if (w === 0 || h === 0) return null;
        // SAM2 commonly downscales the input (e.g. 1024 long edge). Scale the
        // click point from input-image space into mask space.
        const px = Math.max(0, Math.min(w - 1, Math.round((clickXImage / imageWidth) * w)));
        const py = Math.max(0, Math.min(h - 1, Math.round((clickYImage / imageHeight) * h)));
        const valueAtClick = decoded.data[py * w + px] ?? 0;
        let whiteArea = 0;
        for (let i = 0; i < w * h; i += 1) {
          if ((decoded.data[i] ?? 0) > 128) whiteArea += 1;
        }
        // Some SAM2 wrappers ship masks as black-on-white instead of
        // white-on-black. Detect by majority and treat the minority colour as
        // "inside". We re-encode the buffer as a normalized white-on-black PNG
        // so downstream tracing has a consistent contract.
        const whiteIsInside = whiteArea < w * h * 0.5;
        const insideAtClick = whiteIsInside ? valueAtClick > 128 : valueAtClick <= 128;
        // Build a normalized binary buffer: 255 for inside, 0 for outside.
        // We do this for every mask (not just containing ones) because the
        // adjacency-growth pass below needs sibling masks too.
        const normalized = Buffer.alloc(w * h);
        let area = 0;
        for (let i = 0; i < w * h; i += 1) {
          const v = decoded.data[i] ?? 0;
          const inside = whiteIsInside ? v > 128 : v <= 128;
          if (inside) {
            normalized[i] = 255;
            area += 1;
          }
        }
        const normalizedPng = await sharp(normalized, { raw: { width: w, height: h, channels: 1 } })
          .png()
          .toBuffer();
        return { idx, w, h, valueAtClick, whiteIsInside, contains: insideAtClick, area, mask: normalizedPng } as const;
      } catch (err) {
        console.error("[sam2] mask decode failed:", err);
        return null;
      }
    })
  );

  const valid = candidates.filter((c): c is NonNullable<typeof c> => c !== null);
  console.info(
    `[sam2] received ${maskUrls.length} masks; ${valid.length} decoded; ` +
      `${valid.filter((c) => c.contains).length} contain click ` +
      `(${Math.round(clickXImage)}, ${Math.round(clickYImage)} of ${imageWidth}x${imageHeight}).`
  );
  if (valid.length === 0) {
    throw new Error("Could not decode any SAM2 mask.");
  }
  const containing = valid.filter((c) => c.contains && "mask" in c);
  if (containing.length === 0) {
    const sample = valid.slice(0, 4).map((c) => `[${c.idx}] ${c.w}x${c.h} val=${c.valueAtClick} whiteInside=${c.whiteIsInside}`).join("; ");
    throw new Error(`No SAM2 mask contained the clicked point. ${valid.length} masks: ${sample}`);
  }
  const first = containing[0]!;
  const w = first.w;
  const h = first.h;
  const imagePixels = w * h;
  const cap = imagePixels * 0.5;

  // Decode every "with mask" candidate to a binary array up front. Used by
  // both the seed union and the adjacency growth pass below.
  const decoded = await Promise.all(
    valid
      .filter((c) => "mask" in c && c.w === w && c.h === h)
      .map(async (c) => {
        const bytes = await sharp((c as { mask: Buffer }).mask).extractChannel(0).raw().toBuffer();
        const bin = new Uint8Array(w * h);
        let area = 0;
        for (let i = 0; i < w * h; i += 1) {
          if ((bytes[i] ?? 0) > 128) {
            bin[i] = 1;
            area += 1;
          }
        }
        return { idx: c.idx, contains: c.contains, bin, area };
      })
  );

  // Seed: union of every containing mask (under cap).
  const union = new Uint8Array(w * h);
  let unionArea = 0;
  const used = new Set<number>();
  for (const d of decoded) {
    if (!d.contains) continue;
    if (d.area > cap) continue;
    used.add(d.idx);
    for (let i = 0; i < w * h; i += 1) {
      if (d.bin[i] && !union[i]) {
        union[i] = 1;
        unionArea += 1;
      }
    }
  }
  if (unionArea === 0) {
    // Fallback: take the smallest containing mask even if it exceeds the cap.
    const smallest = [...containing].sort((a, b) => a.area - b.area)[0]!;
    const bytes = await sharp((smallest as { mask: Buffer }).mask).extractChannel(0).raw().toBuffer();
    for (let i = 0; i < w * h; i += 1) if ((bytes[i] ?? 0) > 128) union[i] = 1;
  }

  // Adjacency growth: any sibling mask that shares a substantial border with
  // the current union gets absorbed. This catches the "outfield grass" +
  // "infield dirt" split where SAM2 didn't emit a parent envelope.
  const ADJACENCY_RATIO = 0.25; // 25% of a sibling's perimeter touching union → merge
  const ADJACENCY_MIN_PIXELS = 40;
  let grew = true;
  let passes = 0;
  while (grew && passes < 6) {
    grew = false;
    passes += 1;
    for (const d of decoded) {
      if (used.has(d.idx)) continue;
      if (d.area > cap) continue;
      if (unionArea + d.area > cap) continue;
      const { perimeter, touching } = countAdjacency(d.bin, union, w, h);
      if (perimeter === 0) continue;
      if (touching < ADJACENCY_MIN_PIXELS) continue;
      if (touching / perimeter < ADJACENCY_RATIO) continue;
      used.add(d.idx);
      grew = true;
      for (let i = 0; i < w * h; i += 1) {
        if (d.bin[i] && !union[i]) {
          union[i] = 1;
          unionArea += 1;
        }
      }
    }
  }

  console.info(
    `[sam2] union seeded from ${
      decoded.filter((d) => d.contains && d.area <= cap).length
    } containing mask(s); grew to ${used.size} via adjacency in ${passes} pass(es); ` +
      `final area=${Math.round((unionArea / imagePixels) * 100)}%.`
  );

  const out = Buffer.alloc(w * h);
  for (let i = 0; i < w * h; i += 1) out[i] = union[i] ? 255 : 0;
  const unionPng = await sharp(out, { raw: { width: w, height: h, channels: 1 } })
    .png()
    .toBuffer();
  return { mask: unionPng, maskWidth: w, maskHeight: h };
}

/**
 * For a candidate binary mask `cand` and the current `union` mask (both at
 * w*h size, 0/1 values), return:
 *   - perimeter: number of cand pixels with at least one outside neighbor
 *   - touching:  number of cand boundary pixels whose outside neighbor is
 *                inside the union
 *
 * touching/perimeter is the fraction of cand's perimeter that's "stuck to"
 * the existing union, used to decide whether to merge.
 */
function countAdjacency(cand: Uint8Array, union: Uint8Array, w: number, h: number): { perimeter: number; touching: number } {
  let perimeter = 0;
  let touching = 0;
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const idx = y * w + x;
      if (!cand[idx]) continue;
      const neighbors = [
        x > 0 ? idx - 1 : -1,
        x < w - 1 ? idx + 1 : -1,
        y > 0 ? idx - w : -1,
        y < h - 1 ? idx + w : -1
      ];
      let isPerimeter = false;
      let touchesUnion = false;
      for (const n of neighbors) {
        if (n < 0) {
          isPerimeter = true;
          continue;
        }
        if (!cand[n]) {
          isPerimeter = true;
          if (union[n]) touchesUnion = true;
        }
      }
      if (isPerimeter) perimeter += 1;
      if (touchesUnion) touching += 1;
    }
  }
  return { perimeter, touching };
}
