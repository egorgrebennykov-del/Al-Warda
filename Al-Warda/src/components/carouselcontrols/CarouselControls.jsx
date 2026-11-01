function scrollCarousel(event, direction) {
  const carousel = event.currentTarget
    .closest(".carousel")
    ?.querySelector(".swiper");

  carousel?.scrollBy({
    left: direction * carousel.clientWidth * 0.8,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
      ? "instant"
      : "smooth",
  });
}

export default function CarouselControls({ className = "" }) {
  return (
    <div className={`carousel__controls ${className}`}>
      <button
        type="button"
        className="carousel__button"
        aria-label="Scroll carousel left"
        onClick={(event) => scrollCarousel(event, -1)}
      >
        <i className="ri-arrow-left-s-line" />
      </button>
      <button
        type="button"
        className="carousel__button"
        aria-label="Scroll carousel right"
        onClick={(event) => scrollCarousel(event, 1)}
      >
        <i className="ri-arrow-right-s-line" />
      </button>
    </div>
  );
}
