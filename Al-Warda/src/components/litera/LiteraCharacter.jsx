import { useState } from "react";

const VALID_EMOTIONS = new Set([
  "neutral",
  "happy",
  "laughing",
  "thinking",
  "curious",
  "surprised",
  "confused",
  "sad",
  "concerned",
  "speaking",
  "greeting",
  "loading",
  "success",
  "error",
  "messageRead",
  "blushing",
]);

export default function LiteraCharacter({
  emotion = "neutral",
  size = 130,
  className = "",
  onClick,
  alt = "Yasmin - Al-Warda Fragrance Concierge",
}) {
  const [imgError, setImgError] = useState(false);

  const cleanEmotion = VALID_EMOTIONS.has(emotion) ? emotion : "neutral";
  const imageSrc = imgError
    ? "/assets/img/litera_assistant/neutral.png"
    : `/assets/img/litera_assistant/${cleanEmotion}.png`;

  return (
    <div
      className={`litera-character litera-character--${cleanEmotion} ${className}`}
      onClick={onClick}
      style={{
        width: typeof size === "number" ? `${size}px` : size,
        height: typeof size === "number" ? `${size}px` : size,
      }}
      role={onClick ? "button" : "img"}
      tabIndex={onClick ? 0 : undefined}
      aria-label={alt}
    >
      <img
        src={imageSrc}
        alt={alt}
        className="litera-character__image"
        onError={(e) => {
          if (!e.target.src.includes("/images/litera/")) {
            e.target.src = `/images/litera/${cleanEmotion}.png`;
          } else {
            setImgError(true);
          }
        }}
        draggable={false}
      />
    </div>
  );
}
