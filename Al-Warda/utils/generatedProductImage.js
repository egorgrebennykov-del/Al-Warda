export function isGeneratedProductImage(image) {
  return typeof image === "string" && (
    /^\/assets\/img\/generated-products\/[a-f0-9]{64}\.png$/.test(image) ||
    /^https:\/\/[^/]+\/storage\/v1\/object\/public\/product-images\//i.test(image)
  );
}
