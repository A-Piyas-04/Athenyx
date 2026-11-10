// Renders index.html to MP4: every frame is renderAt(t), captured by headless Chrome and encoded by ffmpeg.
//   node render.mjs                 full video -> out/athenyx-short.mp4
//   node render.mjs --stills 1,5,9  single frames -> out/still-<t>.png (for review)
import { spawn } from "node:child_process";
import { mkdir, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import puppeteer from "puppeteer-core";

const require = createRequire(import.meta.url);
const ffmpeg = require("@ffmpeg-installer/ffmpeg").path;
const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "out");
const framesDir = path.join(here, ".frames");
const url = pathToFileURL(path.join(here, "index.html")).href;

const CHROME = [
  process.env.CHROME_PATH,
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
].find((p) => p && existsSync(p));

const args = process.argv.slice(2);
const stillsArg = args.includes("--stills") ? args[args.indexOf("--stills") + 1] : null;
const WORKERS = Number(process.env.WORKERS || 4);

async function openPage(browser) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1080, height: 1920, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle0", timeout: 60000 });
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; }))));
  });
  return page;
}

const launch = () =>
  puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 60000,
    args: ["--allow-file-access-from-files", "--hide-scrollbars", "--force-color-profile=srgb"],
  });

async function shoot(page, t, file) {
  for (let attempt = 1; ; attempt++) {
    try {
      await page.evaluate((t) => window.renderAt(t), t);
      await page.screenshot({ path: file, type: "jpeg", quality: 95 });
      return;
    } catch (e) {
      if (attempt >= 3) throw e;
    }
  }
}

async function main() {
  await mkdir(outDir, { recursive: true });
  const browser = await launch();

  try {
    if (stillsArg) {
      const page = await openPage(browser);
      for (const t of stillsArg.split(",").map(Number)) {
        await page.evaluate((t) => window.renderAt(t), t);
        const file = path.join(outDir, `still-${t}.png`);
        await page.screenshot({ path: file });
        console.log("still", file);
      }
      return;
    }

    const probe = await openPage(browser);
    const { FPS, DURATION } = await probe.evaluate(() => window.VIDEO);
    await probe.close();
    const total = Math.round(FPS * DURATION);

    await rm(framesDir, { recursive: true, force: true });
    await mkdir(framesDir, { recursive: true });

    let next = 0, done = 0;
    const started = Date.now();
    // One browser per worker: headless Chrome throttles background tabs and their screenshots stall.
    const worker = async () => {
      const own = await launch();
      try {
        const page = await openPage(own);
        while (next < total) {
          const f = next++;
          await shoot(page, f / FPS, path.join(framesDir, `${String(f).padStart(5, "0")}.jpg`));
          if (++done % 60 === 0) console.log(`frames ${done}/${total} (${((Date.now() - started) / 1000).toFixed(0)}s)`);
        }
      } finally {
        await own.close();
      }
    };
    await Promise.all(Array.from({ length: WORKERS }, worker));

    const out = path.join(outDir, "athenyx-short.mp4");
    await new Promise((resolve, reject) => {
      const p = spawn(ffmpeg, [
        "-y", "-framerate", String(FPS), "-i", path.join(framesDir, "%05d.jpg"),
        "-c:v", "libx264", "-preset", "slow", "-crf", "18", "-pix_fmt", "yuv420p", "-movflags", "+faststart",
        out,
      ], { stdio: ["ignore", "ignore", "pipe"] });
      let err = "";
      p.stderr.on("data", (d) => (err += d));
      p.on("close", (code) => (code === 0 ? resolve() : reject(new Error(err.slice(-2000)))));
    });
    await rm(framesDir, { recursive: true, force: true });
    console.log("video", out);
  } finally {
    await browser.close();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
