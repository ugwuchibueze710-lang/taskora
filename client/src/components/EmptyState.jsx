export default function EmptyState({ icon = '🔎', title, hint, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6 animate-popIn">
      <div className="text-5xl mb-4">{icon}</div>
      <h3 className="font-display text-xl text-ink-900 mb-1">{title}</h3>
      {hint && <p className="text-ink-700/70 max-w-sm">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
