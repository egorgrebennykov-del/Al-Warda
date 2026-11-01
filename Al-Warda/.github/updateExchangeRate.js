import dotenv from "dotenv";
import https from "node:https";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { XMLParser } from "fast-xml-parser";

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(scriptDir, "../.env") });

function formatBnmDate(d) {
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const year = d.getFullYear();
  return `${day}.${month}.${year}`;
}

function fetchHttpsText(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { rejectUnauthorized: false }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return resolve(fetchHttpsText(res.headers.location));
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        return reject(
          new Error(`Failed to fetch exchange rates: HTTP ${res.statusCode}`),
        );
      }
      let body = "";
      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => resolve(body));
    });
    req.on("error", reject);
    req.setTimeout(25000, () => {
      req.destroy(new Error("Request timeout"));
    });
  });
}

async function updateExchangeRate() {
  try {
    const supabaseUrl =
      process.env.SUPABASE_URL || "https://qgxiisgzwcsevzyaoxvl.supabase.co";
    const supabaseSecretKey =
      process.env.SUPABASE_SECRET_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    const supabase = createClient(
      supabaseUrl,
      supabaseSecretKey,
      { auth: { persistSession: false } },
    );

    let text = "";
    let rate = null;
    let rateDate = null;

    if (process.env.BNM_RATE_URL) {
      console.log(`Fetching exchange rate from BNM: ${process.env.BNM_RATE_URL}`);
      text = await fetchHttpsText(process.env.BNM_RATE_URL);
    } else {
      // Try today, or walk back up to 5 days if BNM has no data yet (e.g. weekend, holiday)
      for (let offset = 0; offset <= 5; offset++) {
        const d = new Date();
        d.setDate(d.getDate() - offset);
        const dateStr = formatBnmDate(d);
        const url = `https://www.bnm.md/en/export-official-exchange-rates?date=${dateStr}&get_xml=1`;
        console.log(`Fetching exchange rate from BNM (${dateStr}): ${url}`);
        try {
          const respText = await fetchHttpsText(url);
          if (
            respText &&
            !respText.includes("No data found") &&
            respText.includes("EUR")
          ) {
            text = respText;
            console.log(`Successfully received rate data for ${dateStr}`);
            break;
          }
        } catch (fetchErr) {
          console.warn(`Attempt for date ${dateStr} failed: ${fetchErr.message}`);
        }
      }
    }

    if (text && text.trim().startsWith("<")) {
      const parser = new XMLParser({
        ignoreAttributes: false,
        isArray: (name) => name === "Valute" || name === "item",
      });

      const data = parser.parse(text);
      if (data?.ValCurs?.Valute) {
        const euro = data.ValCurs.Valute.find(
          (item) => String(item.CharCode || item.title).trim() === "EUR",
        );
        if (euro) {
          const nominal = Number(euro.Nominal || euro.quant) || 1;
          const val = Number(
            String(euro.Value || euro.description).replace(",", "."),
          );
          if (Number.isFinite(val) && val > 0) {
            rate = val / nominal;
          }
        }
        if (data.ValCurs["@_Date"]) {
          const [d, m, y] = String(data.ValCurs["@_Date"]).split(".");
          rateDate = `${y}-${m}-${d}`;
        }
      }
    } else if (text && text.includes("EUR")) {
      // CSV format returned by export-official-exchange-rates
      const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        const dateMatch = line.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (dateMatch && !rateDate) {
          rateDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
        }
        const cols = line
          .split(";")
          .map((c) => c.replace(/^"|"$/g, "").trim());
        if (cols.includes("EUR")) {
          const abbrIndex = cols.indexOf("EUR");
          const nominal = Number(cols[abbrIndex + 1]) || 1;
          const val = Number(cols[abbrIndex + 2]?.replace(",", "."));
          if (Number.isFinite(val) && val > 0) {
            rate = val / nominal;
          }
        }
      }
    }

    // Fallback to open exchange rate API if BNM failed
    if (!Number.isFinite(rate) || rate <= 0) {
      console.warn(
        "BNM rate not found, trying backup provider (open.er-api.com)...",
      );
      try {
        const backupRaw = await fetchHttpsText(
          "https://open.er-api.com/v6/latest/EUR",
        );
        const backupData = JSON.parse(backupRaw);
        if (backupData?.rates?.MDL) {
          rate = Number(backupData.rates.MDL);
          rateDate = backupData.time_last_update_utc
            ? new Date(backupData.time_last_update_utc).toISOString().slice(0, 10)
            : new Date().toISOString().slice(0, 10);
          console.log(`Fetched backup EUR/MDL rate: ${rate} (${rateDate})`);
        }
      } catch (backupErr) {
        console.warn("Backup exchange rate provider failed:", backupErr.message);
      }
    }

    if (!rateDate) {
      const now = new Date();
      rateDate = now.toISOString().slice(0, 10);
    }

    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(rateDate) ||
      Number.isNaN(Date.parse(`${rateDate}T00:00:00Z`))
    ) {
      throw new Error("Invalid exchange rate date");
    }

    if (!Number.isFinite(rate) || rate <= 0) {
      throw new Error("Invalid EUR/MDL exchange rate");
    }

    const exchangeRate = {
      base_currency: "EUR",
      quote_currency: "MDL",
      rate,
      rate_date: rateDate,
      updated_at: new Date().toISOString(),
    };

    const { data: existing, error: lookupError } = await supabase
      .from("exchange_rate")
      .select("id")
      .eq("base_currency", "EUR")
      .eq("quote_currency", "MDL")
      .limit(1)
      .maybeSingle();
    if (lookupError) throw lookupError;

    const result = existing
      ? await supabase
          .from("exchange_rate")
          .update(exchangeRate)
          .eq("id", existing.id)
      : await supabase.from("exchange_rate").insert(exchangeRate);

    if (result.error) throw result.error;

    console.log("EUR/MDL exchange rate updated successfully:", {
      rate,
      rateDate,
    });
  } catch (error) {
    console.error("Failed to update exchange rate:", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    process.exitCode = 1;
  }
}

updateExchangeRate();
