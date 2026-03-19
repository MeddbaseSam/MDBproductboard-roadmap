/**
 * api/productboard.js — Vercel Serverless Proxy
 *
 * Forwards requests to the ProductBoard API v1 using the token stored
 * in Vercel environment variables. The browser never sees the token.
 *
 * Usage: GET /api/productboard?path=/features
 */

const https = require("https");
const PB_API_HOST = "api.productboard.com";

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") { res.status(204).end(); return; }
  if (req.method !== "GET") { res.status(405).json({ error: "Method not allowed" }); return; }

  const apiToken = process.env.PRODUCTBOARD_API_TOKEN;
  if (!apiToken) { res.status(500).json({ error: "PRODUCTBOARD_API_TOKEN is not configured." }); return; }

  const pbPath = req.query.path;
  if (!pbPath) { res.status(400).json({ error: "Missing required query param: path" }); return; }

  console.log(`Proxying: GET https://${PB_API_HOST}${pbPath}`);

  await new Promise((resolve) => {
    const options = {
      hostname: PB_API_HOST,
      path: pbPath,
      method: "GET",
      headers: {
        "Authorization": `Bearer ${apiToken}`,
        "X-Version": "1",
        "Accept": "application/json",
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      console.log(`ProductBoard response: ${proxyRes.statusCode} for ${pbPath}`);
      res.status(proxyRes.statusCode);
      res.setHeader("Content-Type", "application/json");
      proxyRes.pipe(res);
      proxyRes.on("end", resolve);
    });

    proxyReq.on("error", (err) => {
      console.error(`Proxy error: ${err.message}`);
      res.status(502).json({ error: err.message });
      resolve();
    });

    proxyReq.end();
  });
};