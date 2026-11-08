export default function ProductReflection({ src, className = "" }) {
  return <img
    src={src}
    alt=""
    aria-hidden="true"
    className={`product-reflection ${className}`}
    loading="lazy"
    decoding="async"
    onError={(event) => { event.currentTarget.hidden = true; }}
  />;
}
