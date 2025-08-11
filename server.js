import express from "express";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 8080;

const NOAA_URL =
  process.env.NOAA_URL ||
  "https://forecast.weather.gov/product.php?site=LOX&issuedby=LOX&product=SRF&format=CI&version=1&glossary=1&highlight=on";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const SNAP_PATH  = path.join(PUBLIC_DIR, "latest.png");

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// no-cache + CORS
app.use((_, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Access-Control-Allow-Origin", "*");
  next();
});

// 🔎 log all requests (place BEFORE static so /latest.png is logged)
app.use((req, _res, next) => {
  console.log(`[req] ${req.method} ${req.url}`);
  next();
});

// serve /latest.png
app.use(express.static(PUBLIC_DIR));

async function takeShot() {
  console.log("[snapshot] starting…");
  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox","--disable-setuid-sandbox"]
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 1800, deviceScaleFactor: 2 });
  await page.goto(NOAA_URL, { waitUntil: "networkidle2", timeout: 60000 });

  try {
    const pre = await page.$("pre");
    if (pre) {
      await pre.screenshot({ path: SNAP_PATH });
      console.log("[snapshot] saved cropped <pre> shot");
    } else {
      await page.screenshot({ path: SNAP_PATH, fullPage: true });
      console.log("[snapshot] saved full page shot (no <pre> found)");
    }
  } catch (e) {
    console.error("[snapshot] error during screenshot, falling back:", e.message);
    await page.screenshot({ path: SNAP_PATH, fullPage: true });
  }
  await browser.close();
}

// initial + every 15 minutes
takeShot().catch(console.error);
cron.schedule("*/15 * * * *", () => takeShot().catch(console.error));

app.get("/health", (_, res) => res.send("ok"));
app.get("/", (_req, res) =>
  res
    .type("text/plain")
    .send("RipFinder WebView is running.\nTry /latest.png for the snapshot, or /health.")
);

app.listen(PORT, () => console.log(`Server running on :${PORT}`));
