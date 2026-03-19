import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import "./App.css";
import { useProductBoard } from "./useProductBoard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTeamName(feature) {
  return feature._team ?? null;
}

function getProductBoardUrl(feature) {
  return feature.links?.html ?? null;
}

function statusClass(status) {
  if (!status) return "";
  return "status-" + status.toLowerCase().replace(/\s+/g, "-");
}

function classifyRelease(releaseName, mapping) {
  if (!releaseName) return null;
  const lower = releaseName.toLowerCase().trim();
  for (const [horizon, terms] of Object.entries(mapping)) {
    for (const term of terms) {
      if (lower.includes(term.toLowerCase().trim())) return horizon;
    }
  }
  return null;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DEFAULT_MAPPING = {
  now: ["now", "current", "this quarter"],
  next: ["next", "upcoming"],
  later: ["later", "future", "backlog"],
};

const HORIZONS = ["now", "next", "later"];
const HORIZON_LABELS = { now: "Now", next: "Next", later: "Later" };

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_MAPPING_KEY = "pb_mapping";

function loadSavedMapping() {
  try {
    const raw = localStorage.getItem(STORAGE_MAPPING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) { return null; }
}

function saveMapping(mapping) {
  try { localStorage.setItem(STORAGE_MAPPING_KEY, JSON.stringify(mapping)); } catch (_) {}
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ feature, horizon }) {
  const status = feature.status?.name;
  const team = getTeamName(feature);
  const cvp = feature._cvp;
  const pbUrl = getProductBoardUrl(feature);

  return (
    <div
      className={`feature-card ${horizon} ${pbUrl ? "clickable" : ""}`}
      onClick={() => pbUrl && window.open(pbUrl, "_blank", "noopener,noreferrer")}
      title={pbUrl ? "Open in ProductBoard" : undefined}
    >
      <p className="card-name">{feature.name}</p>

      {cvp && <p className="card-cvp">{cvp}</p>}

      <div className="card-meta">
        {team && (
          <span className="card-team">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" style={{flexShrink:0}}>
              <circle cx="4.5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="8.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 10c0-1.657 1.567-3 3.5-3S8 8.343 8 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M8 8c1.1 0 2.5.7 2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {team}
          </span>
        )}
      </div>

      <div className="card-footer">
        {status && <span className={`card-status ${statusClass(status)}`}>{status}</span>}
        {pbUrl && (
          <span className="card-open-hint">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
              <path d="M7 1h4v4M11 1L5.5 6.5M4 2H2a1 1 0 00-1 1v7a1 1 0 001 1h7a1 1 0 001-1V8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Open
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Column ───────────────────────────────────────────────────────────────────

function Column({ horizon, features, releaseNames }) {
  // Group features by team
  const teamGroups = useMemo(() => {
    const groups = {};
    for (const f of features) {
      const team = f._team ?? "No team";
      if (!groups[team]) groups[team] = [];
      groups[team].push(f);
    }
    // Sort team names alphabetically, "No team" last
    return Object.entries(groups).sort(([a], [b]) => {
      if (a === "No team") return 1;
      if (b === "No team") return -1;
      return a.localeCompare(b);
    });
  }, [features]);

  return (
    <div className="column">
      <div className="column-header">
        <div className="column-label">
          <div className={`column-label-dot ${horizon}`} />
          <div>
            <span className="column-name">{HORIZON_LABELS[horizon]}</span>
            {releaseNames.length > 0 && (
              <span className="column-releases">
                {releaseNames.join(" · ")}
              </span>
            )}
          </div>
        </div>
        <span className="column-count">{features.length}</span>
      </div>

      {features.length === 0 ? (
        <div className="empty-column"><span>No features</span></div>
      ) : (
        <div className="column-cards">
          {teamGroups.map(([teamName, teamFeatures]) => (
            <div key={teamName} className="team-group">
              <div className="team-group-header">{teamName}</div>
              {teamFeatures.map((f) => (
                <FeatureCard key={f.id} feature={f} horizon={horizon} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function SettingsPanel({ mapping, onSave, onClose }) {
  const [nowTerms, setNowTerms] = useState(mapping.now.join(", "));
  const [nextTerms, setNextTerms] = useState(mapping.next.join(", "));
  const [laterTerms, setLaterTerms] = useState(mapping.later.join(", "));

  const handleSave = () => {
    const newMapping = {
      now: nowTerms.split(",").map((s) => s.trim()).filter(Boolean),
      next: nextTerms.split(",").map((s) => s.trim()).filter(Boolean),
      later: laterTerms.split(",").map((s) => s.trim()).filter(Boolean),
    };
    saveMapping(newMapping);
    onSave(newMapping);
    onClose();
  };

  return (
    <div className="settings-overlay" onClick={onClose}>
      <div className="settings-panel" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "1.5rem" }}>
          <h3 style={{ margin: 0 }}>Settings</h3>
          <button className="btn btn-sm" onClick={onClose}>Close</button>
        </div>

        <p className="horizon-map-title">Release name → Horizon mapping</p>
        <p className="horizon-map-desc">
          Comma-separated keywords matched against each release's name
          (case-insensitive, partial match). Archived releases are always hidden.
          First match wins.
        </p>

        {[
          { horizon: "now", label: "Now", value: nowTerms, onChange: setNowTerms },
          { horizon: "next", label: "Next", value: nextTerms, onChange: setNextTerms },
          { horizon: "later", label: "Later", value: laterTerms, onChange: setLaterTerms },
        ].map(({ horizon, label, value, onChange }) => (
          <div className="horizon-row" key={horizon}>
            <span className={`horizon-badge ${horizon}`}>{label}</span>
            <input
              type="text"
              className="field-input"
              value={value}
              onChange={(e) => onChange(e.target.value)}
            />
          </div>
        ))}

        <button
          className="btn btn-primary"
          onClick={handleSave}
          style={{ width: "100%", marginTop: "1.5rem" }}
        >
          Save &amp; apply
        </button>
      </div>
    </div>
  );
}

// ─── PPT Export ───────────────────────────────────────────────────────────────

const HORIZON_COLORS = {
  now:   { accent: "#dc3b42", bg: "#FBEAEA", text: "#b02e34", dot: "#dc3b42", header: "#0D2B45" },
  next:  { accent: "#00A896", bg: "#E6F7F5", text: "#007A6E", dot: "#00A896", header: "#0D2B45" },
  later: { accent: "#4A6278", bg: "#EDF2F7", text: "#2E3F4F", dot: "#4A6278", header: "#0D2B45" },
};

const STATUS_COLORS = {
  "in progress":    { bg: "#E8F3FB", color: "#0D4F7A" },
  "in development": { bg: "#E8F3FB", color: "#0D4F7A" },
  "defined":        { bg: "#E8F3FB", color: "#0D4F7A" },
  "validated":      { bg: "#E8F3FB", color: "#0D4F7A" },
  "delivered":      { bg: "#FBEAEA", color: "#b02e34" },
  "done":           { bg: "#FBEAEA", color: "#b02e34" },
  "released":       { bg: "#FBEAEA", color: "#b02e34" },
  "backlog":        { bg: "#EDF2F7", color: "#2E3F4F" },
  "candidate":      { bg: "#EDF2F7", color: "#2E3F4F" },
  "idea":           { bg: "#EDF2F7", color: "#2E3F4F" },
  "parked":         { bg: "#FEF2F2", color: "#991B1B" },
  "blocked":        { bg: "#FEF2F2", color: "#991B1B" },
};

function getStatusStyle(statusName) {
  if (!statusName) return { bg: "#F1EFE8", color: "#444441" };
  const key = statusName.toLowerCase();
  for (const [k, v] of Object.entries(STATUS_COLORS)) {
    if (key.includes(k)) return v;
  }
  return { bg: "#F1EFE8", color: "#444441" };
}

function buildSlideHTML(horizon, features, releaseNames) {
  const c = HORIZON_COLORS[horizon];
  const label = { now: "Now", next: "Next", later: "Later" }[horizon];
  const date = new Date().toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  // Group by team
  const teamGroups = {};
  for (const f of features) {
    const team = f._team ?? "No team";
    if (!teamGroups[team]) teamGroups[team] = [];
    teamGroups[team].push(f);
  }
  const sortedTeams = Object.entries(teamGroups).sort(([a], [b]) => {
    if (a === "No team") return 1;
    if (b === "No team") return -1;
    return a.localeCompare(b);
  });

  const CARD_W = 340;
  const CARD_PAD = 16;
  const SLIDE_W = 1920;
  const SLIDE_H = 1080;
  const HEADER_H = 100;
  const COL_GAP = 24;
  const TEAM_HEADER_H = 28;
  const CARD_MIN_H = 90;
  const CVP_LINE_H = 16;
  const MAX_CVP_LINES = 3;

  // Calculate how many columns fit
  const availW = SLIDE_W - 96;
  const cols = Math.max(1, Math.floor((availW + COL_GAP) / (CARD_W + COL_GAP)));

  // Build cards HTML
  const cardsHTML = sortedTeams.map(([teamName, teamFeatures]) => {
    const featureCards = teamFeatures.map((f) => {
      const status = f.status?.name ?? "";
      const sc = getStatusStyle(status);
      const cvp = f._cvp ? `<div style="font-size:11px;line-height:1.45;color:#4A6278;margin-bottom:8px;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${f._cvp}</div>` : "";
      const statusBadge = status ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${sc.bg};color:${sc.color};text-transform:capitalize;">${status}</span>` : "";
      const teamBadge = f._team ? `<span style="font-size:10px;color:#4A6278;background:#EDF2F7;border:0.5px solid #DDE4EC;border-radius:4px;padding:2px 7px;">${f._team}</span>` : "";
      const footer = (statusBadge || teamBadge) ? `<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-top:4px;">${statusBadge}${teamBadge}</div>` : "";
      return `<div style="background:#ffffff;border:1px solid #DDE4EC;border-left:3px solid ${c.accent};border-radius:6px;padding:${CARD_PAD}px;margin-bottom:8px;">
        <div style="font-size:12.5px;font-weight:600;line-height:1.35;color:#0D2B45;margin-bottom:6px;">${f.name}</div>
        ${cvp}${footer}
      </div>`;
    }).join("");

    return `<div style="break-inside:avoid;margin-bottom:16px;">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8A9BAA;margin-bottom:6px;padding-left:2px;padding-bottom:4px;border-bottom:1px solid #DDE4EC;">${teamName}</div>
      ${featureCards}
    </div>`;
  }).join("");

  const releaseSubtitle = releaseNames.length > 0
    ? `<div style="font-size:13px;color:${c.text};opacity:0.7;margin-top:4px;">${releaseNames.join(" · ")}</div>`
    : "";

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { width: ${SLIDE_W}px; height: ${SLIDE_H}px; overflow: hidden; background: #F4F7FA; font-family: 'Inter', system-ui, sans-serif; }
  </style>
  </head><body>
  <div style="width:${SLIDE_W}px;height:${SLIDE_H}px;background:#F4F7FA;display:flex;flex-direction:column;">
    <div style="background:#0D2B45;padding:28px 48px 24px;display:flex;align-items:center;gap:16px;border-bottom:4px solid #dc3b42;">
      <img src="https://www.meddbase.com/wp-content/uploads/2025/06/MeddbaseByCority.webp" alt="Meddbase" style="height:32px;object-fit:contain;flex-shrink:0;filter:brightness(0) invert(1);" crossorigin="anonymous" />
      <div>
        <div style="font-size:28px;font-weight:700;color:#ffffff;letter-spacing:-0.3px;line-height:1.1;">${label}</div>
        ${releaseSubtitle ? `<div style="font-size:13px;color:rgba(255,255,255,0.6);margin-top:3px;">${releaseNames.join(" · ")}</div>` : ""}
      </div>
      <div style="margin-left:auto;text-align:right;">
        <div style="font-size:12px;color:rgba(255,255,255,0.5);">${date}</div>
        <div style="font-size:12px;color:rgba(255,255,255,0.5);margin-top:2px;">${features.length} features</div>
      </div>
    </div>
    <div style="flex:1;overflow:hidden;padding:24px 48px;columns:${cols};column-gap:${COL_GAP}px;">
      ${cardsHTML}
    </div>
  </div>
  </body></html>`;
}

async function loadLib(src) {
  if (document.querySelector(`script[src="${src}"]`) && window[src.includes("jszip") ? "JSZip" : "html2canvas"]) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function exportSlidesAsZip(grouped) {
  await Promise.all([
    loadLib("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
    loadLib("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"),
  ]);

  const zip = new window.JSZip();
  const date = new Date().toISOString().slice(0, 10);

  for (const horizon of ["now", "next", "later"]) {
    const { features, releaseNames } = grouped[horizon];
    if (features.length === 0) continue;

    // Create an off-screen iframe to render the slide
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;left:-9999px;top:-9999px;width:1920px;height:1080px;border:none;visibility:hidden;";
    document.body.appendChild(iframe);

    const html = buildSlideHTML(horizon, features, releaseNames);
    iframe.contentDocument.open();
    iframe.contentDocument.write(html);
    iframe.contentDocument.close();

    // Wait for fonts/layout
    await new Promise((r) => setTimeout(r, 600));

    const canvas = await window.html2canvas(iframe.contentDocument.body, {
      width: 1920,
      height: 1080,
      scale: 1,
      useCORS: true,
      backgroundColor: "#fafaf9",
      logging: false,
      windowWidth: 1920,
      windowHeight: 1080,
    });

    document.body.removeChild(iframe);

    const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
    zip.file(`roadmap-${horizon}-${date}.png`, blob);
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `roadmap-slides-${date}.zip`;
  link.href = URL.createObjectURL(zipBlob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ─── Roadmap Board ────────────────────────────────────────────────────────────

function RoadmapBoard({ releases, features, onReload }) {
  const [mapping, setMapping] = useState(() => loadSavedMapping() || DEFAULT_MAPPING);
  const [showSettings, setShowSettings] = useState(false);
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [hiddenStatuses, setHiddenStatuses] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pb_hidden_statuses") || "[]"); }
    catch (_) { return []; }
  });
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const boardRef = useRef(null); // kept for future use

  // Collect all unique statuses from features for the filter UI
  const allStatuses = useMemo(() => {
    const seen = new Set();
    for (const f of features) {
      if (f.status?.name) seen.add(f.status.name);
    }
    return [...seen].sort();
  }, [features]);

  const toggleStatus = (statusName) => {
    setHiddenStatuses((prev) => {
      const next = prev.includes(statusName)
        ? prev.filter((s) => s !== statusName)
        : [...prev, statusName];
      try { localStorage.setItem("pb_hidden_statuses", JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };

  // Build a map of releaseId -> horizon, filtering out archived releases
  const releaseHorizonMap = useMemo(() => {
    const map = {};
    for (const r of releases) {
      if (r.archived) continue;
      const horizon = classifyRelease(r.name, mapping);
      if (horizon) map[r.id] = { horizon, name: r.name };
    }
    return map;
  }, [releases, mapping]);

  const { grouped, unmapped } = useMemo(() => {
    const grouped = {
      now: { features: [], releaseNames: new Set() },
      next: { features: [], releaseNames: new Set() },
      later: { features: [], releaseNames: new Set() },
    };
    const unmapped = [];

    for (const f of features) {
      if (f.archived) continue;
      // Apply status filter
      if (hiddenStatuses.includes(f.status?.name)) continue;
      const releaseInfo = f._releaseId ? releaseHorizonMap[f._releaseId] : null;
      if (releaseInfo) {
        grouped[releaseInfo.horizon].features.push(f);
        grouped[releaseInfo.horizon].releaseNames.add(releaseInfo.name);
      } else {
        unmapped.push(f);
      }
    }

    for (const h of HORIZONS) {
      grouped[h].features.sort((a, b) => {
        const sa = (a.status?.name ?? "").toLowerCase();
        const sb = (b.status?.name ?? "").toLowerCase();
        if (sa !== sb) return sa.localeCompare(sb);
        return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
      });
      grouped[h].releaseNames = [...grouped[h].releaseNames];
    }

    return { grouped, unmapped };
  }, [features, releaseHorizonMap, hiddenStatuses]);

  const totalFeatures = HORIZONS.reduce((n, h) => n + grouped[h].features.length, 0);

  const handleExport = async () => {
    setExporting(true);
    try { await exportSlidesAsZip(grouped); }
    catch (e) { alert("Export failed: " + e.message); }
    finally { setExporting(false); }
  };

  return (
    <>
      {showSettings && (
        <SettingsPanel
          mapping={mapping}
          onSave={setMapping}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="header">
        <div className="header-brand">
          <div className="header-logo-img">
            <img src="https://www.meddbase.com/wp-content/uploads/2025/06/MeddbaseByCority.webp" alt="Meddbase" />
          </div>
          <span className="header-divider" />
          <span className="header-title">Product Roadmap</span>
        </div>
        <div className="header-actions">
          <span className="roadmap-count">
            <strong>{totalFeatures}</strong> features
          </span>
          {unmapped.length > 0 && (
            <button className="btn btn-sm" onClick={() => setShowUnmapped(!showUnmapped)}>
              {unmapped.length} unmapped
            </button>
          )}
          <button className="btn btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? "Generating slides…" : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 9.5V11h10V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Export slides
              </>
            )}
          </button>
          <button className="btn btn-sm" onClick={onReload}>Refresh</button>
          <div className="status-filter-wrap">
            <button className="btn btn-sm" onClick={() => setShowStatusFilter((v) => !v)}>
              Status {hiddenStatuses.length > 0 ? `(${hiddenStatuses.length} hidden)` : "filter"}
            </button>
            {showStatusFilter && (
              <div className="status-filter-dropdown">
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Show statuses
                </div>
                {allStatuses.map((s) => (
                  <label key={s} className="status-filter-item">
                    <input
                      type="checkbox"
                      checked={!hiddenStatuses.includes(s)}
                      onChange={() => toggleStatus(s)}
                    />
                    <span className={`card-status ${statusClass(s)}`}>{s}</span>
                  </label>
                ))}
                {hiddenStatuses.length > 0 && (
                  <button
                    className="btn btn-sm"
                    style={{ width: "100%", marginTop: 8 }}
                    onClick={() => { setHiddenStatuses([]); localStorage.removeItem("pb_hidden_statuses"); }}
                  >
                    Show all
                  </button>
                )}
              </div>
            )}
          </div>
          <button className="btn btn-sm" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </div>

      <div className="roadmap-body">
        {unmapped.length > 0 && showUnmapped && (
          <div className="unmapped-notice">
            <strong>{unmapped.length} features</strong> belong to releases not mapped to a horizon.
            Open <strong>Settings</strong> to add those release name keywords.
          </div>
        )}
        <div className="roadmap-grid">
          {HORIZONS.map((h) => (
            <Column
              key={h}
              horizon={h}
              features={grouped[h].features}
              releaseNames={grouped[h].releaseNames}
            />
          ))}
        </div>
      </div>
    </>
  );
}

// ─── Loading / Error ──────────────────────────────────────────────────────────

function LoadingScreen({ message }) {
  return (
    <div className="loading-screen">
      <div className="spinner" />
      <p>{message || "Loading…"}</p>
    </div>
  );
}

function ErrorScreen({ message, onRetry }) {
  return (
    <div className="error-screen">
      <h3>Something went wrong</h3>
      <p>{message}</p>
      <button className="btn" onClick={onRetry} style={{ marginTop: 8 }}>Try again</button>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const { status, releases, features, error, progress, load, reset } = useProductBoard();

  useEffect(() => {
    load();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleReload = useCallback(() => {
    reset();
    setTimeout(() => load(), 0);
  }, [load, reset]);

  return (
    <div className="app">
      {status === "idle" && <LoadingScreen message="Starting…" />}
      {status === "loading" && <LoadingScreen message={progress} />}
      {status === "error" && <ErrorScreen message={error} onRetry={handleReload} />}
      {status === "success" && (
        <RoadmapBoard
          releases={releases}
          features={features}
          onReload={handleReload}
        />
      )}
    </div>
  );
}
