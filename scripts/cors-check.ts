// Check that a browser page can fetch a drand beacon and call the NEAR RPC (CORS).
//   npx tsx scripts/cors-check.ts --url http://localhost:3123
import { chromium } from "playwright-core";
import { arg } from "./lib/near";

const url = arg("url", "http://localhost:3123");
const exe = process.env.CHROME_PATH ?? "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await chromium.launch({ executablePath: exe, headless: true });
const page = await browser.newPage();
await page.goto(`${url}/rules`);
const out = await page.evaluate(async () => {
  const chain = "52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971";
  const res: Record<string, string> = {};
  for (const base of ["https://api.drand.sh", "https://drand.cloudflare.com", "https://api2.drand.sh", "https://api3.drand.sh"]) {
    try {
      const r = await fetch(`${base}/${chain}/public/latest`, { cache: "no-store" });
      const j = (await r.json()) as { round: number };
      res[base] = `HTTP ${r.status}, round ${j.round}`;
    } catch (e) {
      res[base] = `failed: ${String(e)}`;
    }
  }
  try {
    const r = await fetch("https://rpc.testnet.fastnear.com", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "status", params: [] }),
    });
    res.rpc = `HTTP ${r.status}`;
  } catch (e) {
    res.rpc = `failed: ${String(e)}`;
  }
  return res;
});
console.log(out);
await browser.close();
