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

// ─── Export helper ────────────────────────────────────────────────────────────

async function exportBoardAsImage(boardRef) {
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
    scale: 2, useCORS: true, backgroundColor: "#fafaf9", logging: false,
  });
  const link = document.createElement("a");
  link.download = `roadmap-${new Date().toISOString().slice(0, 10)}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

// ─── Roadmap Board ────────────────────────────────────────────────────────────

function RoadmapBoard({ releases, features, onReload }) {
  const [mapping, setMapping] = useState(() => loadSavedMapping() || DEFAULT_MAPPING);
  const [showSettings, setShowSettings] = useState(false);
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [exporting, setExporting] = useState(false);
  const boardRef = useRef(null);

  // Build a map of releaseId -> horizon, filtering out archived releases
  const releaseHorizonMap = useMemo(() => {
    const map = {}; // releaseId -> { horizon, name }
    for (const r of releases) {
      if (r.archived) continue; // hide archived releases entirely
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
      const releaseInfo = f._releaseId ? releaseHorizonMap[f._releaseId] : null;
      if (releaseInfo) {
        grouped[releaseInfo.horizon].features.push(f);
        grouped[releaseInfo.horizon].releaseNames.add(releaseInfo.name);
      } else {
        unmapped.push(f);
      }
    }

    // Sort features within each column by status then name
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
  }, [features, releaseHorizonMap]);

  const totalFeatures = HORIZONS.reduce((n, h) => n + grouped[h].features.length, 0);

  const handleExport = async () => {
    setExporting(true);
    try { await exportBoardAsImage(boardRef); }
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
          <div className="header-logo"><span>PB</span></div>
          <span className="header-title">Now · Next · Later</span>
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
            {exporting ? "Exporting…" : (
              <>
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
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
