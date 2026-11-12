// One-off bulk optimization: losslessly recompress every PNG under
// public/assets/img/dropship with sharp's max-effort encoder. Same pixels,
// same dimensions, same path/extension -> zero references need to change and
// the AI photo-generation pipeline keeps using full-fidelity source images.
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const dir = path.join(__dirname, "..", "public", "assets", "img", "dropship");
const CONCURRENCY = 8;

async function processFile(file) {
  const full = path.join(dir, file);
  const tmp = full + ".tmp";
  try {
    const before = fs.statSync(full).size;
    const buffer = await sharp(full)
      .png({ compressionLevel: 9, effort: 10, adaptiveFiltering: true })
      .toBuffer();
    if (buffer.length >= before) {
      return { file, before, after: before, saved: 0, skipped: true };
    }
    fs.writeFileSync(tmp, buffer);
    fs.renameSync(tmp, full);
    return { file, before, after: buffer.length, saved: before - buffer.length, skipped: false };
  } catch (error) {
    try { fs.unlinkSync(tmp); } catch {}
    return { file, error: error.message };
  }
}

(async () => {
  const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".png"));
  console.log(`Found ${files.length} PNG files. Recompressing with concurrency=${CONCURRENCY}...`);

  const start = Date.now();
  let totalBefore = 0;
  let totalAfter = 0;
  let done = 0;
  let errors = 0;
  let skipped = 0;
  const queue = [...files];

  async function worker() {
    while (queue.length) {
      const file = queue.shift();
      const result = await processFile(file);
      done += 1;
      if (result.error) {
        errors += 1;
        console.log(`ERROR ${result.file}: ${result.error}`);
      } else {
        totalBefore += result.before;
        totalAfter += result.after;
        if (result.skipped) skipped += 1;
      }
      if (done % 100 === 0 || done === files.length) {
        const pct = totalBefore ? (100 * (1 - totalAfter / totalBefore)).toFixed(1) : "0";
        const mins = ((Date.now() - start) / 60000).toFixed(1);
        console.log(`[${done}/${files.length}] ${mins}min elapsed, saved ${pct}% so far, errors=${errors}, skipped=${skipped}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, worker));

  const totalMins = ((Date.now() - start) / 60000).toFixed(1);
  console.log("---- DONE ----");
  console.log(`Files processed: ${files.length} (errors: ${errors}, unchanged/skipped: ${skipped})`);
  console.log(`Total before: ${(totalBefore / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Total after:  ${(totalAfter / 1024 / 1024).toFixed(1)} MB`);
  console.log(`Saved:        ${((totalBefore - totalAfter) / 1024 / 1024).toFixed(1)} MB (${(100 * (1 - totalAfter / totalBefore)).toFixed(1)}%)`);
  console.log(`Time: ${totalMins} min`);
})();
