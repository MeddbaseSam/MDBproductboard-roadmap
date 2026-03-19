/**
 * useProductBoard.js
 *
 * Uses ProductBoard API v1.
 *
 * Fetches:
 *  1. All releases (GET /releases)
 *  2. All feature-release assignments (GET /feature-release-assignments)
 *  3. All features (GET /features)
 *  4. The "Customer Value Proposition" custom field ID, then values per feature
 *
 * Returns { releases, features } where each feature has _releaseId attached.
 * The UI groups features by release and renders one column per release.
 */

import { useState, useCallback } from "react";

// ─── Generic v1 fetch via proxy ───────────────────────────────────────────────

async function pbFetch(path) {
  const url = `/api/productboard?path=${encodeURIComponent(path)}`;
  const res = await fetch(url);
  if (!res.ok) {
    let msg = `ProductBoard API error ${res.status}`;
    try {
      const body = await res.json();
      const detail = body.errors?.[0]?.detail || body.error || body.message;
      if (detail) msg += `: ${detail}`;
    } catch (_) {}
    throw new Error(msg);
  }
  return res.json();
}

// ─── Paginated fetch — follows links.next automatically ──────────────────────

async function fetchAllPages(firstPath, onProgress, label) {
  const items = [];
  let nextUrl = firstPath;
  let page = 1;

  while (nextUrl) {
    if (onProgress) onProgress(`Fetching ${label} (page ${page})...`);
    const response = await pbFetch(nextUrl);
    const data = response.data ?? [];
    items.push(...data);

    // links.next is a full URL — extract just the path+query for the proxy
    const next = response.links?.next;
    if (next) {
      try {
        const parsed = new URL(next);
        nextUrl = parsed.pathname + parsed.search;
      } catch (_) {
        nextUrl = null;
      }
    } else {
      nextUrl = null;
    }
    page++;
  }

  return items;
}

// ─── Custom field helpers ─────────────────────────────────────────────────────

async function findCVPFieldId() {
  try {
    const res = await pbFetch("/custom-fields");
    const fields = res.data ?? [];
    const match = fields.find(
      (f) => f.name?.toLowerCase().trim() === "customer value proposition"
    );
    return match?.id ?? null;
  } catch (_) {
    return null;
  }
}

async function fetchCVPValues(cvpFieldId) {
  // Returns a map of { [featureId]: value }
  if (!cvpFieldId) return {};
  try {
    const items = await fetchAllPages(
      `/custom-fields/${cvpFieldId}/values`,
      null,
      "custom field values"
    );
    const map = {};
    for (const item of items) {
      const featureId = item.feature?.id ?? item.featureId;
      if (featureId) {
        map[featureId] = item.value ?? null;
      }
    }
    return map;
  } catch (_) {
    return {};
  }
}

// ─── Main load function ───────────────────────────────────────────────────────

async function loadAll(onProgress) {
  // Step 1: fetch releases, feature-release assignments, features, CVP field — parallel where possible
  onProgress("Looking up releases and custom fields...");

  const [releases, cvpFieldId] = await Promise.all([
    fetchAllPages("/releases", null, "releases"),
    findCVPFieldId(),
  ]);

  // Step 2: fetch features and release assignments in parallel
  const [features, assignments] = await Promise.all([
    fetchAllPages("/features", onProgress, "features"),
    fetchAllPages("/feature-release-assignments", null, "release assignments"),
  ]);

  // Step 3: fetch CVP values
  onProgress("Loading custom field values...");
  const cvpMap = await fetchCVPValues(cvpFieldId);

  // Step 4: build a map of featureId -> releaseId from assignments
  const featureReleaseMap = {};
  for (const a of assignments) {
    const featureId = a.feature?.id ?? a.featureId;
    const releaseId = a.release?.id ?? a.releaseId;
    if (featureId && releaseId) {
      featureReleaseMap[featureId] = releaseId;
    }
  }

  // Step 5: enrich features
  const enrichedFeatures = features.map((f) => ({
    ...f,
    _releaseId: featureReleaseMap[f.id] ?? null,
    _cvp: cvpMap[f.id] ?? null,
  }));

  // Step 6: sort releases by startDate, put those without dates last
  const sortedReleases = [...releases].sort((a, b) => {
    const da = a.startDate ? new Date(a.startDate) : Infinity;
    const db = b.startDate ? new Date(b.startDate) : Infinity;
    return da - db;
  });

  return { releases: sortedReleases, features: enrichedFeatures };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProductBoard() {
  const [state, setState] = useState({
    status: "idle",
    releases: [],
    features: [],
    error: null,
    progress: "",
  });

  const load = useCallback(async () => {
    setState({ status: "loading", releases: [], features: [], error: null, progress: "Connecting..." });

    try {
      const { releases, features } = await loadAll((msg) => {
        setState((s) => ({ ...s, progress: msg }));
      });
      setState({ status: "success", releases, features, error: null, progress: "" });
    } catch (err) {
      setState({ status: "error", releases: [], features: [], error: err.message, progress: "" });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", releases: [], features: [], error: null, progress: "" });
  }, []);

  return { ...state, load, reset };
}