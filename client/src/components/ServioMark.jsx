// The Servio Hub brand mark -- a single source of truth for the "S" logo icon
// and the "Servio Hub" wordmark treatment, so the icon, the splash intro, the
// nav badge, and the auth pages all render the exact same brand instead of
// four slightly-different hand-rolled versions.

/** The gradient "S" icon on its own, no text. */
export function ServioIcon({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="servioGradIcon" x1="4" y1="2" x2="92" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6d35ee" />
          <stop offset="50%" stopColor="#9333ea" />
          <stop offset="100%" stopColor="#ec45c4" />
        </linearGradient>
      </defs>
      <path
        d="M74,26 C74,13 61,6 49,6 C35,6 24,16 24,29 C24,43 38,47 50,51 C62,55 76,60 76,74 C76,87 64,94 50,94 C37,94 25,88 24,76"
        fill="none"
        stroke="url(#servioGradIcon)"
        strokeWidth="19"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The "Servio Hub" wordmark: "Servio" in brand ink, "Hub" in the signature
 * gradient -- matches the logo artwork. `size` controls font-size via a
 * Tailwind text-* class so callers can drop it in at any scale.
 */
export function ServioWordmark({ size = 'text-xl', className = '' }) {
  return (
    <span className={`font-display font-semibold ${size} ${className}`}>
      <span className="text-navy-900">Servio </span>
      <span className="brand-wordmark-accent">Hub</span>
    </span>
  );
}

/** Icon stacked above the wordmark -- the corner badge layout from the logo artwork. */
export function ServioBadge({ iconSize = 30, wordSize = 'text-[11px]', className = '' }) {
  return (
    <span className={`flex flex-col items-center leading-none ${className}`}>
      <ServioIcon size={iconSize} />
      <span className="mt-1 font-display font-semibold tracking-wide">
        <span className="text-navy-900" style={{ fontSize: '0.68em' }}>servio </span>
        <span className="brand-wordmark-accent" style={{ fontSize: '0.68em' }}>hub</span>
      </span>
    </span>
  );
}
