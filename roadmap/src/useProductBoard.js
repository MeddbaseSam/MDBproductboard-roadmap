/**
 * useProductBoard.js
 *
 * Uses ProductBoard API v1 throughout.
 *
 * Component (team) assignment:
 *  - Features of type "feature" have parent.component.id directly
 *  - Features of type "subfeature" have parent.feature.id
 *    → look up that parent feature to get its parent.component.id
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

// ─── Objective map ───────────────────────────────────────────────────────────

async function fetchObjectiveFeatureMap() {
  // Returns { [featureId]: [objectiveName, ...] }
  // and { objectives: [{id, name}] }
  try {
    const objectives = await fetchAllPages("/objectives", null, "objectives");
    console.log(`Found ${objectives.length} objectives`);

    const featureObjectiveMap = {}; // featureId -> Set of objective names
    for (const obj of objectives) {
      const links = await fetchAllPages(
        `/objectives/${obj.id}/links/features`,
        null,
        `objective links`
      );
      for (const link of links) {
        const featureId = link.feature?.id ?? link.id;
        if (!featureId) continue;
        if (!featureObjectiveMap[featureId]) featureObjectiveMap[featureId] = new Set();
        featureObjectiveMap[featureId].add(obj.name);
      }
    }

    // Convert Sets to arrays
    const map = {};
    for (const [fId, nameSet] of Object.entries(featureObjectiveMap)) {
      map[fId] = [...nameSet];
    }
    console.log(`Mapped objectives for ${Object.keys(map).length} features`);
    return { featureObjectiveMap: map, objectives };
  } catch (e) {
    console.warn("Could not fetch objectives:", e.message);
    return { featureObjectiveMap: {}, objectives: [] };
  }
}

// ─── Component map ────────────────────────────────────────────────────────────

async function fetchComponentMap() {
  // Returns { [componentId]: componentName }
  try {
    const components = await fetchAllPages("/components", null, "components");
    const map = {};
    for (const c of components) {
      map[c.id] = c.name;
    }
    console.log(`Loaded ${components.length} components`);
    return map;
  } catch (e) {
    console.warn("Could not fetch components:", e.message);
    return {};
  }
}

// ─── Build featureId -> componentName ────────────────────────────────────────
//
// In v1:
//  - type="feature"    → parent.component.id  (direct)
//  - type="subfeature" → parent.feature.id    (need to look up parent)

function buildTeamMap(features, componentMap) {
  // First pass: map featureId -> componentId for top-level features
  const featureComponentMap = {}; // featureId -> componentId

  for (const f of features) {
    if (f.type === "feature" && f.parent?.component?.id) {
      featureComponentMap[f.id] = f.parent.component.id;
    }
  }

  // Second pass: resolve subfeatures via their parent feature
  for (const f of features) {
    if (f.type === "subfeature" && f.parent?.feature?.id) {
      const parentComponentId = featureComponentMap[f.parent.feature.id];
      if (parentComponentId) {
        featureComponentMap[f.id] = parentComponentId;
      }
    }
  }

  // Convert componentId -> componentName
  const teamMap = {}; // featureId -> componentName
  for (const [featureId, componentId] of Object.entries(featureComponentMap)) {
    const componentName = componentMap[componentId];
    if (componentName) teamMap[featureId] = componentName;
  }

  console.log(`Resolved teams for ${Object.keys(teamMap).length} of ${features.length} features`);
  return teamMap;
}

// ─── Main load ────────────────────────────────────────────────────────────────

async function loadAll(onProgress) {
  onProgress("Loading releases and field definitions...");

  const [releases, cvpFieldId, componentMap, { featureObjectiveMap, objectives }] = await Promise.all([
    fetchAllPages("/releases", null, "releases"),
    findCVPFieldId(),
    fetchComponentMap(),
    fetchObjectiveFeatureMap(),
  ]);

  const [features, assignments] = await Promise.all([
    fetchAllPages("/features", onProgress, "features"),
    fetchAllPages("/feature-release-assignments", null, "release assignments"),
  ]);

  onProgress("Loading custom field values...");
  const cvpMap = await fetchCVPValues(cvpFieldId);

  // Build featureId -> releaseId map
  const featureReleaseMap = {};
  for (const a of assignments) {
    const featureId = a.feature?.id ?? a.featureId;
    const releaseId = a.release?.id ?? a.releaseId;
    if (featureId && releaseId) featureReleaseMap[featureId] = releaseId;
  }

  // Build featureId -> componentName (team) map from parent chain
  onProgress("Resolving component assignments...");
  const teamMap = buildTeamMap(features, componentMap);

  const enriched = features.map((f) => ({
    ...f,
    _releaseId: featureReleaseMap[f.id] ?? null,
    _cvp: cvpMap[f.id] ?? null,
    _team: teamMap[f.id] ?? null,
    _objectives: featureObjectiveMap[f.id] ?? [],
  }));

  const sortedReleases = [...releases].sort((a, b) => {
    const da = a.startDate && a.startDate !== "none" ? new Date(a.startDate) : Infinity;
    const db = b.startDate && b.startDate !== "none" ? new Date(b.startDate) : Infinity;
    return da - db;
  });

  return { releases: sortedReleases, features: enriched, objectives };
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useProductBoard() {
  const [state, setState] = useState({
    status: "idle",
    releases: [],
    features: [],
    objectives: [],
    error: null,
    progress: "",
  });

  const load = useCallback(async () => {
    setState({ status: "loading", releases: [], features: [], error: null, progress: "Connecting..." });
    try {
      const { releases, features } = await loadAll((msg) =>
        setState((s) => ({ ...s, progress: msg }))
      );
      setState({ status: "success", releases, features, objectives, error: null, progress: "" });
    } catch (err) {
      setState({ status: "error", releases: [], features: [], error: err.message, progress: "" });
    }
  }, []);

  const reset = useCallback(() => {
    setState({ status: "idle", releases: [], features: [], objectives: [], error: null, progress: "" });
  }, []);

  return { ...state, load, reset };
}