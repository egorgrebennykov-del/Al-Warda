import fs from "fs";
import path from "path";
import sharp from "sharp";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GENERATED_DIR = path.join(ROOT, "public/assets/img/generated-products");
const ASSISTANT_DIR = path.join(ROOT, "public/assets/img/warda_assistant");
const CATEGORIES_DIR = path.join(ROOT, "public/assets/img/categories");

async function optimizeGeneratedProducts() {
  console.log("=== Optimizing Generated Product Images ===");
  if (!fs.existsSync(GENERATED_DIR)) return;
  const files = fs.readdirSync(GENERATED_DIR).filter((f) => f.endsWith(".png"));

  let origTotal = 0;
  let optTotal = 0;
  let webpTotal = 0;

  for (const f of files) {
    const pngPath = path.join(GENERATED_DIR, f);
    const webpPath = path.join(GENERATED_DIR, f.replace(/\.png$/, ".webp"));
    const origSize = fs.statSync(pngPath).size;
    origTotal += origSize;

    // 1. Lossless PNG compression (pixel-perfect)
    const optPngBuffer = await sharp(pngPath)
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();
    fs.writeFileSync(pngPath, optPngBuffer);
    optTotal += optPngBuffer.length;

    // 2. High-quality WebP generation
    const webpBuffer = await sharp(pngPath)
      .webp({ quality: 85, effort: 6 })
      .toBuffer();
    fs.writeFileSync(webpPath, webpBuffer);
    webpTotal += webpBuffer.length;

    const pngSaved = ((1 - optPngBuffer.length / origSize) * 100).toFixed(1);
    const webpSaved = ((1 - webpBuffer.length / origSize) * 100).toFixed(1);
    console.log(
      `${f.slice(0, 16)}... PNG: ${(origSize / 1024).toFixed(0)}KB -> ${(optPngBuffer.length / 1024).toFixed(0)}KB (-${pngSaved}%) | WebP: ${(webpBuffer.length / 1024).toFixed(0)}KB (-${webpSaved}%)`,
    );
  }

  console.log(
    `Generated Products: ${(origTotal / 1024 / 1024).toFixed(2)}MB -> PNG ${(optTotal / 1024 / 1024).toFixed(2)}MB (-${((1 - optTotal / origTotal) * 100).toFixed(1)}%) | WebP ${(webpTotal / 1024 / 1024).toFixed(2)}MB (-${((1 - webpTotal / origTotal) * 100).toFixed(1)}%)\n`,
  );
}

async function optimizeAssistantAvatars() {
  console.log("=== Optimizing Warda Assistant Avatars ===");
  if (!fs.existsSync(ASSISTANT_DIR)) return;
  const files = fs.readdirSync(ASSISTANT_DIR).filter((f) => f.endsWith(".png"));

  let origTotal = 0;
  let optTotal = 0;
  let webpTotal = 0;

  for (const f of files) {
    const pngPath = path.join(ASSISTANT_DIR, f);
    const webpPath = path.join(ASSISTANT_DIR, f.replace(/\.png$/, ".webp"));
    const origSize = fs.statSync(pngPath).size;
    origTotal += origSize;

    // Resize from 2048x2048 to 512x512 (Retina 4x sharpness for 130px display)
    const optPngBuffer = await sharp(pngPath)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();
    fs.writeFileSync(pngPath, optPngBuffer);
    optTotal += optPngBuffer.length;

    const webpBuffer = await sharp(pngPath)
      .resize(512, 512, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 85, effort: 6 })
      .toBuffer();
    fs.writeFileSync(webpPath, webpBuffer);
    webpTotal += webpBuffer.length;
  }

  console.log(
    `Warda Assistant: ${(origTotal / 1024 / 1024).toFixed(2)}MB -> PNG ${(optTotal / 1024 / 1024).toFixed(2)}MB (-${((1 - optTotal / origTotal) * 100).toFixed(1)}%) | WebP ${(webpTotal / 1024 / 1024).toFixed(2)}MB (-${((1 - webpTotal / origTotal) * 100).toFixed(1)}%)\n`,
  );
}

async function optimizeCategories() {
  console.log("=== Optimizing Categories Images ===");
  if (!fs.existsSync(CATEGORIES_DIR)) return;
  const files = fs.readdirSync(CATEGORIES_DIR).filter((f) => f.toLowerCase().endsWith(".png"));

  let origTotal = 0;
  let optTotal = 0;

  for (const f of files) {
    const pngPath = path.join(CATEGORIES_DIR, f);
    const origSize = fs.statSync(pngPath).size;
    origTotal += origSize;

    const optPngBuffer = await sharp(pngPath)
      .png({ compressionLevel: 9, effort: 10 })
      .toBuffer();
    fs.writeFileSync(pngPath, optPngBuffer);
    optTotal += optPngBuffer.length;
  }

  console.log(
    `Categories PNG: ${(origTotal / 1024 / 1024).toFixed(2)}MB -> ${(optTotal / 1024 / 1024).toFixed(2)}MB (-${((1 - optTotal / origTotal) * 100).toFixed(1)}%)\n`,
  );
}

async function main() {
  await optimizeGeneratedProducts();
  await optimizeAssistantAvatars();
  await optimizeCategories();
  console.log("All optimizations completed successfully!");
}

main().catch((err) => {
  console.error("Optimization failed:", err);
  process.exit(1);
});
