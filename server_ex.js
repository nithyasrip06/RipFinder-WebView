import express from "express";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 8080;

// Source page to screenshot (set PAGE_URL in env)
const PAGE_URL =
  process.env.PAGE_URL ||
  "https://forecast.weather.gov/product.php?site=LOX&issuedby=LOX&product=SRF&format=CI&version=1&glossary=1&highlight=on";

// Output path for generated snapshot
const PUBLIC_DIR = path.join(process.cwd(), "public");
const SNAP_PATH  = path.join(PUBLIC_DIR, "latest.png");

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// Middleware: CORS + no-cache
app.use((_, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

// Basic request logger
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

// Serve static files (e.g., /latest.png)
app.use(express.static(PUBLIC_DIR));

// Take a full-page screenshot of PAGE_URL → latest.png
async function takeShot() {
  console.log("[snapshot] starting…", PAGE_URL);
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"]
  });

  try {
    const page = await browser.newPage();

    // Tweak viewport to control default layout width; fullPage captures full height.
    await page.setViewport({ width: 1200, height: 1800, deviceScaleFactor: 2 });

    await page.goto(PAGE_URL, { waitUntil: "networkidle2", timeout: 60000 });

    await page.screenshot({ path: SNAP_PATH, fullPage: true });
    console.log("[snapshot] saved →", SNAP_PATH);
  } catch (err) {
    console.error("[snapshot] error:", err);
  } finally {
    await browser.close();
  }
}

/* ---------- Scheduler ---------- */

// Run once at startup
takeShot().catch(console.error);

// Repeat every 15 minutes
cron.schedule("*/15 * * * *", () => takeShot().catch(console.error));

/* ---------- Routes ---------- */

app.get("/health", (_, res) => res.send("ok"));

app.get("/", (_req, res) =>
  res
    .type("text/plain")
    .send("WebView Snapshot is running.\nTry /latest.png for the snapshot, or /health.")
);

/* ---------- Start Server ---------- */
app.listen(PORT, () => console.log(`Server running on :${PORT}`));
