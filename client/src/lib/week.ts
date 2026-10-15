function localISO(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
export function currentWeekStart(date = new Date()): string {
  const monday = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
  return localISO(monday);
}
export function shiftWeek(week: string, offset: number): string {
  const date = new Date(`${week}T12:00:00`);
  date.setDate(date.getDate() + offset * 7);
  return localISO(date);
}
export function weekDates(week: string): string[] {
  return Array.from({ length: 7 }, (_, offset) => {
    const date = new Date(`${week}T12:00:00`);
    date.setDate(date.getDate() + offset);
    return localISO(date);
  });
}
export function selectedWeek(value: string | null): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return currentWeekStart();
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localISO(date) === value ? currentWeekStart(date) : currentWeekStart();
}
export function dateLabel(value: string): string {
  return new Date(`${value}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}
