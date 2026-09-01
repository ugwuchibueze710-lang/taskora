import { Link } from 'react-router-dom';

export default function CategoryCard({ category }) {
  if (category.imageUrl) {
    return (
      <Link
        to={`/search?categoryId=${category.id}&categoryName=${encodeURIComponent(category.name)}`}
        className="group relative flex aspect-square flex-col justify-end overflow-hidden rounded-2xl border border-ink-900/8 shadow-card transition hover:-translate-y-0.5 hover:shadow-pop"
      >
        <img
          src={category.imageUrl}
          loading="lazy"
          alt=""
          className="absolute inset-0 h-full w-full object-cover transition duration-300 group-hover:scale-105"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/10 to-transparent" />
        <span className="relative z-10 px-2.5 pb-2.5 text-sm font-semibold leading-tight text-white drop-shadow-sm">
          {category.name}
        </span>
      </Link>
    );
  }

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
