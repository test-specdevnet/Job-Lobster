export function Lobster() {
  return (
    <svg
      className="lobster"
      viewBox="0 0 180 112"
      role="img"
      aria-label="A small red lobster walking across the beach"
    >
      <defs>
        <linearGradient id="shell" x1="0" y1="0" x2="0.9" y2="1">
          <stop stopColor="#ff795d" />
          <stop offset="0.55" stopColor="#e63b2d" />
          <stop offset="1" stopColor="#a71920" />
        </linearGradient>
        <filter id="lobsterShadow" x="-30%" y="-30%" width="160%" height="180%">
          <feDropShadow dx="0" dy="7" stdDeviation="4" floodColor="#7d311c" floodOpacity=".35" />
        </filter>
      </defs>
      <ellipse className="lobster-shadow" cx="90" cy="96" rx="54" ry="8" fill="#8e5f3c" opacity=".26" />
      <g className="lobster-body" filter="url(#lobsterShadow)">
        <g className="leg leg-one">
          <path d="M72 74 53 93 39 94" fill="none" stroke="#b82725" strokeWidth="7" strokeLinecap="round" />
        </g>
        <g className="leg leg-two">
          <path d="M86 77 71 99 57 103" fill="none" stroke="#b82725" strokeWidth="7" strokeLinecap="round" />
        </g>
        <g className="leg leg-three">
          <path d="M103 77 117 99 132 102" fill="none" stroke="#b82725" strokeWidth="7" strokeLinecap="round" />
        </g>
        <g className="leg leg-four">
          <path d="M116 73 135 91 149 91" fill="none" stroke="#b82725" strokeWidth="7" strokeLinecap="round" />
        </g>

        <path d="M128 60c18-11 29-9 38-1" fill="none" stroke="#d9382e" strokeWidth="8" strokeLinecap="round" />
        <path d="M164 59c-2-10 2-17 11-19 1 9-2 15-11 19Z" fill="url(#shell)" stroke="#9e1d21" strokeWidth="3" />
        <path d="M164 59c4 8 2 15-5 20-4-8-3-14 5-20Z" fill="url(#shell)" stroke="#9e1d21" strokeWidth="3" />

        <path d="M52 60C33 48 20 51 13 61" fill="none" stroke="#d9382e" strokeWidth="8" strokeLinecap="round" />
        <path d="M15 60C15 49 9 43 1 44c0 9 5 15 14 16Z" fill="url(#shell)" stroke="#9e1d21" strokeWidth="3" />
        <path d="M15 60c0 10 5 16 13 18 2-9-2-15-13-18Z" fill="url(#shell)" stroke="#9e1d21" strokeWidth="3" />

        <ellipse cx="90" cy="62" rx="45" ry="31" fill="url(#shell)" stroke="#9e1d21" strokeWidth="3" />
        <path d="M60 47c18 6 42 6 60 0M55 61c22 7 48 7 70 0M61 76c18 6 40 6 58 0" fill="none" stroke="#ff8c6a" strokeWidth="2.5" opacity=".56" />
        <path d="M82 34c0-12-4-19-12-25M98 34c2-12 7-18 16-23" fill="none" stroke="#bd2a28" strokeWidth="3" strokeLinecap="round" />
        <circle cx="68" cy="9" r="3" fill="#be2928" />
        <circle cx="116" cy="10" r="3" fill="#be2928" />
        <circle cx="73" cy="40" r="7" fill="#fff3d1" stroke="#8d1b20" strokeWidth="3" />
        <circle cx="107" cy="40" r="7" fill="#fff3d1" stroke="#8d1b20" strokeWidth="3" />
        <circle cx="75" cy="41" r="3" fill="#182332" />
        <circle cx="109" cy="41" r="3" fill="#182332" />
        <path d="M83 53c4 4 10 4 14 0" fill="none" stroke="#8d1b20" strokeWidth="2.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
