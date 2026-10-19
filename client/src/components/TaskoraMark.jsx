// The Taskora brand mark -- a single source of truth for the "T" logo icon
// and the "Taskora" wordmark treatment, so the icon, the splash intro, the
// nav badge, and the auth pages all render the exact same brand instead of
// four slightly-different hand-rolled versions.

/** The gradient "T" icon on its own, no text. */
export function TaskoraIcon({ size = 32, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="taskoraGradIcon" x1="4" y1="2" x2="92" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#6d35ee" />
          <stop offset="50%" stopColor="#9333ea" />
          <stop offset="100%" stopColor="#ec45c4" />
        </linearGradient>
      </defs>
      <rect x="8" y="6" width="84" height="28" rx="14" fill="url(#taskoraGradIcon)" />
      <rect x="36" y="26" width="28" height="64" rx="13" fill="url(#taskoraGradIcon)" />
      <path
        d="M21,49 L42,68 L80,23"
        fill="none"
        stroke="#ffffff"
        strokeWidth="11"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/**
 * The "Taskora" wordmark: "Task" in brand ink, "ora" in the signature
 * gradient -- matches the logo artwork exactly. `size` controls font-size
 * via a Tailwind text-* class so callers can drop it in at any scale.
 */
export function TaskoraWordmark({ size = 'text-xl', className = '' }) {
  return (
    <span className={`font-display font-semibold ${size} ${className}`}>
      <span className="text-navy-900">Task</span>
      <span className="taskora-wordmark-accent">ora</span>
    </span>
  );
}

/** Icon stacked above the wordmark -- the corner badge layout from the logo artwork. */
export function TaskoraBadge({ iconSize = 30, wordSize = 'text-[11px]', className = '' }) {
  return (
    <span className={`flex flex-col items-center leading-none ${className}`}>
      <TaskoraIcon size={iconSize} />
      <span className="mt-1 font-display font-semibold tracking-wide">
        <span className="text-navy-900" style={{ fontSize: '0.68em' }}>task</span>
        <span className="taskora-wordmark-accent" style={{ fontSize: '0.68em' }}>ora</span>
      </span>
    </span>
  );
}
