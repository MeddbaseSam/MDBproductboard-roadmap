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
  // Group features by team, sort teams alpha with No team last,
  // sort features within each team by name
  const teamGroups = useMemo(() => {
    const groups = {};
    for (const f of features) {
      const team = f._team ?? "No team";
      if (!groups[team]) groups[team] = [];
      groups[team].push(f);
    }
    return Object.entries(groups)
      .sort(([a], [b]) => {
        if (a === "No team") return 1;
        if (b === "No team") return -1;
        return a.localeCompare(b);
      })
      .map(([teamName, teamFeatures]) => [
        teamName,
        [...teamFeatures].sort((a, b) =>
          (a.name ?? "").localeCompare(b.name ?? "")
        ),
      ]);
  }, [features]);

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

// ─── Slide layout constants ───────────────────────────────────────────────────

const SLIDE_W = 1920;
const SLIDE_H = 1080;
const HEADER_H = 76;          // header bar height
const PADDING_H = 44;         // top + bottom padding in content area
const PADDING_W = 96;         // left + right total padding
const COL_GAP = 20;           // gap between team columns
const CARD_PAD = 14;          // inner card padding
const CARD_MB = 8;            // card margin-bottom
const TEAM_HEADER_H = 32;     // team label + border
const CARD_BASE_H = 52;       // card with just name + status (no CVP)
const CVP_LINE_H = 17;        // height per CVP line
const CVP_MAX_LINES = 2;      // max CVP lines shown
const MAX_COLS = 6;           // max team columns per slide

const CONTENT_H = SLIDE_H - HEADER_H - PADDING_H;

// Estimate card height based on whether it has CVP
function estimateCardH(f) {
  const cvpLines = f._cvp ? CVP_MAX_LINES : 0;
  return CARD_BASE_H + (cvpLines * CVP_LINE_H) + CARD_MB;
}

// Escape HTML special chars
function esc(str) {
  return String(str ?? "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");
}

// Build HTML for a single card
function cardHTML(f, accent) {
  const status = f.status?.name ?? "";
  const sc = getStatusStyle(status);
  const cvp = f._cvp
    ? `<div style="font-size:11px;line-height:1.5;color:#4A6278;margin-bottom:7px;display:-webkit-box;-webkit-line-clamp:${CVP_MAX_LINES};-webkit-box-orient:vertical;overflow:hidden;">${esc(f._cvp)}</div>`
    : "";
  const badge = status
    ? `<span style="font-size:10px;font-weight:600;padding:2px 7px;border-radius:4px;background:${sc.bg};color:${sc.color};text-transform:capitalize;display:inline-block;">${esc(status)}</span>`
    : "";
  return `<div style="background:#fff;border:1px solid #DDE4EC;border-left:3px solid ${accent};border-radius:6px;padding:${CARD_PAD}px;margin-bottom:${CARD_MB}px;">
    <div style="font-size:12px;font-weight:600;line-height:1.4;color:#0D2B45;margin-bottom:5px;">${esc(f.name)}</div>
    ${cvp}${badge}
  </div>`;
}

// Build the header HTML (reused across all slides for a horizon)
function headerHTML(label, releaseNames, totalFeatures, date, slideNum, totalSlides) {
  const pageLabel = totalSlides > 1 ? ` · Slide ${slideNum} of ${totalSlides}` : "";
  return `<div style="background:#0D2B45;padding:18px 48px 16px;display:flex;align-items:center;gap:20px;border-bottom:4px solid #dc3b42;flex-shrink:0;height:${HEADER_H}px;box-sizing:border-box;">
    <img src="https://www.meddbase.com/wp-content/uploads/2025/06/MeddbaseByCority.webp" alt="Meddbase" style="height:26px;object-fit:contain;flex-shrink:0;filter:brightness(0) invert(1);" crossorigin="anonymous" />
    <div style="width:1px;height:22px;background:rgba(255,255,255,0.2);flex-shrink:0;"></div>
    <div style="display:flex;align-items:baseline;gap:12px;">
      <span style="font-size:24px;font-weight:700;color:#fff;letter-spacing:-0.3px;">${label}</span>
      ${releaseNames.length > 0 ? `<span style="font-size:12px;color:rgba(255,255,255,0.5);">${releaseNames.join(" · ")}</span>` : ""}
    </div>
    <div style="margin-left:auto;text-align:right;">
      <div style="font-size:11px;color:rgba(255,255,255,0.45);">${date}${pageLabel}</div>
      <div style="font-size:11px;color:rgba(255,255,255,0.45);margin-top:2px;">${totalFeatures} features</div>
    </div>
  </div>`;
}

// Wrap content into a full 1920x1080 slide HTML document
function wrapSlide(headerHtml, bodyHtml) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>* { box-sizing:border-box; margin:0; padding:0; } body { width:${SLIDE_W}px; height:${SLIDE_H}px; overflow:hidden; background:#F4F7FA; font-family:'Inter',system-ui,sans-serif; }</style>
  </head><body>
  <div style="width:${SLIDE_W}px;height:${SLIDE_H}px;background:#F4F7FA;display:flex;flex-direction:column;">
    ${headerHtml}
    <div style="flex:1;overflow:hidden;padding:20px 48px 24px;display:flex;flex-direction:row;gap:${COL_GAP}px;align-items:flex-start;">
      ${bodyHtml}
    </div>
  </div>
  </body></html>`;
}

/**
 * Paginate features into slides.
 *
 * Strategy:
 *  - One column per team, up to MAX_COLS columns per slide.
 *  - If a team has more cards than fit in CONTENT_H, split that team
 *    across multiple slides (continuing label shown).
 *  - Column width is always (SLIDE_W - PADDING_W - (numCols-1)*COL_GAP) / numCols.
 */
function paginateIntoSlides(horizon, features, releaseNames) {
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

  // For each team, calculate how many cards fit per column-height
  // and split the team's features into page-sized chunks
  const teamChunks = []; // [{ teamName, features[] }]
  for (const [teamName, teamFeatures] of sortedTeams) {
    let remaining = [...teamFeatures];
    let isFirst = true;
    while (remaining.length > 0) {
      let usedH = TEAM_HEADER_H;
      const batch = [];
      for (const f of remaining) {
        const h = estimateCardH(f);
        if (usedH + h > CONTENT_H && batch.length > 0) break;
        usedH += h;
        batch.push(f);
      }
      teamChunks.push({ teamName: isFirst ? teamName : `${teamName} (cont.)`, features: batch });
      remaining = remaining.slice(batch.length);
      isFirst = false;
    }
  }

  // Group chunks into slides of MAX_COLS columns each
  const slideChunkGroups = [];
  for (let i = 0; i < teamChunks.length; i += MAX_COLS) {
    slideChunkGroups.push(teamChunks.slice(i, i + MAX_COLS));
  }

  const totalSlides = slideChunkGroups.length;

  // Build HTML for each slide
  return slideChunkGroups.map((chunks, slideIdx) => {
    const numCols = chunks.length;
    const colWidth = Math.floor((SLIDE_W - PADDING_W - (numCols - 1) * COL_GAP) / numCols);

    const bodyCols = chunks.map(({ teamName, features: chunkFeatures }) => {
      const cards = chunkFeatures.map((f) => cardHTML(f, c.accent)).join("");
      return `<div style="width:${colWidth}px;flex-shrink:0;display:flex;flex-direction:column;">
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.09em;color:#8A9BAA;padding-bottom:6px;margin-bottom:8px;border-bottom:2px solid ${c.accent};">${esc(teamName)}</div>
        <div style="overflow:hidden;">${cards}</div>
      </div>`;
    }).join("");

    const hdr = headerHTML(label, releaseNames, features.length, date, slideIdx + 1, totalSlides);
    return wrapSlide(hdr, bodyCols);
  });
}

async function loadLib(src) {
  const key = src.includes("jszip") ? "JSZip" : "html2canvas";
  if (window[key]) return;
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = resolve;
    s.onerror = reject;
    document.head.appendChild(s);
  });
}

async function captureIframe(html) {
  const iframe = document.createElement("iframe");
  iframe.style.cssText = `position:fixed;left:-9999px;top:-9999px;width:${SLIDE_W}px;height:${SLIDE_H}px;border:none;visibility:hidden;`;
  document.body.appendChild(iframe);
  iframe.contentDocument.open();
  iframe.contentDocument.write(html);
  iframe.contentDocument.close();
  await new Promise((r) => setTimeout(r, 700)); // wait for fonts
  const canvas = await window.html2canvas(iframe.contentDocument.body, {
    width: SLIDE_W, height: SLIDE_H, scale: 1,
    useCORS: true, backgroundColor: "#F4F7FA",
    logging: false, windowWidth: SLIDE_W, windowHeight: SLIDE_H,
  });
  document.body.removeChild(iframe);
  return canvas;
}

async function exportSlidesAsZip(grouped) {
  await Promise.all([
    loadLib("https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"),
    loadLib("https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"),
  ]);

  const zip = new window.JSZip();
  const date = new Date().toISOString().slice(0, 10);
  let fileIndex = 1;

  for (const horizon of ["now", "next", "later"]) {
    const { features, releaseNames } = grouped[horizon];
    if (features.length === 0) continue;

    const slides = paginateIntoSlides(horizon, features, releaseNames);

    for (let i = 0; i < slides.length; i++) {
      const canvas = await captureIframe(slides[i]);
      const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
      const suffix = slides.length > 1 ? `-${i + 1}of${slides.length}` : "";
      zip.file(`${String(fileIndex).padStart(2,"0")}-roadmap-${horizon}${suffix}-${date}.png`, blob);
      fileIndex++;
    }
  }

  const zipBlob = await zip.generateAsync({ type: "blob" });
  const link = document.createElement("a");
  link.download = `roadmap-slides-${date}.zip`;
  link.href = URL.createObjectURL(zipBlob);
  link.click();
  URL.revokeObjectURL(link.href);
}

// ─── Roadmap Board ────────────────────────────────────────────────────────────

function RoadmapBoard({ releases, features, objectives, onReload }) {
  const [mapping, setMapping] = useState(() => loadSavedMapping() || DEFAULT_MAPPING);
  const [showSettings, setShowSettings] = useState(false);
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [exporting, setExporting] = useState(false);
  const DEFAULT_VISIBLE_STATUSES = ["backlog", "in design", "in development", "planned"];

  const [hiddenStatuses, setHiddenStatuses] = useState(() => {
    try {
      const saved = localStorage.getItem("pb_hidden_statuses");
      // If user has never configured the filter, return null to signal "use defaults"
      return saved !== null ? JSON.parse(saved) : null;
    }
    catch (_) { return null; }
  });
  const [showStatusFilter, setShowStatusFilter] = useState(false);
  const [selectedObjectives, setSelectedObjectives] = useState(() => {
    try { return JSON.parse(localStorage.getItem("pb_selected_objectives") || "[]"); }
    catch (_) { return []; }
  });
  const [showObjectiveFilter, setShowObjectiveFilter] = useState(false);
  const boardRef = useRef(null); // kept for future use

  const toggleObjective = (objName) => {
    setSelectedObjectives((prev) => {
      const next = prev.includes(objName)
        ? prev.filter((o) => o !== objName)
        : [...prev, objName];
      try { localStorage.setItem("pb_selected_objectives", JSON.stringify(next)); } catch (_) {}
      return next;
    });
  };

  // Collect all unique statuses from features for the filter UI
  const allStatuses = useMemo(() => {
    const seen = new Set();
    for (const f of features) {
      if (f.status?.name) seen.add(f.status.name);
    }
    return [...seen].sort();
  }, [features]);

  // On first load, if no saved filter exists, hide everything not in DEFAULT_VISIBLE_STATUSES
  useEffect(() => {
    if (hiddenStatuses === null && allStatuses.length > 0) {
      const toHide = allStatuses.filter(
        (s) => !DEFAULT_VISIBLE_STATUSES.some(
          (v) => s.toLowerCase().includes(v.toLowerCase())
        )
      );
      setHiddenStatuses(toHide);
      try { localStorage.setItem("pb_hidden_statuses", JSON.stringify(toHide)); } catch (_) {}
    }
  }, [allStatuses]); // eslint-disable-line react-hooks/exhaustive-deps

  // Use empty array if still null (before allStatuses loads)
  const activeHiddenStatuses = hiddenStatuses ?? [];

  const toggleStatus = (statusName) => {
    setHiddenStatuses((prev) => {
      const current = prev ?? [];
      const next = current.includes(statusName)
        ? current.filter((s) => s !== statusName)
        : [...current, statusName];
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
      if (activeHiddenStatuses.includes(f.status?.name)) continue;
      // Apply objective filter — if any objectives selected, feature must match at least one
      if (selectedObjectives.length > 0) {
        const featureObjectives = f._objectives ?? [];
        const matches = selectedObjectives.some((o) => featureObjectives.includes(o));
        if (!matches) continue;
      }
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
  }, [features, releaseHorizonMap, hiddenStatuses, selectedObjectives, activeHiddenStatuses]);

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
              Status {activeHiddenStatuses.length > 0 ? `(${activeHiddenStatuses.length} hidden)` : "filter"}
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
                      checked={!activeHiddenStatuses.includes(s)}
                      onChange={() => toggleStatus(s)}
                    />
                    <span className={`card-status ${statusClass(s)}`}>{s}</span>
                  </label>
                ))}
                {activeHiddenStatuses.length > 0 && (
                  <button
                    className="btn btn-sm"
                    style={{ width: "100%", marginTop: 8 }}
                    onClick={() => { setHiddenStatuses([]); try { localStorage.setItem("pb_hidden_statuses", "[]"); } catch(_){} }}
                  >
                    Show all
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="status-filter-wrap">
            <button className="btn btn-sm" onClick={() => setShowObjectiveFilter((v) => !v)}>
              Objective {selectedObjectives.length > 0 ? `(${selectedObjectives.length})` : "filter"}
            </button>
            {showObjectiveFilter && (
              <div className="status-filter-dropdown">
                <div style={{ fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--text-muted)", marginBottom: 8 }}>
                  Filter by objective
                </div>
                {objectives.map((obj) => (
                  <label key={obj.id} className="status-filter-item">
                    <input
                      type="checkbox"
                      checked={selectedObjectives.includes(obj.name)}
                      onChange={() => toggleObjective(obj.name)}
                    />
                    <span style={{ fontSize: 12 }}>{obj.name}</span>
                  </label>
                ))}
                {selectedObjectives.length > 0 && (
                  <button
                    className="btn btn-sm"
                    style={{ width: "100%", marginTop: 8 }}
                    onClick={() => { setSelectedObjectives([]); try { localStorage.removeItem("pb_selected_objectives"); } catch(_){} }}
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
  const { status, releases, features, objectives, error, progress, load, reset } = useProductBoard();

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
          objectives={objectives}
          onReload={handleReload}
        />
      )}
    </div>
  );
}
