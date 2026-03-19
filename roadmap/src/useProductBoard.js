/**
 * useProductBoard.js
 *
 * Fetches features via the Vercel serverless proxy at /api/productboard.
 * Uses ProductBoard API v2 — features are "entities" at /v2/entities.
 */

import { useState, useCallback } from "react";

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

async function fetchAllFeatures(onProgress) {
  const features = [];
  let cursor = null;
  let page = 1;

  do {
    onProgress(`Fetching features (page ${page})...`);
    let path = "/v2/entities?type[]=feature";
    if (cursor) path += `&cursor=${encodeURIComponent(cursor)}`;

    const response = await pbFetch(path);
    const items = response.data ?? response.items ?? [];
    if (Array.isArray(items)) features.push(...items);

    const meta = response.metadata ?? response.meta ?? {};
    cursor = meta.cursor?.next ?? meta.nextCursor ?? null;

    page++;
  } while (cursor);

  return features;
}

async function findCVPFieldId() {
  try {
    const res = await pbFetch("/v2/entities/configurations");
    const configs = res.data ?? res.items ?? [];
    for (const config of configs) {
      const fields = config.fields ?? config.customFields ?? [];
      const match = fields.find(
        (f) => f.name?.toLowerCase().trim() === "customer value proposition"
      );
      if (match) return match.id;
    }
    return null;
  } catch (_) {
    return null;
  }
}

function extractCVP(entity) {
  const fields = entity.fields ?? entity.customFields ?? {};
  if (Array.isArray(fields)) {
    const match = fields.find(
      (f) => f.name?.toLowerCase().trim() === "customer value proposition"
    );
    return match?.value?.trim() || null;
  }
  return null;
}

function normaliseEntity(entity) {
  return {
    ...entity,
    name: entity.name ?? entity.title ?? "(Unnamed)",
    status: entity.status ?? { name: entity.statusName ?? null },
    timeframe: entity.timeframe ?? entity.horizon ?? null,
    team: entity.team ?? (entity.teams?.[0] ? { name: entity.teams[0].name } : null),
    teams: entity.teams ?? (entity.team ? [entity.team] : []),
    links: entity.links ?? { html: entity.url ?? null },
    _cvp: extractCVP(entity),
  };
}

export function useProductBoard() {
  const [state, setState] = useState({
    status: "idle",
    features: [],
    error: null,
    progress: "",
  });

  const load = useCallback(async () => {
    setState({ status: "loading", features: [], error: null, progress: "Connecting..." });

    try {
      const rawFeatures = await fetchAllFeatures((msg) => {
        setState((s) => ({ ...s, progress: msg }));
      });

      const features = rawFeatures.map(normaliseEntity);
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