interface Props {
  height?: number;
  style?: React.CSSProperties;
}

export default function LabFlowLogo({ height = 38, style }: Props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 280 64"
      style={{ height, width: 'auto', display: 'block', ...style }}
    >
      <defs>
        <linearGradient id="lf-icon-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%"   stopColor="#0ea5e9"/>
          <stop offset="50%"  stopColor="#6366f1"/>
          <stop offset="100%" stopColor="#a855f7"/>
        </linearGradient>
      </defs>

      {/* Icon: white rounded square with gradient LF */}
      <rect x="2" y="2" width="60" height="60" rx="14" fill="white"/>
      <path d="M 18,16 L 18,50 Q 18,54 22,54 L 34,54"
        fill="none" stroke="url(#lf-icon-grad)" strokeWidth="3.2"
        strokeLinecap="square" strokeLinejoin="round"/>
      <path d="M 44,54 L 44,16 L 58,16 Q 61,16 61,19"
        fill="none" stroke="url(#lf-icon-grad)" strokeWidth="3.2"
        strokeLinecap="square" strokeLinejoin="round"/>
      <path d="M 44,33 L 58,33"
        fill="none" stroke="url(#lf-icon-grad)" strokeWidth="3.2"
        strokeLinecap="square"/>

      {/* Wordmark: white text */}
      <text x="76" y="44"
        fontFamily="system-ui, -apple-system, 'Helvetica Neue', Arial, sans-serif"
        fontSize="32"
        fill="white">
        <tspan fontWeight="800" letterSpacing="-0.5">Lab</tspan>
        <tspan fontWeight="300" letterSpacing="1.5">Flow</tspan>
      </text>
    </svg>
  );
}
