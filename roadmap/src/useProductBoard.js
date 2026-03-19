/**
 * useProductBoard.js
 *
 * Fetches data from ProductBoard using v1 API for features/releases
 * and v2 API for teams (not available in v1).
 *
 * Endpoints used:
 *  v1: GET /features
 *  v1: GET /releases
 *  v1: GET /feature-release-assignments
 *  v1: GET /hierarchy-entities/custom-fields?type[]=text  (find CVP field ID)
 *  v1: GET /hierarchy-entities/custom-fields-values?customField.id={id}
 *  v2: GET /v2/entities?type[]=feature  (for team data only)
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

// ─── Paginated fetch — follows links.next automatically ──────────────────────

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
    // v1 custom fields live under /hierarchy-entities/custom-fields
    // Must specify type filter
    const res = await pbFetch("/hierarchy-entities/custom-fields?type[]=text&type[]=number&type[]=dropdown");
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
  if (!cvpFieldId) return {};
  try {
    const items = await fetchAllPages(
      `/hierarchy-entities/custom-fields-values?customField.id=${cvpFieldId}`,
      null,
      "custom field values"
    );
    // Build map of featureId -> value
    const map = {};
    for (const item of items) {
      const featureId = item.hierarchyEntity?.id;
      if (!featureId) continue;
      // value shape depends on field type
      const val = item.value ?? item.option?.label ?? null;
      if (val !== null && val !== undefined) {
        map[featureId] = String(val).trim() || null;
      }
    }
    return map;
  } catch (_) {
    return {};
  }
}

// ─── Teams from v2 ───────────────────────────────────────────────────────────

async function fetchTeamMap() {
  // Returns { [featureId]: teamName }
  try {
    const map = {};
    let nextPath = "/v2/entities?type[]=feature";
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
      nextPath = cursor ? `/v2/entities?type[]=feature&cursor=${encodeURIComponent(cursor)}` : null;
    }
    return map;
  } catch (_) {
    return {};
  }
}

// ─── Main load ────────────────────────────────────────────────────────────────

async function loadAll(onProgress) {
  onProgress("Loading releases and custom fields...");

  // Kick off releases, CVP field ID, and team map in parallel
  const [releases, cvpFieldId, teamMap] = await Promise.all([
    fetchAllPages("/releases", null, "releases"),
    findCVPFieldId(),
    fetchTeamMap(),
  ]);

  // Fetch features and release assignments in parallel
  const [features, assignments] = await Promise.all([
    fetchAllPages("/features", onProgress, "features"),
    fetchAllPages("/feature-release-assignments", null, "release assignments"),
  ]);

  // Fetch CVP values now that we have the field ID
  onProgress("Loading custom field values...");
  const cvpMap = await fetchCVPValues(cvpFieldId);

  // Build featureId -> releaseId map
  const featureReleaseMap = {};
  for (const a of assignments) {
    const featureId = a.feature?.id ?? a.featureId;
    const releaseId = a.release?.id ?? a.releaseId;
    if (featureId && releaseId) featureReleaseMap[featureId] = releaseId;
  }

  // Enrich features with release, CVP, and team
  const enriched = features.map((f) => ({
    ...f,
    _releaseId: featureReleaseMap[f.id] ?? null,
    _cvp: cvpMap[f.id] ?? null,
    _team: teamMap[f.id] ?? null,
  }));

  // Sort releases by startDate (none = last)
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