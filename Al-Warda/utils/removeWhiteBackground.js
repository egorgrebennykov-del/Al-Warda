const TOLERANCE = 28; // полностью фон
const SOFT = 70; // дальше — полностью объект, между — полупрозрачный край

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  return s[s.length >> 1];
}

export default function removeWhiteBackground(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const { naturalWidth: w, naturalHeight: h } = img;
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;

        const border = [];
        for (let x = 0; x < w; x++) border.push(x, (h - 1) * w + x);
        for (let y = 0; y < h; y++) border.push(y * w, y * w + w - 1);

        const bg = [0, 1, 2].map((c) =>
          median(border.map((p) => d[p * 4 + c])),
        );

        const dist = new Float32Array(w * h);
        for (let p = 0; p < w * h; p++) {
          const dr = d[p * 4] - bg[0];
          const dg = d[p * 4 + 1] - bg[1];
          const db = d[p * 4 + 2] - bg[2];
          dist[p] = Math.sqrt(dr * dr + dg * dg + db * db);
        }

        const removed = new Uint8Array(w * h);
        const stack = [];
        const push = (p) => {
          if (!removed[p] && dist[p] <= TOLERANCE) {
            removed[p] = 1;
            stack.push(p);
          }
        };
        border.forEach(push);

        while (stack.length) {
          const p = stack.pop();
          const x = p % w;
          if (x > 0) push(p - 1);
          if (x < w - 1) push(p + 1);
          if (p >= w) push(p - w);
          if (p < w * (h - 1)) push(p + w);
        }

        let removedCount = 0;
        for (let p = 0; p < w * h; p++) removedCount += removed[p];
        if (removedCount < w * h * 0.03 || removedCount > w * h * 0.97) {
          reject(new Error("background not detected"));
          return;
        }

        const touchesRemoved = (p) => {
          const x = p % w;
          return (
            (x > 0 && removed[p - 1]) ||
            (x < w - 1 && removed[p + 1]) ||
            (p >= w && removed[p - w]) ||
            (p < w * (h - 1) && removed[p + w])
          );
        };

        let minX = w,
          minY = h,
          maxX = -1,
          maxY = -1;
        for (let p = 0; p < w * h; p++) {
          const i = p * 4;
          if (removed[p]) {
            d[i + 3] = 0;
            continue;
          }
          if (dist[p] < SOFT && touchesRemoved(p)) {
            const a = Math.max(
              0.05,
              (dist[p] - TOLERANCE) / (SOFT - TOLERANCE),
            );
            for (let c = 0; c < 3; c++) {
              const v = (d[i + c] - bg[c] * (1 - a)) / a;
              d[i + c] = Math.min(255, Math.max(0, v));
            }
            d[i + 3] = Math.round(a * 255);
          }
          const x = p % w;
          const y = (p - x) / w;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }

        ctx.putImageData(imageData, 0, 0);

        const cw = maxX - minX + 1;
        const ch = maxY - minY + 1;
        const out = document.createElement("canvas");
        out.width = cw;
        out.height = ch;
        out
          .getContext("2d")
          .drawImage(canvas, minX, minY, cw, ch, 0, 0, cw, ch);
        resolve(out.toDataURL("image/png"));
      } catch (err) {
        reject(err);
      }
    };
    img.onerror = reject;
    img.src = src;
  });
}
