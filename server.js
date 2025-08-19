import express from "express";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 8080;

// NOAA LA/Oxnard Surf Forecast source
const NOAA_URL =
  process.env.NOAA_URL ||
  "https://forecast.weather.gov/product.php?site=LOX&issuedby=LOX&product=SRF&format=CI&version=1&glossary=1&highlight=on";

// Pick the section to display. Accepts text or zone code.
// Defaults to San Luis Obispo County Beaches (CAZ340).
const ZONE_MATCH = process.env.ZONE_MATCH || "CAZ340";

// Output path
const PUBLIC_DIR = path.join(process.cwd(), "public");
const SNAP_PATH  = path.join(PUBLIC_DIR, "latest.png");

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Middleware: enable CORS + disable caching
app.use((_, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

// Request logger
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

// Serve static files
app.use(express.static(PUBLIC_DIR));

// ---- helpers ----

// Escape HTML for clean rendering
function escapeHtml(s) {
  return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
}

// Extract a specific zone section from NOAA text blocks
function extractZoneSection(preText, zoneMatch) {
  const sections = preText.split("$$");
  const rx = new RegExp(zoneMatch, "i");
  for (const s of sections) {
    if (rx.test(s)) return s.replace(/\n{3,}/g, "\n\n").trim();
  }
  return null;
}

// Take a snapshot of the forecast and save it as PNG
async function takeShot() {
  console.log("[snapshot] starting…");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1100, height: 1600, deviceScaleFactor: 2 });

  await page.goto(NOAA_URL, { waitUntil: "networkidle2", timeout: 60000 });

  let preText = "";
  try {
    // Extract text from <pre> if available
    preText = await page.$eval("pre", (el) => el.innerText);
  } catch {
    console.warn("[snapshot] <pre> not found; falling back to full page screenshot");
    await page.screenshot({ path: SNAP_PATH, fullPage: true });
    await browser.close();
    return;
  }

  // Extract only the desired zone (SLO / CAZ340 by default)
  const picked = extractZoneSection(preText, ZONE_MATCH);
  const header = (ZONE_MATCH.toUpperCase().startsWith("CAZ"))
    ? "San Luis Obispo County Beaches"
    : ZONE_MATCH;

  const now = new Date().toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const content = picked ?? "⚠️ Requested section not found in this product.";

  // Build a clean HTML and render to PNG
  const html = `<!doctype html>
<html><head><meta charset="utf-8">
<style>
  html,body{margin:0;background:#ffffff;color:#111;}
  .wrap{padding:24px 28px 32px 28px;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Roboto Mono",monospace;line-height:1.35;}
  h1{margin:0 0 4px 0;font:700 20px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial;}
  .sub{color:#666;margin:0 0 16px 0;font:500 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,Arial;}
  pre{margin:0;font-size:18px;white-space:pre-wrap;word-wrap:break-word;}
  .hr{height:1px;background:#e6e6e6;margin:14px 0 16px;}
</style></head>
<body><div class="wrap">
  <h1>${escapeHtml(header)}</h1>
  <div class="sub">Updated: ${escapeHtml(now)} PT · Source: NWS/NOAA (LOX SRF)</div>
  <div class="hr"></div>
  <pre>${escapeHtml(content)}</pre>
</div></body></html>`;

  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: SNAP_PATH, fullPage: true });

  await browser.close();
  console.log("[snapshot] saved SLO-only shot →", SNAP_PATH);
}

// ---- schedule ----
takeShot().catch(console.error);                 
cron.schedule("*/15 * * * *", () => takeShot().catch(console.error)); 

// ---- routes ----
app.get("/health", (_, res) => res.send("ok"));
app.get("/", (_req, res) =>
  res
    .type("text/plain")
    .send("RipFinder WebView is running.\nTry /latest.png for the snapshot, or /health.")
);

// ---- start ----
app.listen(PORT, () => console.log(`Server running on :${PORT}`));
