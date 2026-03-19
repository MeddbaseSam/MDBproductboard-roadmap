/**
 * useProductBoard.js
 *
 * Fetches features via the Vercel serverless proxy at /api/productboard.
 * The ProductBoard API token lives in Vercel's environment — the browser
 * never sees it. No token input required from users.
 */

import { useState, useCallback } from "react";

// ─── Generic fetch via proxy ──────────────────────────────────────────────────

async function pbFetch(pbPath) {
  const url = `/api/productboard?path=${encodeURIComponent(pbPath)}`;
  const res = await fetch(url);

  if (!res.ok) {
    let errMsg = `ProductBoard API error ${res.status}`;
    try {
      const body = await res.json();
      const detail = body.errors?.[0]?.detail || body.error || body.message;
      if (detail) errMsg += `: ${detail}`;
    } catch (_) {}
    throw new Error(errMsg);
  }

  return res.json();
}

// ─── Custom field helpers ─────────────────────────────────────────────────────

async function findCVPFieldId() {
  try {
    const res = await pbFetch("/custom-fields?limit=200");
    const fields = res.data ?? [];
    const match = fields.find(
      (f) => f.name?.toLowerCase().trim() === "customer value proposition"
    );
    return match?.id ?? null;
  } catch (_) {
    return null;
  }
}

async function fetchCVPForFeature(featureId, cvpFieldId) {
  if (!cvpFieldId) return null;
  try {
    const res = await pbFetch(`/features/${featureId}/custom-fields/${cvpFieldId}`);
    const val = res.data?.value;
    if (typeof val === "string") return val.trim() || null;
    if (Array.isArray(res.data?.options)) {
      return res.data.options.map((o) => o.label).join(", ") || null;
    }
    return null;
  } catch (_) {
    return null;
  }
}

// ─── Feature fetching ─────────────────────────────────────────────────────────

async function fetchAllFeatures(onProgress) {
  const features = [];
  let cursor = null;
  let page = 1;

  do {
    onProgress(`Fetching features (page ${page})…`);
    let path = "/features";
    if (cursor) path += `&pageCursor=${encodeURIComponent(cursor)}`;

    const response = await pbFetch(path);
    if (Array.isArray(response.data)) features.push(...response.data);

    const nextUrl = response.links?.next;
    cursor = nextUrl
      ? new URL(nextUrl).searchParams.get("pageCursor")
      : null;

    page++;
  } while (cursor);

  return features;
}

// ─── CVP enrichment ───────────────────────────────────────────────────────────

async function enrichWithCVP(features, cvpFieldId, onProgress) {
  if (!cvpFieldId) return features;

  const CONCURRENCY = 5;
  const enriched = [...features];

  for (let i = 0; i < enriched.length; i += CONCURRENCY) {
    const batch = enriched.slice(i, i + CONCURRENCY);
    onProgress(
      `Loading custom fields (${Math.min(i + CONCURRENCY, enriched.length)} / ${enriched.length})…`
    );
    const values = await Promise.all(
      batch.map((f) => fetchCVPForFeature(f.id, cvpFieldId))
    );
    values.forEach((val, idx) => {
      enriched[i + idx] = { ...enriched[i + idx], _cvp: val };
    });
  }

  return enriched;
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProductBoard() {
  const [state, setState] = useState({
    status: "idle",
    features: [],
    error: null,
    progress: "",
  });

  const load = useCallback(async () => {
    setState({ status: "loading", features: [], error: null, progress: "Connecting…" });

    try {
      setState((s) => ({ ...s, progress: "Looking up custom fields…" }));
      const cvpFieldId = await findCVPFieldId();

      const rawFeatures = await fetchAllFeatures((msg) => {
        setState((s) => ({ ...s, progress: msg }));
      });

      const features = await enrichWithCVP(rawFeatures, cvpFieldId, (msg) => {
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
