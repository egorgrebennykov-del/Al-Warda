import sharp from "sharp";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import enrichedStocks from "./data/enrichedStocks.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEMPLATE_PATH = path.resolve(__dirname, "../public/assets/img/template/flacon_template.jpg");
const PRODUCTS_DIR = path.resolve(__dirname, "../public/assets/img/products");

const ARABIC_DICTIONARY = {
  meydan: "مـيـدان",
  yara: "يـارا",
  khamrah: "خـمـرة",
  asad: "أسـد",
  fakhar: "فـخـار",
  ejaazi: "إعـجـازي",
  badee: "بـديـع الـعـود",
  oud: "عـود مـلـكـي",
  amber: "عـنـبـر",
  musk: "مـسـك",
  rose: "ورد طـائـفـي",
  vanilla: "فـانـيـلـيـا",
  velvet: "مـخـمـل",
  onyx: "عـقـيـق",
  burj: "بـرج دبي",
  crystal: "بـلـور",
  royal: "مـلـكـي",
  gold: "ذهـب",
  sharaf: "شـرف",
  kashmir: "كـشـمـيـر",
  surur: "سـرور",
  sensual: "فـاتـن",
  qahwa: "قـهـوة",
};

export function getArabicCalligraphy(name = "", brand = "") {
  const lower = `${name} ${brand}`.toLowerCase();
  for (const [key, arabic] of Object.entries(ARABIC_DICTIONARY)) {
    if (lower.includes(key)) return arabic;
  }
  return "الـوردة"; // Al-Warda royal calligraphy crown
}

function escapeXml(str = "") {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function cleanPerfumeName(name = "", brand = "") {
  if (!name) return "ROYAL PARFUM";
  let c = name;
  if (brand) {
    const bRegex = new RegExp(`^${brand}\\s*`, "i");
    c = c.replace(bRegex, "");
    const bByRegex = new RegExp(`\\s+by\\s+${brand}.*`, "i");
    c = c.replace(bByRegex, "");
  }
  c = c.replace(/\b(eau de parfum|edp|edt|cologne|spray|unisex|for men|for women|femme|homme|pour homme|pour femme|\d+\s*ml|\d+(\.\d+)?\s*(fl\.?\s*oz|oz))\b/gi, "");
  c = c.replace(/[-–—]/g, " ").replace(/\s+/g, " ").trim();
  return c || name;
}

export async function generateProductFlacon({ gtin, name, brand, volume = "100 ML", concentration = "EAU DE PARFUM" }) {
  if (!gtin) throw new Error("GTIN is required to generate product flacon");

  if (!fs.existsSync(PRODUCTS_DIR)) {
    fs.mkdirSync(PRODUCTS_DIR, { recursive: true });
  }

  const outPath = path.join(PRODUCTS_DIR, `${gtin}.jpg`);
  if (fs.existsSync(outPath)) {
    return `/assets/img/products/${gtin}.jpg`;
  }

  if (!fs.existsSync(TEMPLATE_PATH)) {
    throw new Error(`Master template missing at: ${TEMPLATE_PATH}`);
  }

  const labelX = 427;
  const labelY = 480;
  const labelW = 172;
  const labelH = 174;

  const brandUpper = escapeXml((brand || "AL-WARDA").toUpperCase().trim());
  const cleanedName = escapeXml(cleanPerfumeName(name, brand).toUpperCase());
  const arabic = escapeXml(getArabicCalligraphy(name, brand));

  let nameFontSize = 13;
  let nameLetterSpacing = 1.8;
  if (cleanedName.length > 22) {
    nameFontSize = 9.5;
    nameLetterSpacing = 0.8;
  } else if (cleanedName.length > 15) {
    nameFontSize = 11;
    nameLetterSpacing = 1.2;
  }

  const volStr = escapeXml(`${volume.toUpperCase()} • 3.4 FL.OZ.`);
  const concStr = escapeXml((concentration || "EAU DE PARFUM").toUpperCase());

  const svgLabel = `
  <svg width="${labelW}" height="${labelH}" xmlns="http://www.w3.org/2000/svg">
    <defs>
      <linearGradient id="gold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#fae8b4" />
        <stop offset="35%" stop-color="#d4af37" />
        <stop offset="65%" stop-color="#fdf3cb" />
        <stop offset="85%" stop-color="#b08528" />
        <stop offset="100%" stop-color="#f8dc81" />
      </linearGradient>
      <linearGradient id="borderGold" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#c59b27" />
        <stop offset="50%" stop-color="#ffd875" />
        <stop offset="100%" stop-color="#936f16" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="0.4" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    
    <!-- Background matching dark crystal bottle interior -->
    <rect x="0" y="0" width="${labelW}" height="${labelH}" fill="#0c0a08" rx="2" />
    
    <!-- Double gold filigree border -->
    <rect x="4" y="4" width="${labelW - 8}" height="${labelH - 8}" fill="none" stroke="url(#borderGold)" stroke-width="1" rx="1" opacity="0.85" />
    <rect x="7" y="7" width="${labelW - 14}" height="${labelH - 14}" fill="none" stroke="url(#borderGold)" stroke-width="0.5" rx="1" opacity="0.45" />

    <!-- Corner accents -->
    <path d="M 10 14 L 14 14 L 14 10" fill="none" stroke="url(#gold)" stroke-width="0.8" />
    <path d="M ${labelW - 10} 14 L ${labelW - 14} 14 L ${labelW - 14} 10" fill="none" stroke="url(#gold)" stroke-width="0.8" />
    <path d="M 10 ${labelH - 14} L 14 ${labelH - 14} L 14 ${labelH - 10}" fill="none" stroke="url(#gold)" stroke-width="0.8" />
    <path d="M ${labelW - 10} ${labelH - 14} L ${labelW - 14} ${labelH - 14} L ${labelW - 14} ${labelH - 10}" fill="none" stroke="url(#gold)" stroke-width="0.8" />

    <!-- Arabic Calligraphy Crown -->
    <text x="${labelW / 2}" y="36" text-anchor="middle" fill="url(#gold)" font-family="'Amiri', 'Traditional Arabic', 'Scheherazade New', 'Times New Roman', serif" font-size="20" font-weight="bold" filter="url(#glow)">${arabic}</text>

    <!-- Brand Name -->
    <text x="${labelW / 2}" y="59" text-anchor="middle" fill="url(#gold)" font-family="'Cinzel', 'Times New Roman', serif" font-size="10.5" font-weight="600" letter-spacing="3">${brandUpper}</text>
    
    <!-- Divider line -->
    <line x1="36" y1="69" x2="${labelW - 36}" y2="69" stroke="url(#gold)" stroke-width="0.6" opacity="0.75" />
    <polygon points="${labelW / 2 - 2.5},69 ${labelW / 2},66.5 ${labelW / 2 + 2.5},69 ${labelW / 2},71.5" fill="url(#gold)" />

    <!-- Perfume Name -->
    <text x="${labelW / 2}" y="102" text-anchor="middle" fill="#ffffff" font-family="'Cinzel', 'Trajan Pro', 'Georgia', serif" font-size="${nameFontSize}" font-weight="700" letter-spacing="${nameLetterSpacing}">${cleanedName}</text>

    <!-- Subtitle / Concentration -->
    <text x="${labelW / 2}" y="132" text-anchor="middle" fill="url(#gold)" font-family="'Montserrat', sans-serif" font-size="7.5" font-weight="500" letter-spacing="2.2">${concStr}</text>

    <!-- Volume -->
    <text x="${labelW / 2}" y="151" text-anchor="middle" fill="#b39a68" font-family="'Montserrat', sans-serif" font-size="6.5" font-weight="400" letter-spacing="1.5">${volStr}</text>
  </svg>
  `;

  const labelBuffer = Buffer.from(svgLabel);

  await sharp(TEMPLATE_PATH)
    .composite([{
      input: labelBuffer,
      top: labelY,
      left: labelX,
    }])
    .jpeg({ quality: 95 })
    .toFile(outPath);

  return `/assets/img/products/${gtin}.jpg`;
}

export async function getOrGenerateFlaconByGtin(gtin) {
  if (!gtin) return "/assets/img/template/flacon_template.jpg";

  const cachedFile = path.join(PRODUCTS_DIR, `${gtin}.jpg`);
  if (fs.existsSync(cachedFile)) {
    return `/assets/img/products/${gtin}.jpg`;
  }

  // Lookup in enrichedStocks
  let matched = null;
  if (enrichedStocks && typeof enrichedStocks === "object") {
    for (const item of Object.values(enrichedStocks)) {
      if (item && (item.gtin === gtin || item.info?.gtin === gtin || item.slug?.includes(gtin))) {
        matched = item;
        break;
      }
    }
  }

  // If raw Qogita image is available, process it into authentic luxury studio product render
  const rawImage = matched?.info?.rawImage || matched?.rawImage;
  if (rawImage && (rawImage.startsWith("http://") || rawImage.startsWith("https://"))) {
    try {
      const localScript = path.resolve(__dirname, "../scripts/process_qogita_luxury.py");
      const rootScript = path.resolve(__dirname, "../../scripts/process_qogita_luxury.py");
      const scriptPath = fs.existsSync(localScript) ? localScript : rootScript;
      if (fs.existsSync(scriptPath)) {
        execSync(`python "${scriptPath}" --source "${rawImage}" --output "${cachedFile}"`, { timeout: 30000 });
        if (fs.existsSync(cachedFile)) {
          const distProductsDir = path.resolve(__dirname, "../dist/assets/img/products");
          if (fs.existsSync(distProductsDir)) {
            fs.copyFileSync(cachedFile, path.join(distProductsDir, `${gtin}.jpg`));
          }
          return `/assets/img/products/${gtin}.jpg`;
        }
      }
    } catch (e) {
      console.warn(`[getOrGenerateFlaconByGtin] luxury processing error for ${gtin}:`, e.message);
    }
  }

  const name = matched?.name || `Arabian Perfume ${gtin}`;
  const brand = matched?.brand || "Al-Warda";
  const volume = matched?.info?.volume || "100 ML";
  const concentration = matched?.info?.concentration || "EAU DE PARFUM";

  return await generateProductFlacon({
    gtin,
    name,
    brand,
    volume,
    concentration,
  });
}
