import { request } from './client';
export interface PlanEntry { id: string; mealId: string | null; kind: 'home' | 'takeout'; title: string; date: string | null }
export interface ShoppingItem { id: string; entryId: string | null; sourceTitle: string | null; amount: string; ingredient: string; state: 'needed' | 'have' | 'bought'; aisle: string | null; displayOrder: number }
export interface WeekPlan { week: string; entries: PlanEntry[]; shopping: ShoppingItem[] }
const endpoint = (week: string) => `/plans/${encodeURIComponent(week)}`;
export const planningApi = {
  staples: (week: string) => request<DinnerStaple[]>(`${endpoint(week)}/staples`),
  saveStaple: (week: string, title: string, id?: string) => request(`${endpoint(week)}/staples${id ? '/' + encodeURIComponent(id) : ''}`, { method: id ? 'PATCH' : 'POST', body: JSON.stringify({ title }) }),
  removeStaple: (week: string, id: string) => request(`${endpoint(week)}/staples/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  bulkItems: (week: string, ids: string[], state: ShoppingItem['state']) => request<WeekPlan>(`${endpoint(week)}/items/bulk`, { method: 'POST', body: JSON.stringify({ ids, state }) }),
  repeat: (week: string, targetWeek: string, entryIds: string[]) => request<WeekPlan>(`${endpoint(week)}/repeat`, { method: 'POST', body: JSON.stringify({ targetWeek, entryIds }) }),
  getWeek: (week: string) => request<WeekPlan>(endpoint(week)),
  addEntry: (week: string, data: { mealId?: string; kind?: 'home' | 'takeout'; title?: string; date?: string | null }) => request<WeekPlan>(`${endpoint(week)}/entries`, { method: 'POST', body: JSON.stringify(data) }),
  updateEntry: (week: string, id: string, data: { date: string | null }) => request<WeekPlan>(`${endpoint(week)}/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeEntry: (week: string, id: string, keepGroceries = false) => request<WeekPlan>(`${endpoint(week)}/entries/${encodeURIComponent(id)}?keepGroceries=${keepGroceries}`, { method: 'DELETE' }),
  addItem: (week: string, data: { ingredient: string; amount?: string }) => request<WeekPlan>(`${endpoint(week)}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (week: string, id: string, data: Partial<Pick<ShoppingItem, 'ingredient' | 'amount' | 'state' | 'aisle'>>) => request<WeekPlan>(`${endpoint(week)}/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeItem: (week: string, id: string) => request<WeekPlan>(`${endpoint(week)}/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};

export interface DinnerStaple { id: string; title: string }
