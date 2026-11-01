import React from "react";
import "./CategoryCinematicMotion.css";

/**
 * CategoryCinematicMotion
 * Renders high-fidelity, organic, seamless cyclic motion for category items.
 * All scissor-cut/hard-edged synthetic bars and fake smoke blobs have been removed.
 * In categories with smoke/incense (Oud, Spices, Gourmand), the real photographed smoke
 * is illuminated by a warm volumetric aura, floating soft glowing embers, and glass prism sheen.
 */
export default function CategoryCinematicMotion({ categoryId, layer = "front" }) {
  const normId = (categoryId || "").toLowerCase();

  // 1. OUD & SMOKE ("уд и дым" - мягкая тёплая аура и тлеющие искры ладана)
  if (normId.includes("oud")) {
    if (layer === "back") {
      return (
        <div className="warda-cm-container warda-cm-container--back warda-cm--oud">
          {/* Volumetric warm amber aura illuminating the photographed smoke */}
          <div className="warda-cm-aura" />
        </div>
      );
    }
    return (
      <div className="warda-cm-container warda-cm-container--front warda-cm--oud">
        <div className="warda-cm-glass-sheen" />
        {/* Soft, perfectly round glowing incense embers rising through the smoke */}
        <span className="warda-cm-ember warda-cm-ember--1" />
        <span className="warda-cm-ember warda-cm-ember--2" />
        <span className="warda-cm-ember warda-cm-ember--3" />
        <span className="warda-cm-ember warda-cm-ember--4" />
        <span className="warda-cm-ember warda-cm-ember--5" />
      </div>
    );
  }

  // 2. CITRUS ("листья")
  if (normId.includes("citrus")) {
    if (layer === "back") {
      return (
        <div className="warda-cm-container warda-cm-container--back warda-cm--citrus">
          <div className="warda-cm-aura" />
          <div className="warda-cm-leaf warda-cm-leaf--back-1">
            <BotanicalLeafSvg variant="deep" />
          </div>
          <div className="warda-cm-leaf warda-cm-leaf--back-2">
            <BotanicalLeafSvg variant="golden" />
          </div>
        </div>
      );
    }
    return (
      <div className="warda-cm-container warda-cm-container--front warda-cm--citrus">
        <div className="warda-cm-glass-sheen" />
        <div className="warda-cm-leaf warda-cm-leaf--front-1">
          <BotanicalLeafSvg variant="vibrant" />
        </div>
        <div className="warda-cm-leaf warda-cm-leaf--front-2">
          <BotanicalLeafSvg variant="vibrant" />
        </div>
        <div className="warda-cm-drop warda-cm-drop--citrus-1">
          <LiquidDropSvg color="citrus" />
        </div>
      </div>
    );
  }

  // 3. FRESH / AQUATIC ("вода и листья")
  if (normId.includes("aquatic") || normId.includes("fresh")) {
    if (layer === "back") {
      return (
        <div className="warda-cm-container warda-cm-container--back warda-cm--fresh">
          <div className="warda-cm-aura" />
          <div className="warda-cm-ripple warda-cm-ripple--1" />
          <div className="warda-cm-ripple warda-cm-ripple--2" />
        </div>
      );
    }
    return (
      <div className="warda-cm-container warda-cm-container--front warda-cm--fresh">
        <div className="warda-cm-glass-sheen" />
        <div className="warda-cm-drop warda-cm-drop--aqua-1">
          <LiquidDropSvg color="aqua" />
        </div>
        <div className="warda-cm-drop warda-cm-drop--aqua-2">
          <LiquidDropSvg color="aqua" size="small" />
        </div>
        <div className="warda-cm-leaf warda-cm-leaf--mint">
          <BotanicalLeafSvg variant="mint" />
        </div>
      </div>
    );
  }

  // 4. FLORAL ("лепестки и листья")
  if (normId.includes("floral")) {
    if (layer === "back") {
      return (
        <div className="warda-cm-container warda-cm-container--back warda-cm--floral">
          <div className="warda-cm-aura" />
          <div className="warda-cm-petal warda-cm-petal--back-1">
            <RosePetalSvg color="deep-rose" />
          </div>
        </div>
      );
    }
    return (
      <div className="warda-cm-container warda-cm-container--front warda-cm--floral">
        <div className="warda-cm-glass-sheen" />
        <div className="warda-cm-petal warda-cm-petal--front-1">
          <RosePetalSvg color="ruby" />
        </div>
        <div className="warda-cm-petal warda-cm-petal--front-2">
          <RosePetalSvg color="velvet" />
        </div>
        <div className="warda-cm-leaf warda-cm-leaf--rose">
          <BotanicalLeafSvg variant="vibrant" />
        </div>
      </div>
    );
  }

  // 5. FOUGÈRE / WOODY ("лесные листья")
  if (normId.includes("fougere") || normId.includes("woody")) {
    if (layer === "back") {
      return (
        <div className="warda-cm-container warda-cm-container--back warda-cm--fougere">
          <div className="warda-cm-aura" />
          <div className="warda-cm-leaf warda-cm-leaf--oak-back">
            <OakLeafSvg variant="gold" />
          </div>
        </div>
      );
    }
    return (
      <div className="warda-cm-container warda-cm-container--front warda-cm--fougere">
        <div className="warda-cm-glass-sheen" />
        <div className="warda-cm-leaf warda-cm-leaf--oak-front">
          <OakLeafSvg variant="emerald" />
        </div>
        <div className="warda-cm-leaf warda-cm-leaf--forest-front">
          <BotanicalLeafSvg variant="deep" />
        </div>
      </div>
    );
  }

  // 6. SPICES ("пряности и тёплые искры - без искусственных палочек")
  if (normId.includes("spic")) {
    if (layer === "back") {
      return (
        <div className="warda-cm-container warda-cm-container--back warda-cm--spices">
          <div className="warda-cm-aura" />
        </div>
      );
    }
    return (
      <div className="warda-cm-container warda-cm-container--front warda-cm--spices">
        <div className="warda-cm-glass-sheen" />
        {/* Soft, naturally glowing spice embers / warmth */}
        <span className="warda-cm-ember warda-cm-ember--1" />
        <span className="warda-cm-ember warda-cm-ember--2" />
        <span className="warda-cm-ember warda-cm-ember--3" />
        <span className="warda-cm-ember warda-cm-ember--4" />
      </div>
    );
  }

  // 7. GOURMAND ("ароматное тепло и золотая пыльца")
  if (layer === "back") {
    return (
      <div className="warda-cm-container warda-cm-container--back warda-cm--gourmand">
        <div className="warda-cm-aura" />
      </div>
    );
  }
  return (
    <div className="warda-cm-container warda-cm-container--front warda-cm--gourmand">
      <div className="warda-cm-glass-sheen" />
      <span className="warda-cm-ember warda-cm-ember--gold" />
      <span className="warda-cm-ember warda-cm-ember--gold-2" />
      <span className="warda-cm-ember warda-cm-ember--gold-3" />
    </div>
  );
}

/* =========================================================================
   ORGANIC BOTANICAL & LIQUID SVGS (CURVED, HIGH RESOLUTION - NO HARD EDGES)
   ========================================================================= */

function BotanicalLeafSvg({ variant = "vibrant" }) {
  const isDeep = variant === "deep";
  const isGolden = variant === "golden";
  const isMint = variant === "mint";

  const c1 = isGolden ? "#facc15" : isMint ? "#86efac" : isDeep ? "#4ade80" : "#a3e635";
  const c2 = isGolden ? "#ca8a04" : isMint ? "#22c55e" : isDeep ? "#16a34a" : "#65a30d";
  const c3 = isGolden ? "#713f12" : isMint ? "#14532d" : isDeep ? "#14532d" : "#365314";

  return (
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg" className="warda-cm-svg">
      <defs>
        <linearGradient id={`bLeaf_${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="55%" stopColor={c2} />
          <stop offset="100%" stopColor={c3} />
        </linearGradient>
      </defs>
      <path
        d="M6 38 C11 25, 18 10, 38 4 C33 22, 22 34, 6 38 Z"
        fill={`url(#bLeaf_${variant})`}
        filter="drop-shadow(0 4px 8px rgba(0,0,0,0.6))"
      />
      <path d="M6 38 Q 20 22 38 4" stroke="rgba(255, 255, 255, 0.65)" strokeWidth="1.2" strokeLinecap="round" />
      <path d="M16 28 Q 22 26 24 22" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="0.8" />
      <path d="M22 22 Q 28 20 30 16" stroke="rgba(255, 255, 255, 0.4)" strokeWidth="0.8" />
    </svg>
  );
}

function OakLeafSvg({ variant = "emerald" }) {
  const isGold = variant === "gold";
  const c1 = isGold ? "#fbbf24" : "#4ade80";
  const c2 = isGold ? "#b45309" : "#15803d";

  return (
    <svg viewBox="0 0 46 46" fill="none" xmlns="http://www.w3.org/2000/svg" className="warda-cm-svg">
      <defs>
        <linearGradient id={`oakGrad_${variant}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
      </defs>
      <path
        d="M6 40 C10 32, 6 26, 14 24 C10 18, 16 12, 24 14 C26 6, 34 4, 38 8 C40 16, 36 22, 40 28 C34 32, 32 38, 24 36 C18 40, 10 36, 6 40 Z"
        fill={`url(#oakGrad_${variant})`}
        filter="drop-shadow(0 4px 8px rgba(0,0,0,0.6))"
      />
      <path d="M6 40 Q 22 24 38 8" stroke="rgba(255, 255, 255, 0.55)" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function RosePetalSvg({ color = "ruby" }) {
  const isVelvet = color === "velvet";
  const c1 = isVelvet ? "#f43f5e" : "#fb7185";
  const c2 = isVelvet ? "#be123c" : "#e11d48";
  const c3 = isVelvet ? "#4c0519" : "#881337";

  return (
    <svg viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg" className="warda-cm-svg">
      <defs>
        <radialGradient id={`petalGrad_${color}`} cx="40%" cy="30%" r="75%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="60%" stopColor={c2} />
          <stop offset="100%" stopColor={c3} />
        </radialGradient>
      </defs>
      <path
        d="M20 3 C29 3, 37 11, 37 21 C37 30, 27 37, 20 37 C13 37, 3 30, 3 21 C3 11, 11 3, 20 3 Z"
        fill={`url(#petalGrad_${color})`}
        filter="drop-shadow(0 4px 8px rgba(0,0,0,0.65))"
      />
      <path
        d="M14 9 C20 7, 28 11, 30 18"
        stroke="rgba(255, 255, 255, 0.45)"
        strokeWidth="1.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function LiquidDropSvg({ color = "aqua", size = "normal" }) {
  const isCitrus = color === "citrus";
  const c1 = isCitrus ? "#fef08a" : "#e0f2fe";
  const c2 = isCitrus ? "#eab308" : "#38bdf8";
  const c3 = isCitrus ? "#a16207" : "#0284c7";

  const w = size === "small" ? 18 : 26;
  const h = size === "small" ? 26 : 36;

  return (
    <svg
      width={w}
      height={h}
      viewBox="0 0 26 36"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className="warda-cm-svg"
    >
      <defs>
        <radialGradient id={`dropGrad_${color}`} cx="35%" cy="32%" r="68%">
          <stop offset="0%" stopColor={c1} />
          <stop offset="50%" stopColor={c2} />
          <stop offset="100%" stopColor={c3} />
        </radialGradient>
      </defs>
      <path
        d="M13 2 C13 2, 3 17, 3 24 A 10 10 0 0 0 23 24 C23 17, 13 2, 13 2 Z"
        fill={`url(#dropGrad_${color})`}
        filter="drop-shadow(0 3px 6px rgba(0,0,0,0.5))"
      />
      <ellipse
        cx="9"
        cy="19"
        rx="2.5"
        ry="4.5"
        fill="rgba(255, 255, 255, 0.85)"
        transform="rotate(-25 9 19)"
      />
    </svg>
  );
}
