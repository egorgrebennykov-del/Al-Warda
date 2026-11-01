import "./OrnateCard.css";

export function CornerBracket({ position = "tl" }) {
  return (
    <svg
      className={`card-ornament card-ornament--${position}`}
      viewBox="0 0 22 22"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <path
        d="M2 20V7C2 4.23858 4.23858 2 7 2H20"
        stroke="var(--gold-color, #c5a059)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
      <circle cx="8" cy="8" r="1.5" fill="var(--gold-color, #c5a059)" />
      <path
        d="M5 15V9C5 6.79086 6.79086 5 9 5H15"
        stroke="var(--gold-color, #c5a059)"
        strokeWidth="0.8"
        strokeOpacity="0.6"
      />
    </svg>
  );
}

export function OrnateCard({ children, className = "", onClick, ...props }) {
  return (
    <div
      className={`ornate-card ${className}`}
      onClick={onClick}
      {...props}
    >
      <CornerBracket position="tl" />
      <CornerBracket position="tr" />
      <CornerBracket position="bl" />
      <CornerBracket position="br" />
      <div className="ornate-card__content">{children}</div>
    </div>
  );
}

export function SectionDivider({ title, showMotif = true }) {
  return (
    <div className="warda-divider">
      {showMotif && (
        <div className="warda-divider__top-motif">
          <svg width="34" height="20" viewBox="0 0 34 20" fill="none" aria-hidden="true">
            <path
              d="M17 1L21 10L17 19L13 10Z"
              stroke="#c5a059"
              strokeWidth="1"
              fill="#c5a059"
              fillOpacity="0.25"
            />
            <circle cx="17" cy="10" r="2" fill="#c5a059" />
            <path d="M4 10H10M24 10H30" stroke="#c5a059" strokeWidth="1" />
            <circle cx="7" cy="10" r="1.2" fill="#c5a059" />
            <circle cx="27" cy="10" r="1.2" fill="#c5a059" />
          </svg>
        </div>
      )}
      <div className="warda-divider__row">
        <span className="warda-divider__line"></span>
        <h2 className="warda-divider__title">{title}</h2>
        <span className="warda-divider__line"></span>
      </div>
    </div>
  );
}

export function SensesMotif() {
  return (
    <div className="warda-senses-motif">
      <span className="warda-divider__line"></span>
      <span className="warda-senses-motif__text">✦ CRAFTED FOR THE SENSES ✦</span>
      <span className="warda-divider__line"></span>
    </div>
  );
}
