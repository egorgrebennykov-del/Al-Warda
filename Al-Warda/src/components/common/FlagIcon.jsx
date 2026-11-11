export function RussianFlag({
  className = "",
  width = 22,
  height = 15,
  style = {},
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 480"
      width={width}
      height={height}
      className={`warda-flag-svg warda-flag-svg--ru ${className}`}
      style={{
        borderRadius: "3px",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-label="Russian Flag"
    >
      <g fillRule="evenodd" strokeWidth="1pt">
        <path fill="#ffffff" d="M0 0h640v160H0z" />
        <path fill="#0039a6" d="M0 160h640v160H0z" />
        <path fill="#d52b1e" d="M0 320h640v160H0z" />
      </g>
    </svg>
  );
}

export function BritishFlag({
  className = "",
  width = 22,
  height = 15,
  style = {},
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 480"
      width={width}
      height={height}
      className={`warda-flag-svg warda-flag-svg--en ${className}`}
      style={{
        borderRadius: "3px",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-label="UK Flag"
    >
      <path fill="#012169" d="M0 0h640v480H0z" />
      <path
        fill="#ffffff"
        d="m75 0 244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-179L0 64V0h75z"
      />
      <path
        fill="#c8102e"
        d="m424 281 216 159v40L369 281h55zm-104-41 267-200h53L360 240h-40zM0 0l239 179h-55L0 44V0zm0 439 184-138h55L0 480v-41z"
      />
      <path fill="#ffffff" d="M240 0h160v480H240zM0 160h640v160H0z" />
      <path fill="#c8102e" d="M267 0h106v480H267zM0 187h640v106H0z" />
    </svg>
  );
}

export function HungarianFlag({
  className = "",
  width = 22,
  height = 15,
  style = {},
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 480"
      width={width}
      height={height}
      className={`warda-flag-svg warda-flag-svg--hu ${className}`}
      style={{
        borderRadius: "3px",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-label="Hungarian Flag"
    >
      <g fillRule="evenodd">
        <path fill="#ce2939" d="M0 0h640v160H0z" />
        <path fill="#ffffff" d="M0 160h640v160H0z" />
        <path fill="#477050" d="M0 320h640v160H0z" />
      </g>
    </svg>
  );
}

export function BulgarianFlag({
  className = "",
  width = 22,
  height = 15,
  style = {},
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 480"
      width={width}
      height={height}
      className={`warda-flag-svg warda-flag-svg--bg ${className}`}
      style={{
        borderRadius: "3px",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-label="Bulgarian Flag"
    >
      <g fillRule="evenodd">
        <path fill="#ffffff" d="M0 0h640v160H0z" />
        <path fill="#00966e" d="M0 160h640v160H0z" />
        <path fill="#d62612" d="M0 320h640v160H0z" />
      </g>
    </svg>
  );
}

export function GreekFlag({
  className = "",
  width = 22,
  height = 15,
  style = {},
}) {
  const stripes = Array.from({ length: 9 }, (_, index) => (
    <path
      key={index}
      fill={index % 2 === 0 ? "#0d5eaf" : "#ffffff"}
      d={`M0 ${index * 53.33}h640v53.33H0z`}
    />
  ));
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 480"
      width={width}
      height={height}
      className={`warda-flag-svg warda-flag-svg--el ${className}`}
      style={{
        borderRadius: "3px",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-label="Greek Flag"
    >
      <g fillRule="evenodd">{stripes}</g>
      <path fill="#0d5eaf" d="M0 0h266.67v266.67H0z" />
      <path fill="#ffffff" d="M88.89 0h88.89v266.67H88.89zM0 88.89h266.67v88.89H0z" />
    </svg>
  );
}

export function RomanianFlag({
  className = "",
  width = 22,
  height = 15,
  style = {},
}) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 640 480"
      width={width}
      height={height}
      className={`warda-flag-svg warda-flag-svg--ro ${className}`}
      style={{
        borderRadius: "3px",
        boxShadow: "0 0 0 1px rgba(0, 0, 0, 0.15), 0 1px 3px rgba(0, 0, 0, 0.1)",
        display: "inline-block",
        verticalAlign: "middle",
        flexShrink: 0,
        ...style,
      }}
      aria-label="Romanian Flag"
    >
      <g fillRule="evenodd">
        <path fill="#002b7f" d="M0 0h213.33v480H0z" />
        <path fill="#fcd116" d="M213.33 0h213.34v480H213.33z" />
        <path fill="#ce1126" d="M426.67 0H640v480H426.67z" />
      </g>
    </svg>
  );
}

export default function FlagIcon({
  code = "ru",
  width = 22,
  height = 15,
  className = "",
  style = {},
}) {
  const norm = String(code).toLowerCase();
  if (norm === "en" || norm === "gb" || norm === "uk") {
    return (
      <BritishFlag
        width={width}
        height={height}
        className={className}
        style={style}
      />
    );
  }
  const FlagByCode = {
    hu: HungarianFlag,
    bg: BulgarianFlag,
    el: GreekFlag,
    gr: GreekFlag,
    ro: RomanianFlag,
  }[norm];
  if (FlagByCode) {
    return (
      <FlagByCode
        width={width}
        height={height}
        className={className}
        style={style}
      />
    );
  }
  return (
    <RussianFlag
      width={width}
      height={height}
      className={className}
      style={style}
    />
  );
}
