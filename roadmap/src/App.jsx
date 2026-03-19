import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import "./App.css";
import { useProductBoard } from "./useProductBoard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getReleaseName(feature) {
  if (feature.timeframe?.name) return feature.timeframe.name;
  if (feature.release?.name) return feature.release.name;
  return null;
}

function getTeamName(feature) {
  // PB exposes team as feature.teams[0] or feature.team
  if (Array.isArray(feature.teams) && feature.teams.length > 0) {
    return feature.teams[0].name ?? null;
  }
  if (feature.team?.name) return feature.team.name;
  return null;
}

function getProductBoardUrl(feature) {
  // PB API returns links.html pointing to the feature in the UI
  return feature.links?.html ?? null;
}

function statusClass(status) {
  if (!status) return "";
  return "status-" + status.toLowerCase().replace(/\s+/g, "-");
}

function classifyHorizon(releaseName, mapping) {
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
  now: ["now", "current", "q1", "this quarter"],
  next: ["next", "q2", "upcoming"],
  later: ["later", "future", "q3", "q4", "backlog"],
};

const HORIZONS = ["now", "next", "later"];
const HORIZON_LABELS = { now: "Now", next: "Next", later: "Later" };

// ─── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ feature, horizon }) {
  const releaseName = getReleaseName(feature);
  const status = feature.status?.name;
  const team = getTeamName(feature);
  const cvp = feature._cvp;
  const pbUrl = getProductBoardUrl(feature);

  const handleClick = () => {
    if (pbUrl) window.open(pbUrl, "_blank", "noopener,noreferrer");
  };

  return (
    <div
      className={`feature-card ${horizon} ${pbUrl ? "clickable" : ""}`}
      onClick={handleClick}
      title={pbUrl ? "Open in ProductBoard" : undefined}
    >
      <p className="card-name">{feature.name}</p>

      {cvp && (
        <p className="card-cvp">{cvp}</p>
      )}

      <div className="card-meta">
        {team && (
          <span className="card-team">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg" style={{flexShrink:0}}>
              <circle cx="4.5" cy="3.5" r="2" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="8.5" cy="4" r="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M1 10c0-1.657 1.567-3 3.5-3S8 8.343 8 10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M8 8c1.1 0 2.5.7 2.5 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            {team}
          </span>
        )}
        {releaseName && <span className="card-release">{releaseName}</span>}
      </div>

      <div className="card-footer">
        {status && (
          <span className={`card-status ${statusClass(status)}`}>{status}</span>
        )}
        {pbUrl && (
          <span className="card-open-hint">
            <svg width="10" height="10" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
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

function Column({ horizon, features }) {
  return (
    <div className="column">
      <div className="column-header">
        <div className="column-label">
          <div className={`column-label-dot ${horizon}`} />
          <span className="column-name">{HORIZON_LABELS[horizon]}</span>
        </div>
        <span className="column-count">{features.length}</span>
      </div>

      {features.length === 0 ? (
        <div className="empty-column">
          <span>No features mapped here</span>
        </div>
      ) : (
        <div className="column-cards">
          {features.map((f) => (
            <FeatureCard key={f.id} feature={f} horizon={horizon} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Storage helpers (mapping only — no token needed) ─────────────────────────

const STORAGE_MAPPING_KEY = "pb_mapping";

function loadSavedMapping() {
  try {
    const raw = localStorage.getItem(STORAGE_MAPPING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (_) {
    return null;
  }
}

function saveMapping(mapping) {
  try {
    localStorage.setItem(STORAGE_MAPPING_KEY, JSON.stringify(mapping));
  } catch (_) {}
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

        <p className="horizon-map-title">Timeframe / Release keyword mapping</p>
        <p className="horizon-map-desc">
          Comma-separated keywords matched against each feature's release or timeframe
          name (case-insensitive, partial match). First match wins.
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
          Save &amp; reload
        </button>
      </div>
    </div>
  );
}

// ─── Export helper ────────────────────────────────────────────────────────────

async function exportBoardAsImage(boardRef) {
  // Dynamically load html2canvas from CDN
  if (!window.html2canvas) {
    await new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js";
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
  }

  const canvas = await window.html2canvas(boardRef.current, {
    scale: 2,
    useCORS: true,
    backgroundColor: "#fafaf9",
    logging: false,
  });

  const link = document.createElement("a");
  link.download = `roadmap-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ─── Roadmap Board ────────────────────────────────────────────────────────────

function RoadmapBoard({ features, mapping, onMappingChange, onReload }) {
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [exporting, setExporting] = useState(false);
  const boardRef = useRef(null);

  const { grouped, unmapped } = useMemo(() => {
    const grouped = { now: [], next: [], later: [] };
    const unmapped = [];
    for (const f of features) {
      const release = getReleaseName(f);
      const horizon = classifyHorizon(release, mapping);
      if (horizon) grouped[horizon].push(f);
      else unmapped.push(f);
    }
    return { grouped, unmapped };
  }, [features, mapping]);

  const handleExport = async () => {
    setExporting(true);
    try {
      await exportBoardAsImage(boardRef);
    } catch (e) {
      alert("Export failed: " + e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <>
      {showSettings && (
        <SettingsPanel
          mapping={mapping}
          onSave={(newMapping) => { onMappingChange(newMapping); onReload(); }}
          onClose={() => setShowSettings(false)}
        />
      )}

      <div className="header">
        <div className="header-brand">
          <div className="header-logo"><span>PB</span></div>
          <span className="header-title">Now · Next · Later</span>
        </div>
        <div className="header-actions">
          <span className="roadmap-count">
            <strong>{features.length}</strong> features
          </span>
          {unmapped.length > 0 && (
            <button className="btn btn-sm" onClick={() => setShowUnmapped(!showUnmapped)}>
              {unmapped.length} unmapped
            </button>
          )}
          <button className="btn btn-sm" onClick={handleExport} disabled={exporting}>
            {exporting ? "Exporting…" : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M6 1v7M3.5 5.5L6 8l2.5-2.5M1 9.5V11h10V9.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Export PNG
              </>
            )}
          </button>
          <button className="btn btn-sm" onClick={onReload}>Refresh</button>
          <button className="btn btn-sm" onClick={() => setShowSettings(true)}>Settings</button>
        </div>
      </div>

      <div className="roadmap-body" ref={boardRef}>
        {unmapped.length > 0 && showUnmapped && (
          <div className="unmapped-notice">
            <strong>{unmapped.length} features</strong> didn't match any horizon keywords:{" "}
            {unmapped
              .slice(0, 5)
              .map((f) => `"${getReleaseName(f) || "no release"}"`)
              .join(", ")}
            {unmapped.length > 5 && ` and ${unmapped.length - 5} more`}.
            Adjust keyword mapping in Settings to include them.
          </div>
        )}
        <div className="roadmap-grid">
          {HORIZONS.map((h) => (
            <Column key={h} horizon={h} features={grouped[h]} />
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
      <p style={{ fontSize: 13, marginTop: 4 }}>
        Check that your API token is valid and has the correct scopes.
      </p>
      <button className="btn" onClick={onRetry} style={{ marginTop: 8 }}>
        Try again
      </button>
    </div>
  );
}

// ─── App Root ─────────────────────────────────────────────────────────────────

export default function App() {
  const { status, features, error, progress, load, reset } = useProductBoard();
  const [mapping, setMapping] = useState(() => loadSavedMapping() || DEFAULT_MAPPING);

  // Auto-load on first render
  useEffect(() => {
    load();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return (
    <div className="app">
      {status === "idle" && <LoadingScreen message="Starting…" />}
      {status === "loading" && <LoadingScreen message={progress} />}
      {status === "error" && <ErrorScreen message={error} onRetry={handleReload} />}
      {status === "success" && (
        <RoadmapBoard
          features={features}
          mapping={mapping}
          onMappingChange={setMapping}
          onReload={handleReload}
        />
      )}
    </div>
  );
}
