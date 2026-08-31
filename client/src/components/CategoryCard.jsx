import { Link } from 'react-router-dom';

export default function CategoryCard({ category }) {
  return (
    <Link
      to={`/search?categoryId=${category.id}&categoryName=${encodeURIComponent(category.name)}`}
      className="group flex flex-col items-center gap-2 rounded-2xl border border-ink-900/8 bg-white p-4 text-center shadow-card transition hover:-translate-y-0.5 hover:border-ember-300 hover:shadow-pop"
    >
      <span className="text-3xl transition group-hover:scale-110">{category.icon}</span>
      <span className="text-sm font-medium text-ink-800 leading-tight">{category.name}</span>
    </Link>
  );
}
