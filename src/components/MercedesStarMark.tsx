interface MercedesStarMarkProps {
  className?: string;
  /** Accessible label — omit when decorative (parent has text). */
  title?: string;
}

/** Canonical Mercedes three-pointed star mark — matches PWA / apple-touch PNGs. */
export function MercedesStarMark({ className, title }: MercedesStarMarkProps) {
  const labelled = Boolean(title);

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 1024 1024"
      className={className}
      role={labelled ? 'img' : 'presentation'}
      aria-hidden={labelled ? undefined : true}
    >
      {title ? <title>{title}</title> : null}
      <defs>
        <linearGradient id="merlin-bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#12121a" />
          <stop offset="100%" stopColor="#08080a" />
        </linearGradient>
        <linearGradient id="merlin-bubble" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#5ee0ff" />
          <stop offset="45%" stopColor="#00adef" />
          <stop offset="100%" stopColor="#006fa0" />
        </linearGradient>
        <linearGradient id="merlin-bubbleInner" x1="20%" y1="15%" x2="80%" y2="85%">
          <stop offset="0%" stopColor="#1a1a24" />
          <stop offset="100%" stopColor="#0a0a0f" />
        </linearGradient>
        <radialGradient id="merlin-glow" cx="50%" cy="42%" r="58%">
          <stop offset="0%" stopColor="#00adef" stopOpacity="0.45" />
          <stop offset="70%" stopColor="#00adef" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#00adef" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="merlin-star" x1="30%" y1="20%" x2="70%" y2="90%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="35%" stopColor="#e8eef5" />
          <stop offset="70%" stopColor="#b8c4d4" />
          <stop offset="100%" stopColor="#8a96a8" />
        </linearGradient>
        <filter id="merlin-starShadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="8" stdDeviation="10" floodColor="#000000" floodOpacity="0.55" />
          <feDropShadow dx="0" dy="-2" stdDeviation="4" floodColor="#00adef" floodOpacity="0.35" />
        </filter>
      </defs>

      <rect width="1024" height="1024" rx="224" fill="url(#merlin-bg)" />
      <ellipse cx="512" cy="470" rx="430" ry="390" fill="url(#merlin-glow)" />

      <circle cx="512" cy="512" r="392" fill="none" stroke="url(#merlin-bubble)" strokeWidth="28" />
      <circle
        cx="512"
        cy="512"
        r="360"
        fill="url(#merlin-bubbleInner)"
        stroke="rgba(255,255,255,0.08)"
        strokeWidth="4"
      />

      <path
        d="M 280 360 A 240 240 0 0 1 744 360"
        fill="none"
        stroke="rgba(255,255,255,0.22)"
        strokeWidth="22"
        strokeLinecap="round"
      />

      <g filter="url(#merlin-starShadow)">
        <path
          fill="url(#merlin-star)"
          d="M 512 248 L 668 420 L 842 420 L 704 536 L 776 712 L 512 576 L 248 712 L 320 536 L 182 420 L 356 420 Z"
        />
        <path
          fill="#08080a"
          opacity="0.92"
          d="M 512 318 L 620 438 L 748 438 L 646 528 L 694 648 L 512 548 L 330 648 L 378 528 L 276 438 L 404 438 Z"
        />
      </g>

      <circle cx="512" cy="512" r="300" fill="none" stroke="rgba(200,210,225,0.35)" strokeWidth="10" />
      <circle cx="512" cy="512" r="300" fill="none" stroke="rgba(0,173,239,0.25)" strokeWidth="4" />
    </svg>
  );
}