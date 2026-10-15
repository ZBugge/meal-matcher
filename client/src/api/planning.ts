import { request } from './client';
export interface PlanEntry { id: string; mealId: string | null; kind: 'home' | 'takeout'; title: string; date: string | null }
export interface ShoppingItem { id: string; entryId: string | null; sourceTitle: string | null; amount: string; ingredient: string; state: 'needed' | 'have' | 'bought'; displayOrder: number }
export interface WeekPlan { week: string; entries: PlanEntry[]; shopping: ShoppingItem[] }
const endpoint = (week: string) => `/plans/${encodeURIComponent(week)}`;
export const planningApi = {
  getWeek: (week: string) => request<WeekPlan>(endpoint(week)),
  addEntry: (week: string, data: { mealId?: string; kind?: 'home' | 'takeout'; title?: string; date?: string | null }) => request<WeekPlan>(`${endpoint(week)}/entries`, { method: 'POST', body: JSON.stringify(data) }),
  updateEntry: (week: string, id: string, data: { date: string | null }) => request<WeekPlan>(`${endpoint(week)}/entries/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeEntry: (week: string, id: string) => request<WeekPlan>(`${endpoint(week)}/entries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  addItem: (week: string, data: { ingredient: string; amount?: string }) => request<WeekPlan>(`${endpoint(week)}/items`, { method: 'POST', body: JSON.stringify(data) }),
  updateItem: (week: string, id: string, data: Partial<Pick<ShoppingItem, 'ingredient' | 'amount' | 'state'>>) => request<WeekPlan>(`${endpoint(week)}/items/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(data) }),
  removeItem: (week: string, id: string) => request<WeekPlan>(`${endpoint(week)}/items/${encodeURIComponent(id)}`, { method: 'DELETE' }),
};
