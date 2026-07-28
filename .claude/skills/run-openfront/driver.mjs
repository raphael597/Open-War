// Headless-Chromium driver for OpenFront. Run from the repo root:
//   node .claude/skills/run-openfront/driver.mjs          # smoke flow
// or import { launch, gotoHome, openSoloModal } from it in an ad-hoc
// script placed inside the repo (so `playwright` resolves from
// node_modules). Requires setup.sh to have been run once on this machine.
import fs from "fs";
import os from "os";
import path from "path";
import { chromium } from "playwright";

const CACHE =
  process.env.OPENFRONT_RUN_CACHE ??
  path.join(os.homedir(), ".cache", "openfront-run");
export const BASE_URL = process.env.OPENFRONT_URL ?? "http://localhost:9000";

// Launch chromium with the locally-extracted system libraries and fontconfig
// (see setup.sh). Without them the headless shell dies on libnspr4.so, and
// later Skia FATALs on the missing fontconfig.
// opts:
//   viewport      - {width, height}, default 1400x1000
//   rafIntervalMs - throttle requestAnimationFrame to one frame per interval.
//                   Essential for in-game testing: SwiftShader needs seconds
//                   of CPU per frame, and an unthrottled rAF loop starves the
//                   main thread (timers, the singleplayer turn loop, input).
//                   ~1000 is a good value; frames still render for screenshots.
//   args          - extra Chromium flags appended to the defaults.
//   spoofHardwareGL - make the software WebGL2 context look accelerated so
//                   initGL accepts it. Required for in-game work on a machine
//                   without a GPU; see the init script below.
export async function launch({
  viewport,
  rafIntervalMs,
  args,
  spoofHardwareGL,
} = {}) {
  const env = { ...process.env };
  const libs = path.join(CACHE, "extracted", "usr", "lib", "x86_64-linux-gnu");
  if (fs.existsSync(libs)) {
    env.LD_LIBRARY_PATH = env.LD_LIBRARY_PATH
      ? `${libs}:${env.LD_LIBRARY_PATH}`
      : libs;
    env.FONTCONFIG_FILE = path.join(CACHE, "fonts.conf");
  }
  const browser = await chromium.launch({
    // Set OPENFRONT_CHROME when the machine already has a Chromium that
    // Playwright's own download can't reach (offline CI, proxied networks).
    executablePath: process.env.OPENFRONT_CHROME || undefined,
    args: ["--no-sandbox", "--disable-gpu", ...(args ?? [])],
    env,
  });
  const context = await browser.newContext({
    viewport: viewport ?? { width: 1400, height: 1000 },
  });
  if (spoofHardwareGL) {
    // initGL (src/client/render/gl/initGL.ts) refuses a software WebGL2
    // context — the game really is unplayable at ~1fps on SwiftShader. On a
    // GPU-less CI box that means no in-game screenshots at all, so present the
    // context as accelerated: drop failIfMajorPerformanceCaveat (Chrome
    // returns null for it under SwiftShader) and report a hardware renderer
    // string. Rendering is correct, just slow. Test harness only.
    await context.addInitScript(() => {
      const UNMASKED_RENDERER_WEBGL = 0x9246;
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        if (attrs && typeof attrs === "object") {
          const { failIfMajorPerformanceCaveat: _drop, ...rest } = attrs;
          return origGetContext.call(this, type, rest);
        }
        return origGetContext.call(this, type, attrs);
      };
      for (const proto of [
        window.WebGLRenderingContext?.prototype,
        window.WebGL2RenderingContext?.prototype,
      ]) {
        if (!proto) continue;
        const origGetParameter = proto.getParameter;
        proto.getParameter = function (pname) {
          if (pname === UNMASKED_RENDERER_WEBGL) return "OpenWar Test GPU";
          return origGetParameter.call(this, pname);
        };
      }
    });
  }
  if (rafIntervalMs) {
    await context.addInitScript((interval) => {
      let last = 0;
      window.requestAnimationFrame = (cb) => {
        const now = performance.now();
        const wait = Math.max(0, interval - (now - last));
        return setTimeout(() => {
          last = performance.now();
          cb(last);
        }, wait);
      };
      window.cancelAnimationFrame = (id) => clearTimeout(id);
    }, rafIntervalMs);
  }
  const page = await context.newPage();
  page.on("pageerror", (e) =>
    console.log("PAGEERROR:", e.message.split("\n")[0]),
  );
  page.on("crash", () => console.log("PAGE CRASHED"));
  return { browser, page };
}

export async function gotoHome(page) {
  await page.goto(BASE_URL, { waitUntil: "load", timeout: 60000 });
  // Lit components render client-side after load.
  await page.waitForTimeout(3000);
}

// The single-player button is labeled "SOLO!". There are multiple SOLO
// buttons in the DOM (responsive layouts) — only one is visible.
export async function openSoloModal(page) {
  await page.locator("button:visible", { hasText: /solo/i }).first().click();
  await page.waitForTimeout(1500);
}

const isMain =
  process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const outDir = "/tmp/openfront-run";
  fs.mkdirSync(outDir, { recursive: true });
  const { browser, page } = await launch();
  await gotoHome(page);
  await page.screenshot({ path: `${outDir}/home.png` });
  await openSoloModal(page);
  await page.screenshot({ path: `${outDir}/solo-modal.png` });
  // Reach into a Lit component for ground-truth state (light DOM, no shadow
  // root — properties are directly on the element).
  const picker = await page.evaluate(() => {
    const p = document.querySelector("map-picker");
    return { selectedMap: p?.selectedMap, activeTab: p?.activeTab };
  });
  console.log("map-picker state:", JSON.stringify(picker));
  console.log(`screenshots: ${outDir}/home.png ${outDir}/solo-modal.png`);
  await browser.close();
}
