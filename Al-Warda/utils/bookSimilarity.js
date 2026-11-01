import { pipeline } from "@huggingface/transformers";

let extractorPromise = null;

async function getExtractor() {
  if (!extractorPromise) {
    extractorPromise = pipeline(
      "image-feature-extraction",
      "Xenova/clip-vit-base-patch32",
    );
  }

  return extractorPromise;
}

export async function warmupImageModel() {
  await getExtractor();
}

export async function getImageEmbedding(image) {
  const extractor = await getExtractor();

  const output = await extractor(image, {
    pooling: "mean",
    normalize: true,
  });

  return Array.from(output.data);
}

export function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error("Embeddings must have the same length.");
  }

  let dotProduct = 0;
  let magnitudeA = 0;
  let magnitudeB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    magnitudeA += a[i] * a[i];
    magnitudeB += b[i] * b[i];
  }

  if (magnitudeA === 0 || magnitudeB === 0) {
    throw new Error("Cannot compare zero vectors.");
  }

  return dotProduct / (Math.sqrt(magnitudeA) * Math.sqrt(magnitudeB));
}
