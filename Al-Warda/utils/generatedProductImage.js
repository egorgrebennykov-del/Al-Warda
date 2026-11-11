export function isGeneratedProductImage(image) {
  return typeof image === "string" && (
    /^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(image) ||
    /^https:\/\/[^/]+\/storage\/v1\/object\/public\/product-images\//i.test(image)
  );
}

const DEFAULT_SUPABASE_URL = "https://mfvenfrmlkxqgvdtedet.supabase.co";

/**
 * A product is "photo ready" when its generated image has been completed and
 * published. Fragrance notes may only be generated for such products
 * (pipeline: Qogita data -> photo generation -> aroma palette -> description).
 *
 * `supabaseUrl` only matters for images stored in Supabase storage.
 */
export function hasCompletedGeneratedImage(product, supabaseUrl = DEFAULT_SUPABASE_URL) {
  const generation = product?.info?.imageGeneration;
  const image = generation?.imageUrl || product?.image;
  if (!image || typeof image !== "string") return false;
  if (generation?.status !== "completed") return false;
  if (generation?.manual || product?.info?.manual) return true;
  return (
    isGeneratedProductImage(image) &&
    (image.startsWith("/") || image.startsWith(`${supabaseUrl}/storage/v1/object/public/product-images/`))
  );
}
