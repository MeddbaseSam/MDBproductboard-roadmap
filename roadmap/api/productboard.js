/**
 * api/productboard.js — Vercel Serverless Proxy
 *
 * Forwards requests to the ProductBoard API using the token stored
 * securely in Vercel's environment variables. The browser never sees
 * the token.
 *
 * Usage from the frontend:
 *   GET /api/productboard?path=/features&limit=100
 *
 * The `path` query param is forwarded to api.productboard.com.
 */

const https = require("https");

const PB_API_HOST = "api.productboard.com";

module.exports = async (req, res) => {
  // CORS — allow the frontend to call this function
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }

  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiToken = process.env.PRODUCTBOARD_API_TOKEN;
  if (!apiToken) {
    res.status(500).json({
      error: "PRODUCTBOARD_API_TOKEN environment variable is not set.",
    });
    return;
  }

  // The frontend sends ?path=/features%3Flimit%3D100 etc.
  const pbPath = req.query.path;
  if (!pbPath) {
    res.status(400).json({ error: "Missing required query param: path" });
    return;
  }

  // Forward any extra query params (pagination cursors etc.) by passing
  // them through as part of the path string from the client
  await new Promise((resolve) => {
    const options = {
      hostname: PB_API_HOST,
      path: pbPath,
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "X-Version": "1",
        Accept: "application/json",
      },
    };

    const proxyReq = https.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode);
      res.setHeader("Content-Type", "application/json");
      proxyRes.pipe(res);
      proxyRes.on("end", resolve);
    });

    proxyReq.on("error", (err) => {
      res.status(502).json({ error: err.message });
      resolve();
    });

    proxyReq.end();
  });
};
