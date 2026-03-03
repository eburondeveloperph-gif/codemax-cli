/**
 * Browser Agent — Browserbase (cloud) primary, VPS Puppeteer fallback.
 * Takes screenshots of deployed apps via headless Chrome.
 */

const BB_API_KEY = process.env.BROWSERBASE_API_KEY;
const BB_PROJECT_ID = process.env.BROWSERBASE_PROJECT_ID;

interface ScreenshotResult {
  desktop?: string; // base64 data URI
  mobile?: string;
  source: "browserbase" | "vps" | "none";
  error?: string;
}

/** Take screenshot via Browserbase cloud browser */
async function screenshotViaBrowserbase(url: string): Promise<ScreenshotResult> {
  if (!BB_API_KEY || !BB_PROJECT_ID) {
    throw new Error("Browserbase credentials not configured");
  }

  const { default: Browserbase } = await import("@browserbasehq/sdk");
  const { default: puppeteer } = await import("puppeteer-core");

  const bb = new Browserbase({ apiKey: BB_API_KEY });

  // Desktop screenshot
  const desktopSession = await bb.sessions.create({
    projectId: BB_PROJECT_ID,
    browserSettings: {
      viewport: { width: 1280, height: 800 },
    },
  });

  const desktopBrowser = await puppeteer.connect({
    browserWSEndpoint: desktopSession.connectUrl,
  });

  let desktopB64 = "";
  let mobileB64 = "";

  try {
    const page = (await desktopBrowser.pages())[0] || await desktopBrowser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    const desktopBuf = await page.screenshot({ type: "png", fullPage: false }) as Buffer;
    desktopB64 = `data:image/png;base64,${Buffer.from(desktopBuf).toString("base64")}`;
  } finally {
    await desktopBrowser.close();
  }

  // Mobile screenshot
  const mobileSession = await bb.sessions.create({
    projectId: BB_PROJECT_ID,
    browserSettings: {
      viewport: { width: 375, height: 812 },
    },
  });

  const mobileBrowser = await puppeteer.connect({
    browserWSEndpoint: mobileSession.connectUrl,
  });

  try {
    const page = (await mobileBrowser.pages())[0] || await mobileBrowser.newPage();
    await page.goto(url, { waitUntil: "networkidle2", timeout: 20000 });
    await new Promise(r => setTimeout(r, 1500));
    const mobileBuf = await page.screenshot({ type: "png", fullPage: false }) as Buffer;
    mobileB64 = `data:image/png;base64,${Buffer.from(mobileBuf).toString("base64")}`;
  } finally {
    await mobileBrowser.close();
  }

  return { desktop: desktopB64, mobile: mobileB64, source: "browserbase" };
}

/** Take screenshot via VPS Puppeteer (SSH) */
async function screenshotViaVPS(url: string): Promise<ScreenshotResult> {
  const VPS_HOST = process.env.VPS_HOST || "168.231.78.113";
  const VPS_PASS = "Master120221@";
  const SCRIPT = "/opt/eburon-sandbox/browser-agent/screenshot.js";

  const { execSync } = await import("child_process");

  function ssh(cmd: string, timeout = 25000): string {
    return execSync(
      `sshpass -p '${VPS_PASS}' ssh -o StrictHostKeyChecking=no -o ConnectTimeout=10 root@${VPS_HOST} ${JSON.stringify(cmd)}`,
      { timeout, encoding: "utf-8" }
    ).trim();
  }

  // Desktop
  const desktopPath = `/tmp/bb-desktop-${Date.now()}.png`;
  ssh(`node ${SCRIPT} "${url}" "${desktopPath}" 1280 800`);
  const desktopB64 = ssh(`base64 -w0 ${desktopPath} && rm -f ${desktopPath}`);

  // Mobile
  const mobilePath = `/tmp/bb-mobile-${Date.now()}.png`;
  ssh(`node ${SCRIPT} "${url}" "${mobilePath}" 375 812`);
  const mobileB64 = ssh(`base64 -w0 ${mobilePath} && rm -f ${mobilePath}`);

  return {
    desktop: desktopB64 ? `data:image/png;base64,${desktopB64}` : undefined,
    mobile: mobileB64 ? `data:image/png;base64,${mobileB64}` : undefined,
    source: "vps",
  };
}

/**
 * Take screenshots — tries Browserbase first, falls back to VPS Puppeteer.
 */
export async function takeScreenshots(url: string): Promise<ScreenshotResult> {
  // 1. Try Browserbase (cloud)
  try {
    const result = await screenshotViaBrowserbase(url);
    if (result.desktop) return result;
  } catch (e) {
    console.log("[browser-agent] Browserbase failed:", (e as Error).message, "→ falling back to VPS");
  }

  // 2. Fallback: VPS Puppeteer via SSH
  try {
    const result = await screenshotViaVPS(url);
    if (result.desktop) return result;
  } catch (e) {
    console.log("[browser-agent] VPS screenshot failed:", (e as Error).message);
  }

  return { source: "none", error: "Both Browserbase and VPS screenshot failed" };
}

/** Check if Browserbase is configured */
export function isBrowserbaseConfigured(): boolean {
  return !!(BB_API_KEY && BB_PROJECT_ID);
}
