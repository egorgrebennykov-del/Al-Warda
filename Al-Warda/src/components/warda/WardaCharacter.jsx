import { useState, useEffect } from "react";

// Stabilize avatar: map volatile emotions to Yasmin's iconic signature presence.
// Yasmin stays calm and elegant: signature portrait (greeting) for conversation,
// thinking portrait only while searching/loading, and concerned only on errors.
export const CANONICAL_EMOTION_MAP = {
  greeting: "greeting",
  welcoming: "greeting",
  friendly: "greeting",
  neutral: "greeting",
  happy: "greeting",
  smiling: "greeting",
  speaking: "greeting",
  curious: "greeting",
  confident: "greeting",
  blushing: "greeting",
  shy: "greeting",
  laughing: "greeting",
  laughting: "greeting",
  messageRead: "greeting",
  success: "greeting",
  reassuring: "greeting",
  surprised: "greeting",
  thinking: "thinking",
  loading: "thinking",
  confused: "thinking",
  concerned: "concerned",
  sad: "concerned",
  error: "concerned",
};

export function getCanonicalEmotion(emotion) {
  if (!emotion) return "greeting";
  const normalized = String(emotion).trim();
  return CANONICAL_EMOTION_MAP[normalized] || "greeting";
}

export default function WardaCharacter({
  emotion = "greeting",
  size = 130,
  className = "",
  onClick,
  alt = "Yasmin - Al-Warda Fragrance Concierge",
}) {
  const [imgError, setImgError] = useState(false);

  const cleanEmotion = getCanonicalEmotion(emotion);

  useEffect(() => {
    setImgError(false);
  }, [cleanEmotion]);

  const imageSrc = imgError
    ? "/assets/img/warda_assistant/greeting.png"
    : `/assets/img/warda_assistant/${cleanEmotion}.png`;

  return (
    <div
      className={`warda-character warda-character--${cleanEmotion} ${className}`}
      onClick={onClick}
      style={{
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
      }}
      role={onClick ? "button" : "img"}
      tabIndex={onClick ? 0 : undefined}
      aria-label={alt}
    >
      <div className="warda-character__aura" aria-hidden="true" />
      <img
        src={imageSrc}
        alt={alt}
        className="warda-character__image"
        onError={(e) => {
          if (!e.target.src.includes("greeting.png")) {
            e.target.src = "/assets/img/warda_assistant/greeting.png";
          } else {
            setImgError(true);
          }
        }}
        draggable={false}
      />
    </div>
  );
}
