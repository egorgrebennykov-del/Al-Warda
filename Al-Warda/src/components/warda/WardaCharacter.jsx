import { useState, useEffect } from "react";

// Yasmin's visual emotion map: connects state expressions to authentic avatar portraits.
// Greeting/welcoming for hello & introductions; happy/friendly for recommendations;
// speaking/confident for explanations; thinking/loading for searches; concerned for errors.
export const CANONICAL_EMOTION_MAP = {
  // Greetings & Welcome (signature waving pose)
  greeting: "greeting",
  welcoming: "welcoming",

  // Warmth, Joy & Delight
  happy: "happy",
  smiling: "happy",
  friendly: "friendly",
  blushing: "blushing",
  shy: "shy",
  laughing: "laughing",
  laughting: "laughing",
  success: "success",

  // Conversation, Explanation & Fragrance Notes
  speaking: "speaking",
  confident: "confident",
  curious: "curious",

  // Reflection & Searching
  thinking: "thinking",
  loading: "loading",

  // Wonder & Surprise
  surprised: "surprised",
  confused: "confused",

  // Calm & Attentive Listening
  neutral: "neutral",
  messageRead: "messageRead",

  // Empathy, Support & Alerts
  concerned: "concerned",
  reassuring: "reassuring",
  sad: "sad",
  error: "error",
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
