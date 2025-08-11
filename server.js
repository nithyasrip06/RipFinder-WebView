import express from "express";
import cron from "node-cron";
import fs from "fs";
import path from "path";
import puppeteer from "puppeteer";

const app = express();
const PORT = process.env.PORT || 8080;

// NOAA Surf Forecast (LA/Oxnard). You can change it later.
const NOAA_URL =
  process.env.NOAA_URL ||
  "https://forecast.weather.gov/product.php?site=LOX&issuedby=LOX&product=SRF&format=CI&version=1&glossary=1&highlight=on";

const PUBLIC_DIR = path.join(process.cwd(), "public");
const SNAP_PATH  = path.join(PUBLIC_DIR, "latest.png");

if (!fs.existsSync(PUBLIC_DIR)) fs.mkdirSync(PUBLIC_DIR, { recursive: true });

// no caching; allow Unity to fetch freely
app.use((_, res, next) => {
  res.set("Cache-Control", "no-store");
  res.set("Access-Control-Allow-Origin", "*");
  next();
});
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

  // Prefer cropping to the <pre> section (cleanest view). Fallback to full page.
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

// initial shot, then every 15 min
takeShot().catch(console.error);
cron.schedule("*/15 * * * *", () => takeShot().catch(console.error));

app.get("/health", (_, res) => res.send("ok"));
app.listen(PORT, () => console.log(`Server running on :${PORT}`));
