import { NavLink, useLocation } from 'react-router-dom';

export function FamilyNav() {
  const location = useLocation();
  const week = new URLSearchParams(location.search).get('week');
  const query = week ? `?week=${encodeURIComponent(week)}` : '';
  return (
    <nav aria-label="Family kitchen" className="fixed bottom-0 inset-x-0 z-40 border-t border-gray-200 bg-white/95 backdrop-blur" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex max-w-4xl justify-around gap-1 px-2 py-2">
        {[['/week', 'This week'], ['/dashboard', 'Recipes'], ['/shopping', 'Shopping']].map(([to, label]) => (
          <NavLink key={to} to={`${to}${query}`} className={({ isActive }) => `min-h-12 flex flex-1 items-center justify-center rounded-xl px-3 text-sm font-semibold ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-600 hover:bg-gray-50'}`}>
            {label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
