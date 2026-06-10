interface Props {
  height?: number;
  style?: React.CSSProperties;
}

export default function LabFlowLogo({ height = 38, style }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 192 52"
      style={{ height, width: 'auto', display: 'block', ...style }}
    >
      <defs>
        <linearGradient id="lf-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#0ea5e9"/>
          <stop offset="52%"  stopColor="#6366f1"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
        <clipPath id="lf-clip">
          <rect x="-18" y="-18" width="36" height="36" rx="6.74"
            transform="translate(26,26) rotate(45)"/>
        </clipPath>
      </defs>

      {/* Diamond gradient fill */}
      <rect x="-18" y="-18" width="36" height="36" rx="6.74"
        fill="url(#lf-bg)"
        transform="translate(26,26) rotate(45)"/>

      {/* Shine (top half) */}
      <rect x="0" y="0" width="52" height="26"
        fill="rgba(255,255,255,0.13)"
        clipPath="url(#lf-clip)"/>

      {/* Border */}
      <rect x="-18" y="-18" width="36" height="36" rx="6.74"
        fill="none" stroke="rgba(255,255,255,0.32)" strokeWidth="0.6"
        transform="translate(26,26) rotate(45)"/>

      {/* LF monogram — L normal (left) + F mirrored (right), white */}
      <g transform="translate(26,26) rotate(45)" fill="white">
        {/* L stem (shortened top — starts below F top bar) */}
        <rect x="-7.66" y="-5.46" width="3.37" height="14.98" rx="1.28"/>
        {/* L foot */}
        <rect x="-7.66" y="6.15"  width="11.27" height="3.37"  rx="1.28"/>
        {/* F stem (full height) */}
        <rect x="4.30"  y="-9.52" width="3.37"  height="19.04" rx="1.28"/>
        {/* F top bar (full width, spans both L and F) */}
        <rect x="-7.66" y="-9.52" width="15.33" height="3.37"  rx="1.28"/>
        {/* F mid bar (shorter) */}
        <rect x="-1.51" y="-1.33" width="9.17"  height="3.37"  rx="1.28"/>
      </g>

      {/* Wordmark */}
      <text
        x="62" y="26"
        fontFamily="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontSize="23"
        fill="white"
        dominantBaseline="middle"
      >
        <tspan fontWeight="800" letterSpacing="-0.5">Lab</tspan>
        <tspan fontWeight="300" letterSpacing="2">Flow</tspan>
      </text>
    </svg>
  );
}
