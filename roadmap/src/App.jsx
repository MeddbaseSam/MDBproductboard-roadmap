import React, { useState, useMemo, useCallback, useRef, useEffect } from "react";
import "./App.css";
import { useProductBoard } from "./useProductBoard";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getTeamName(feature) {
  if (Array.isArray(feature.teams) && feature.teams.length > 0) return feature.teams[0].name ?? null;
  if (feature.team?.name) return feature.team.name;
  return null;
}

function getProductBoardUrl(feature) {
  return feature.links?.html ?? null;
}

function statusClass(status) {
  if (!status) return "";
  return "status-" + status.toLowerCase().replace(/\s+/g, "-");
}

function formatDate(dateStr) {
  if (!dateStr) return null;
  try {
    return new Date(dateStr).toLocaleDateString("en-GB", { month: "short", year: "numeric" });
  } catch (_) { return null; }
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

const STORAGE_FILTER_KEY = "pb_filter";

function loadSavedFilter() {
  try {
    const raw = localStorage.getItem(STORAGE_FILTER_KEY);
    return raw ? JSON.parse(raw) : { hideArchived: true };
  } catch (_) {
    return { hideArchived: true };
  }
}

// ─── Feature Card ─────────────────────────────────────────────────────────────

function FeatureCard({ feature }) {
  const status = feature.status?.name;
  const team = getTeamName(feature);
  const cvp = feature._cvp;
  const pbUrl = getProductBoardUrl(feature);

  return (
    <div
      className={`feature-card ${pbUrl ? "clickable" : ""}`}
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

// ─── Release Column ───────────────────────────────────────────────────────────

function ReleaseColumn({ release, features }) {
  const dateLabel = release
    ? formatDate(release.startDate)
    : null;

  return (
    <div className="column">
      <div className="column-header">
        <div className="column-label">
          <div className="column-label-dot" style={{
            background: release ? "var(--accent)" : "var(--text-muted)"
          }} />
          <div>
            <span className="column-name">{release ? release.name : "Unassigned"}</span>
            {dateLabel && <span className="column-date">{dateLabel}</span>}
          </div>
        </div>
        <span className="column-count">{features.length}</span>
      </div>

      {features.length === 0 ? (
        <div className="empty-column"><span>No features</span></div>
      ) : (
        <div className="column-cards">
          {features.map((f) => <FeatureCard key={f.id} feature={f} />)}
        </div>
      )}
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
  const [hideArchived, setHideArchived] = useState(() => loadSavedFilter().hideArchived);
  const [hideEmpty, setHideEmpty] = useState(false);
  const [exporting, setExporting] = useState(false);
  const boardRef = useRef(null);

  // Save filter preference
  useEffect(() => {
    try { localStorage.setItem(STORAGE_FILTER_KEY, JSON.stringify({ hideArchived })); } catch (_) {}
  }, [hideArchived]);

  const { columns, unassignedFeatures, totalShown } = useMemo(() => {
    const filtered = hideArchived ? features.filter((f) => !f.archived) : features;

    // Group by releaseId
    const byRelease = {};
    const unassigned = [];
    for (const f of filtered) {
      if (f._releaseId) {
        if (!byRelease[f._releaseId]) byRelease[f._releaseId] = [];
        byRelease[f._releaseId].push(f);
      } else {
        unassigned.push(f);
      }
    }

    // Sort features within each column by status then name
    const sortFeatures = (arr) => arr.sort((a, b) => {
      const sa = (a.status?.name ?? "").toLowerCase();
      const sb = (b.status?.name ?? "").toLowerCase();
      if (sa !== sb) return sa.localeCompare(sb);
      return (a.name ?? "").toLowerCase().localeCompare((b.name ?? "").toLowerCase());
    });

    const columns = releases.map((r) => ({
      release: r,
      features: sortFeatures(byRelease[r.id] ?? []),
    }));

    const sortedUnassigned = sortFeatures(unassigned);

    const totalShown = filtered.length;

    return { columns, unassignedFeatures: sortedUnassigned, totalShown };
  }, [features, releases, hideArchived]);

  const visibleColumns = hideEmpty
    ? columns.filter((c) => c.features.length > 0)
    : columns;

  const handleExport = async () => {
    setExporting(true);
    try { await exportBoardAsImage(boardRef); }
    catch (e) { alert("Export failed: " + e.message); }
    finally { setExporting(false); }
  };

  return (
    <>
      <div className="header">
        <div className="header-brand">
          <div className="header-logo"><span>PB</span></div>
          <span className="header-title">Release Roadmap</span>
        </div>
        <div className="header-actions">
          <span className="roadmap-count">
            <strong>{totalShown}</strong> features · <strong>{releases.length}</strong> releases
          </span>
          <label className="toggle-label">
            <input type="checkbox" checked={hideArchived} onChange={(e) => setHideArchived(e.target.checked)} />
            Hide archived
          </label>
          <label className="toggle-label">
            <input type="checkbox" checked={hideEmpty} onChange={(e) => setHideEmpty(e.target.checked)} />
            Hide empty
          </label>
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
        </div>
      </div>

      <div className="roadmap-body">
        <div className="roadmap-grid" ref={boardRef}>
          {visibleColumns.map(({ release, features: rFeatures }) => (
            <ReleaseColumn key={release.id} release={release} features={rFeatures} />
          ))}
          {unassignedFeatures.length > 0 && (
            <ReleaseColumn key="unassigned" release={null} features={unassignedFeatures} />
          )}
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
