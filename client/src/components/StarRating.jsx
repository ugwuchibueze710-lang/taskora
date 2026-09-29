export default function StarRating({ rating = 0, count, size = 'text-sm' }) {
  const full = Math.round(rating);
  return (
    <span className={`inline-flex items-center gap-1 ${size}`}>
      <span className="text-accent-500">
        {'★'.repeat(full)}
        <span className="text-navy-900/15">{'★'.repeat(5 - full)}</span>
      </span>
      {rating > 0 && <span className="text-navy-700/70">{rating.toFixed(1)}</span>}
      {typeof count === 'number' && <span className="text-navy-700/50">({count})</span>}
    </span>
  );
}
