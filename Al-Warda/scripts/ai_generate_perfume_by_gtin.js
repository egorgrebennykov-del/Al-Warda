/**
 * Al-Warda Luxury Perfume AI Visualizer Pipeline
 * Takes a product GTIN/Barcode, looks up the authentic product details,
 * and formats the visual brief for Google's Nano-Banana / Imagen AI generator
 * to render the authentic flacon into public/assets/img/products/${gtin}.jpg.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const enrichedStocksPath = path.resolve(__dirname, '../server/data/enrichedStocks.json');
const productsDir = path.resolve(__dirname, '../public/assets/img/products');

export function getPerfumeByGtin(gtin) {
  if (!fs.existsSync(enrichedStocksPath)) return null;
  const raw = JSON.parse(fs.readFileSync(enrichedStocksPath, 'utf8'));
  const list = Array.isArray(raw) ? raw : Object.values(raw);
  
  return list.find(p => {
    const itemGtin = p.gtin || p.info?.gtin || (p.id && String(p.id).replace('dropship-', ''));
    return itemGtin === String(gtin);
  }) || null;
}

export function buildVisualPrompt(perfume) {
  const name = perfume.name || perfume.title || 'Arabian Perfume';
  const brand = perfume.brand || 'Al-Warda';
  const volume = perfume.info?.volume || perfume.volume || '100ml / 3.4 FL.OZ.';
  const conc = perfume.info?.concentration || perfume.concentration || 'Eau De Parfum';
  const rawImage = perfume.info?.rawImage || perfume.rawImage || null;

  return {
    name,
    brand,
    volume,
    conc,
    rawImage,
    prompt: `Ultra-luxury commercial 3D product studio photograph of authentic Arabian luxury perfume "${name}" by ${brand} (${volume}, ${conc}). The flacon is captured in stunning photorealistic detail with authentic materials, sculpted cap, gold metallic filigree typography, and brand emblems. Centered on a mirror-like black obsidian reflective surface, dark luxury moody studio background with dramatic rim lighting tracing the contours of the flacon and cap, 8k resolution, Hasselblad medium format, commercial advertising photography.`
  };
}

// CLI usage: node ai_generate_perfume_by_gtin.js 6294015185072
const cliGtin = process.argv[2];
if (cliGtin) {
  const p = getPerfumeByGtin(cliGtin);
  if (!p) {
    console.error(`Perfume with GTIN ${cliGtin} not found in database.`);
    process.exit(1);
  }
  const spec = buildVisualPrompt(p);
  console.log('Found product:', spec.name, 'by', spec.brand);
  console.log('Raw reference image:', spec.rawImage);
  console.log('\nAI Generation Prompt:\n', spec.prompt);
}
