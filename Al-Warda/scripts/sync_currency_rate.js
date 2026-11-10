#!/usr/bin/env node
/**
 * Synchronizes European Central Bank (ECB) exchange rates for Al-Warda.
 *
 * Rules:
 * - Weekly scheduled sync: every Monday at 3:00 AM, if change is < 5%.
 * - Daily check: if a sharp change >= 5% occurs on ANY day, synchronizes immediately.
 *
 * Usage:
 *   node scripts/sync_currency_rate.js --currency=RON
 *   node scripts/sync_currency_rate.js --currency=HUF
 *   node scripts/sync_currency_rate.js --currency=RON --force
 */

import fs from "fs";
import path from "path";
import https from "https";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Target currency from CLI
const args = process.argv.slice(2);
const currencyArg = args.find((a) => a.startsWith("--currency="))?.split("=")[1]?.toUpperCase() || "RON";
const isForce = args.includes("--force");

if (!["RON", "HUF"].includes(currencyArg)) {
  console.error(`[ERROR] Unsupported currency: ${currencyArg}. Supported: RON, HUF`);
  process.exit(1);
}

const ECB_URLS = {
  RON: "https://data-api.ecb.europa.eu/service/data/EXR/D.RON.EUR.SP00.A?lastNObservations=1&format=csvdata",
  HUF: "https://data-api.ecb.europa.eu/service/data/EXR/D.HUF.EUR.SP00.A?lastNObservations=1&format=csvdata",
};

const RATE_FILES = [
  path.resolve(__dirname, "../src/data/currencyRates.json"),
  path.resolve(__dirname, "../public/data/currencyRates.json"),
  path.resolve(__dirname, "../server/data/currencyRates.json"),
  path.resolve(__dirname, "../../Al-Warda/src/data/currencyRates.json"),
  path.resolve(__dirname, "../../Al-Warda/public/data/currencyRates.json"),
  path.resolve(__dirname, "../../Al-Warda/server/data/currencyRates.json"),
];

function fetchWithRetry(url, retries = 3, delayMs = 2000) {
  return new Promise((resolve, reject) => {
    function attempt(n) {
      const req = https.get(
        url,
        {
          headers: {
            "User-Agent": "Al-Warda-Currency-Sync/1.0",
            Accept: "text/csv,text/plain,*/*",
          },
          timeout: 15000,
          rejectUnauthorized: false,
        },
        (res) => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            let data = "";
            res.on("data", (chunk) => (data += chunk));
            res.on("end", () => resolve(data));
          } else if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            resolve(fetchWithRetry(res.headers.location, n - 1, delayMs));
          } else {
            if (n > 1) {
              console.warn(`[WARN] HTTP ${res.statusCode} from ECB API. Retrying in ${delayMs}ms... (${n - 1} left)`);
              setTimeout(() => attempt(n - 1), delayMs);
            } else {
              reject(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
            }
          }
        }
      );

      req.on("error", (err) => {
        if (n > 1) {
          console.warn(`[WARN] Network error: ${err.message}. Retrying in ${delayMs}ms...`);
          setTimeout(() => attempt(n - 1), delayMs);
        } else {
          reject(err);
        }
      });

      req.on("timeout", () => {
        req.destroy();
        if (n > 1) {
          console.warn(`[WARN] Request timeout. Retrying in ${delayMs}ms...`);
          setTimeout(() => attempt(n - 1), delayMs);
        } else {
          reject(new Error("ECB API request timed out"));
        }
      });
    }

    attempt(retries);
  });
}

function parseEcbCsvRate(csvText) {
  const lines = csvText.trim().split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) {
    throw new Error("ECB response did not contain data lines");
  }

  const headers = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  const obsIndex = headers.indexOf("OBS_VALUE");
  if (obsIndex === -1) {
    throw new Error("CSV response does not have OBS_VALUE header");
  }

  const values = lines[1].split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
  const rawVal = values[obsIndex];
  const rate = parseFloat(rawVal);

  if (!Number.isFinite(rate) || rate <= 0) {
    throw new Error(`Invalid OBS_VALUE in CSV: "${rawVal}"`);
  }

  const timePeriodIndex = headers.indexOf("TIME_PERIOD");
  const timePeriod = timePeriodIndex !== -1 ? values[timePeriodIndex] : new Date().toISOString().slice(0, 10);

  return { rate, timePeriod };
}

async function run() {
  console.log(`[INFO] Starting exchange rate check for ${currencyArg}...`);
  console.log(`[INFO] ECB URL: ${ECB_URLS[currencyArg]}`);

  let csvData;
  try {
    csvData = await fetchWithRetry(ECB_URLS[currencyArg]);
  } catch (err) {
    console.error(`[ERROR] Failed to fetch rate from ECB: ${err.message}`);
    process.exit(1);
  }

  const { rate: currentRate, timePeriod } = parseEcbCsvRate(csvData);
  console.log(`[INFO] Current ECB reference rate for ${currencyArg}: 1 EUR = ${currentRate} ${currencyArg} (Date: ${timePeriod})`);

  // Find existing rates file
  const targetFile = RATE_FILES.find((f) => fs.existsSync(f));
  if (!targetFile) {
    console.error("[ERROR] Could not find currencyRates.json in any of the expected locations");
    process.exit(1);
  }

  const rawJson = fs.readFileSync(targetFile, "utf8");
  const ratesData = JSON.parse(rawJson);

  const curConfig = ratesData.currencies?.[currencyArg] || {};
  const lastSyncRate = Number(curConfig.lastSyncRate || ratesData.rates?.[currencyArg] || currentRate);
  const diff = Math.abs(currentRate - lastSyncRate) / lastSyncRate;
  const diffPercent = diff * 100;
  const isSharpChange = diff >= 0.05; // >= 5% change
  const isMonday = new Date().getUTCDay() === 1;

  console.log(`[INFO] Stored sync rate: ${lastSyncRate}`);
  console.log(`[INFO] Current ECB rate: ${currentRate}`);
  console.log(`[INFO] Absolute change: ${diffPercent.toFixed(2)}% (5% threshold: ${isSharpChange ? "EXCEEDED" : "NOT EXCEEDED"})`);
  console.log(`[INFO] Day of week: ${new Date().toLocaleDateString("en-US", { weekday: "long" })} (isMonday=${isMonday})`);

  let shouldSync = false;
  let reason = "";

  if (isForce) {
    shouldSync = true;
    reason = "Manual force sync requested via --force";
  } else if (isSharpChange) {
    shouldSync = true;
    reason = `Sharp rate movement detected (${diffPercent.toFixed(2)}% >= 5%). Immediate price synchronization triggered!`;
  } else if (isMonday) {
    shouldSync = true;
    reason = `Weekly scheduled Monday sync: rate variance ${diffPercent.toFixed(2)}% is within standard range (< 5%). Updating rates.`;
  } else {
    shouldSync = false;
    reason = `Daily check complete: rate variance ${diffPercent.toFixed(2)}% is under 5% and today is not Monday. No price synchronization needed.`;
  }

  console.log(`[DECISION] shouldSync = ${shouldSync}. Reason: ${reason}`);

  const nowIso = new Date().toISOString();

  // Always update check timestamp
  if (!ratesData.currencies) ratesData.currencies = {};
  if (!ratesData.currencies[currencyArg]) ratesData.currencies[currencyArg] = {};
  ratesData.currencies[currencyArg].lastChecked = nowIso;
  ratesData.currencies[currencyArg].latestObservedRate = currentRate;
  ratesData.currencies[currencyArg].observationDate = timePeriod;

  if (shouldSync) {
    ratesData.rates[currencyArg] = currentRate;
    ratesData.currencies[currencyArg].rate = currentRate;
    ratesData.currencies[currencyArg].lastSyncRate = currentRate;
    ratesData.currencies[currencyArg].lastSyncDate = nowIso;
    ratesData.lastUpdated = nowIso;
    console.log(`[SUCCESS] Synchronized ${currencyArg} rate to ${currentRate}`);
  }

  // Save to all target files that exist or should exist
  const uniquePaths = Array.from(new Set(RATE_FILES));
  for (const fp of uniquePaths) {
    try {
      const dir = path.dirname(fp);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(fp, JSON.stringify(ratesData, null, 2) + "\n", "utf8");
      console.log(`[SAVED] Updated ${fp}`);
    } catch (e) {
      console.warn(`[WARN] Could not write to ${fp}: ${e.message}`);
    }
  }

  console.log(`[DONE] ${currencyArg} sync check finished successfully.`);
}

run();
