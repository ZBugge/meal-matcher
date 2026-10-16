import { NavLink, useLocation } from 'react-router-dom';

const icons = {
  Plan: <><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M7 3v4m10-4v4M3 11h18m-13 5h3m3 0h2" /></>,
  Shop: <><path d="M4 8h16l-1 13H5L4 8Z" /><path d="M8 8V6a4 4 0 0 1 8 0v2" /></>,
  Recipes: <><path d="M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 0v15" /><path d="M5 8h4m-4 4h4m6-4h4m-4 4h4" /></>,
};
export function FamilyNav() {
  const location = useLocation();
  const week = new URLSearchParams(location.search).get('week');
  const query = week ? `?week=${encodeURIComponent(week)}` : '';
  return <nav aria-label="Family kitchen" className="family-navigation fixed bottom-0 inset-x-0 z-40 border-t border-stone-200 bg-paper/95 backdrop-blur">
    <div className="mx-auto flex max-w-3xl gap-2 px-4 py-2">
      {([['/week', 'Plan'], ['/shopping', 'Shop'], ['/recipes', 'Recipes']] as const).map(([to, label]) => <NavLink key={to} to={`${to}${query}`} className={({ isActive }) => `flex min-h-14 flex-1 flex-col items-center justify-center gap-1 rounded-xl text-sm font-semibold ${isActive ? 'bg-primary-50 text-primary-700' : 'text-muted hover:bg-primary-50'}`}><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">{icons[label]}</svg>{label}</NavLink>)}
    </div>
  </nav>;
}
