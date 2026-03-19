/**
 * useProductBoard.js
 *
 * v1 API for features, releases, release assignments, custom fields.
 * v2 API for team data (not available in v1).
 */

import { useState, useCallback } from "react";

// ─── Generic fetch via proxy ──────────────────────────────────────────────────

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

// ─── Paginated fetch ──────────────────────────────────────────────────────────

async function fetchAllPages(firstPath, onProgress, label) {
  const items = [];
  let nextPath = firstPath;
  let page = 1;

  while (nextPath) {
    if (onProgress) onProgress(`Fetching ${label} (page ${page})...`);
    const response = await pbFetch(nextPath);
    const data = response.data ?? [];
    items.push(...data);

    const next = response.links?.next;
    if (next) {
      try {
        const parsed = new URL(next);
        nextPath = parsed.pathname + parsed.search;
      } catch (_) { nextPath = null; }
    } else {
      nextPath = null;
    }
    page++;
  }

  return items;
}

// ─── Custom field helpers ─────────────────────────────────────────────────────

async function findCVPFieldId() {
  try {
    // Fetch each type separately to avoid bracket encoding issues
    const types = ["text", "number", "dropdown", "textarea"];
    for (const type of types) {
      const res = await pbFetch(`/hierarchy-entities/custom-fields?type=${type}`);
      const fields = res.data ?? [];
      const match = fields.find(
        (f) => f.name?.toLowerCase().trim() === "customer value proposition"
      );
      if (match) {
        console.log(`Found CVP field: ${match.id} (type: ${type})`);
        return match.id;
      }
    }
    console.warn("CVP custom field not found");
    return null;
  } catch (e) {
    console.warn("Could not fetch custom fields:", e.message);
    return null;
  }
}

async function fetchCVPValues(cvpFieldId) {
  if (!cvpFieldId) return {};
  try {
    const items = await fetchAllPages(
      `/hierarchy-entities/custom-fields-values?customField.id=${cvpFieldId}`,
      null,
      "CVP values"
    );
    const map = {};
    for (const item of items) {
      const featureId = item.hierarchyEntity?.id;
      if (!featureId) continue;
      // Text fields return item.value, dropdowns return item.option.label
      const val = item.value ?? item.option?.label ?? null;
      if (val !== null && val !== undefined && String(val).trim()) {
        map[featureId] = String(val).trim();
      }
    }
    console.log(`Loaded ${Object.keys(map).length} CVP values`);
    return map;
  } catch (e) {
    console.warn("Could not fetch CVP values:", e.message);
    return {};
  }
}

// ─── Teams from v2 ───────────────────────────────────────────────────────────

async function fetchTeamMap() {
  try {
    const map = {};
    let nextPath = "/v2/entities?type%5B%5D=feature";
    while (nextPath) {
      const response = await pbFetch(nextPath);
      const items = response.data ?? [];
      for (const entity of items) {
        const teams = entity.fields?.teams ?? [];
        if (teams.length > 0 && teams[0].name) {
          map[entity.id] = teams[0].name;
        }
      }
      const meta = response.metadata ?? response.meta ?? {};
      const cursor = meta.cursor?.next ?? null;
      nextPath = cursor
        ? `/v2/entities?type%5B%5D=feature&cursor=${encodeURIComponent(cursor)}`
        : null;
    }
    console.log(`Loaded teams for ${Object.keys(map).length} features`);
    return map;
  } catch (e) {
    console.warn("Could not fetch team data:", e.message);
    return {};
  }
}

// ─── Main load ────────────────────────────────────────────────────────────────

async function loadAll(onProgress) {
  onProgress("Loading releases and field definitions...");

  const [releases, cvpFieldId] = await Promise.all([
    fetchAllPages("/releases", null, "releases"),
    findCVPFieldId(),
  ]);

  const [features, assignments] = await Promise.all([
    fetchAllPages("/features", onProgress, "features"),
    fetchAllPages("/feature-release-assignments", null, "release assignments"),
  ]);

  onProgress("Loading component assignments...");
  const teamMap = await fetchComponentFeatureMap(onProgress);

  onProgress("Loading custom field values...");
  const cvpMap = await fetchCVPValues(cvpFieldId);

  // Build featureId -> releaseId map
  const featureReleaseMap = {};
  for (const a of assignments) {
    const featureId = a.feature?.id ?? a.featureId;
    const releaseId = a.release?.id ?? a.releaseId;
    if (featureId && releaseId) featureReleaseMap[featureId] = releaseId;
  }

  const enriched = features.map((f) => ({
    ...f,
    _releaseId: featureReleaseMap[f.id] ?? null,
    _cvp: cvpMap[f.id] ?? null,
    _team: teamMap[f.id] ?? null,
  }));

  const sortedReleases = [...releases].sort((a, b) => {
    const da = a.startDate && a.startDate !== "none" ? new Date(a.startDate) : Infinity;
    const db = b.startDate && b.startDate !== "none" ? new Date(b.startDate) : Infinity;
    return da - db;
  });

  return { releases: sortedReleases, features: enriched };
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
      const { releases, features } = await loadAll((msg) =>
        setState((s) => ({ ...s, progress: msg }))
      );
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