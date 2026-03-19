# ProductBoard Now · Next · Later Roadmap

A React app that fetches your ProductBoard features and displays them in a Now / Next / Later roadmap view. Designed to deploy as a static site on **GitHub Pages** — no server or proxy required.

## Features

- **Now / Next / Later board** — features bucketed by timeframe/release keyword mapping you define
- **Team** — displays the assigned team on each feature card
- **Customer Value Proposition** — fetches the custom field and shows it below the feature name
- **Click to open** — click any card to open the feature directly in ProductBoard
- **Export as PNG** — one-click image export of the full board via html2canvas
- **No backend** — fetches directly from the ProductBoard API using a browser-side Bearer token

---

## Quick start (local dev)

```bash
npm install
npm start
```

Open [http://localhost:3000](http://localhost:3000), paste your ProductBoard API token, and load the board.

---

## Deploy to GitHub Pages

### 1. Fork / clone this repo

```bash
git clone https://github.com/YOUR_USERNAME/productboard-roadmap.git
cd productboard-roadmap
npm install
```

### 2. Set your GitHub Pages URL

Edit `package.json` and update the `homepage` field:

```json
"homepage": "https://YOUR_USERNAME.github.io/productboard-roadmap"
```

If you're using a custom domain, use that instead.

### 3. Deploy

```bash
npm run deploy
```

This builds the app and pushes it to the `gh-pages` branch of your repo. GitHub Pages will serve it automatically.

### 4. Enable GitHub Pages (first time only)

In your repo: **Settings → Pages → Source → Deploy from branch → `gh-pages` → `/ (root)`**

### 5. Open the app

Visit `https://YOUR_USERNAME.github.io/productboard-roadmap` and connect with your API token.

> **Note on token security**: Your API token is entered in the browser and stored only in `sessionStorage` for the duration of the browser session. It is never sent anywhere except directly to `api.productboard.com`. The site itself is fully static.

---

## How it works

### Horizon assignment

Each feature's timeframe or release name is matched against keyword lists you configure on the setup screen. Matching is case-insensitive and partial:

| Horizon | Default keywords |
|---------|-----------------|
| Now | `now`, `current`, `q1`, `this quarter` |
| Next | `next`, `q2`, `upcoming` |
| Later | `later`, `future`, `q3`, `q4`, `backlog` |

You can customise these. Features with no matching release, or releases matching no keyword, show as "unmapped" with a count in the toolbar.

### Custom field (Customer Value Proposition)

On load, the app:
1. Calls `/custom-fields` to find the field ID for "Customer Value Proposition"
2. Fetches the value for each feature from `/features/{id}/custom-fields/{fieldId}` (batched, 5 at a time)

If the field doesn't exist in your board, it's silently skipped.

### Teams

Reads from `feature.teams[0].name` or `feature.team.name` depending on your ProductBoard API response shape.

### Click to open

Each card links to `feature.links.html` — the direct URL to the feature in the ProductBoard UI.

---

## Project structure

```
productboard-roadmap/
├── package.json              # Includes gh-pages deploy script
├── public/
│   └── index.html
└── src/
    ├── index.js
    ├── App.jsx               # All UI components
    ├── App.css               # Styles
    └── useProductBoard.js    # API fetching hook
```

---

## Troubleshooting

**401 error** — API token invalid or expired. Regenerate at ProductBoard → Settings → Integrations → API Access.

**Customer Value Proposition not showing** — Check the field name matches exactly (case-insensitive). If the field has a different name in your board, the app will silently skip it.

**Features showing as unmapped** — Click "N unmapped" in the toolbar to see which release names aren't matching, then add those terms to your keyword mapping.

**Export looks cut off** — The export captures the visible board area. Scroll to the top before exporting, or filter to fewer features first.
