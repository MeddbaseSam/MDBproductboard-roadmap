/**
 * useProductBoard.js
 *
 * Fetches features, teams, and custom field values directly from the
 * ProductBoard public API (no proxy required — PB supports CORS for
 * browser requests authenticated with a Bearer token).
 *
 * Strategy:
 *  1. Fetch all custom field definitions to find "Customer Value Proposition"
 *  2. Fetch all features (paginated)
 *  3. For each feature, fetch its custom field values (batched, 5 at a time)
 *  4. Merge everything and return enriched feature objects
 */

import { useState, useCallback } from "react";

const PB_API = "https://api.productboard.com";

// ─── Generic fetch helper ────────────────────────────────────────────────────

async function pbFetch(apiToken, path) {
  const res = await fetch(`${PB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "X-Version": "1",
    },
  });

  if (!res.ok) {
    let errMsg = `ProductBoard API error ${res.status} on ${path}`;
    try {
      const body = await res.json();
      const detail = body.errors?.[0]?.detail || body.message;
      if (detail) errMsg += `: ${detail}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return res.json();
}

// ─── Custom field helpers ────────────────────────────────────────────────────

/**
 * Find the ID of the custom field named "Customer Value Proposition".
 * Returns null if not found (graceful — the card just won't show it).
 */
async function findCVPFieldId(apiToken) {
  try {
    const res = await pbFetch(apiToken, "/custom-fields?limit=200");
    const fields = res.data ?? [];
    const match = fields.find(
      (f) => f.name?.toLowerCase().trim() === "customer value proposition"
    );
    return match?.id ?? null;
  } catch (_) {
    // Non-fatal — carry on without the custom field
    return null;
  }
}

/**
 * Fetch the Customer Value Proposition value for a single feature.
 * Returns a string or null.
 */
async function fetchCVPForFeature(apiToken, featureId, cvpFieldId) {
  if (!cvpFieldId) return null;
  try {
    const res = await pbFetch(
      apiToken,
      `/features/${featureId}/custom-fields/${cvpFieldId}`
    );
    // The value lives at data.value (text fields) or data.options (dropdown)
    const val = res.data?.value;
    if (typeof val === "string") return val.trim() || null;
    // Dropdown / multi-select
    if (Array.isArray(res.data?.options)) {
      return res.data.options.map((o) => o.label).join(", ") || null;
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ─── Feature fetching ────────────────────────────────────────────────────────

async function fetchAllFeatures(apiToken, onProgress) {
  const features = [];
  let cursor = null;
  let page = 1;

  do {
    onProgress(`Fetching features (page ${page})…`);
    let path = "/features?sort=name&limit=100";
    if (cursor) path += `&pageCursor=${encodeURIComponent(cursor)}`;

    const response = await pbFetch(apiToken, path);
    if (Array.isArray(response.data)) features.push(...response.data);

    // PB returns a full URL in links.next; extract just the cursor param
    const nextUrl = response.links?.next;
    cursor = nextUrl
      ? new URL(nextUrl).searchParams.get("pageCursor")
      : null;

    page++;
  } while (cursor);

  return features;
}

// ─── Batch enrichment ────────────────────────────────────────────────────────

/**
 * Enrich features with CVP custom field values.
 * Runs CONCURRENCY fetches at a time to avoid hammering the API.
 */
async function enrichWithCVP(apiToken, features, cvpFieldId, onProgress) {
  if (!cvpFieldId) return features;

  const CONCURRENCY = 5;
  const enriched = [...features];

  for (let i = 0; i < enriched.length; i += CONCURRENCY) {
    const batch = enriched.slice(i, i + CONCURRENCY);
    onProgress(
      `Loading custom fields (${Math.min(i + CONCURRENCY, enriched.length)} / ${enriched.length})…`
    );

    const values = await Promise.all(
      batch.map((f) => fetchCVPForFeature(apiToken, f.id, cvpFieldId))
    );

    values.forEach((val, idx) => {
      enriched[i + idx] = { ...enriched[i + idx], _cvp: val };
    });
  }

  return enriched;
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function useProductBoard() {
  const [state, setState] = useState({
    status: "idle", // idle | loading | success | error
    features: [],
    error: null,
    progress: "",
  });

  const load = useCallback(async (apiToken) => {
    setState({ status: "loading", features: [], error: null, progress: "Connecting…" });

    try {
      // Step 1: find the CVP field ID
      setState((s) => ({ ...s, progress: "Looking up custom fields…" }));
      const cvpFieldId = await findCVPFieldId(apiToken);

      // Step 2: fetch all features
      const rawFeatures = await fetchAllFeatures(apiToken, (msg) => {
        setState((s) => ({ ...s, progress: msg }));
      });

      // Step 3: enrich with CVP values
      const features = await enrichWithCVP(apiToken, rawFeatures, cvpFieldId, (msg) => {
        setState((s) => ({ ...s, progress: msg }));
      });

      setState({ status: "success", features, error: null, progress: "" });
    } catch (err) {
      setState({ status: "error", features: [], error: err.message, progress: "" });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", features: [], error: null, progress: "" });
  }, []);

  return { ...state, load, reset };
}
