const API_BASE = '/api';

interface ApiError {
  error: string;
  sessionClosed?: boolean;
}

class ApiException extends Error {
  sessionClosed: boolean;

  constructor(message: string, sessionClosed: boolean = false) {
    super(message);
    this.name = 'ApiException';
    this.sessionClosed = sessionClosed;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  const data = await response.json();

  if (!response.ok) {
    const error = data as ApiError;
    throw new ApiException(error.error || 'An error occurred', error.sessionClosed || false);
  }

  return data as T;
}

// Auth API
export interface User {
  id: string;
  email: string;
  createdAt?: string;
}

export const authApi = {
  register: (email: string, password: string) =>
    request<User>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  login: (email: string, password: string) =>
    request<User>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  logout: () =>
    request<{ message: string }>('/auth/logout', { method: 'POST' }),

  getMe: () => request<User>('/auth/me'),
};

// Meals API
export interface Meal {
  id: string;
  title: string;
  description: string | null;
  type: string;
  pickCount: number;
  createdAt?: string;
  archived?: boolean;
}

export const mealsApi = {
  list: () => request<Meal[]>('/meals'),

  listAll: () => request<Meal[]>('/meals/all'),

  create: (title: string, description?: string) =>
    request<Meal>('/meals', {
      method: 'POST',
      body: JSON.stringify({ title, description }),
    }),

  update: (id: string, data: { title?: string; description?: string }) =>
    request<Meal>(`/meals/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    }),

  delete: (id: string) =>
    request<{ message: string }>(`/meals/${id}`, { method: 'DELETE' }),

  restore: (id: string) =>
    request<{ message: string }>(`/meals/${id}/restore`, { method: 'POST' }),
};

// Sessions API
export interface Session {
  id: string;
  inviteCode: string;
  status: 'open' | 'closed';
  selectedMealId: string | null;
  mealCount: number;
  participantCount: number;
  createdAt: string;
  closedAt: string | null;
}

export interface SessionDetails extends Session {
  meals: Array<{ id: string; title: string; description: string | null }>;
  participants: Array<{
    id: string;
    displayName: string;
    submitted: boolean;
    createdAt: string;
  }>;
  results: MatchResult[] | null;
}

export interface MatchResult {
  mealId: string;
  title: string;
  description: string | null;
  yesCount: number;
  totalVotes: number;
  percentage: number;
  isUnanimous: boolean;
  voters?: Array<{ name: string; vote: boolean }>;
}

export const sessionsApi = {
  list: () => request<Session[]>('/sessions'),

  create: (mealIds: string[]) =>
    request<{ id: string; inviteCode: string; status: string; mealCount: number }>(
      '/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ mealIds }),
      }
    ),

  get: (id: string) => request<SessionDetails>(`/sessions/${id}`),

  close: (id: string, creatorToken?: string) =>
    request<{ message: string; results: MatchResult[] }>(`/sessions/${id}/close`, {
      method: 'POST',
      body: JSON.stringify({ creatorToken }),
    }),

  selectMeal: (sessionId: string, mealId: string) =>
    request<{ message: string }>(`/sessions/${sessionId}/select`, {
      method: 'POST',
      body: JSON.stringify({ mealId }),
    }),
};

// Participant API (public)
export interface JoinSessionResponse {
  participantId: string;
  sessionId: string;
  meals: Array<{
    id: string;
    title: string;
    description: string | null;
    sessionMealId: string;
  }>;
}

export interface ResultsResponse {
  status: 'waiting' | 'closed';
  message?: string;
  results?: MatchResult[];
  selectedMeal?: {
    id: string;
    title: string;
    description: string | null;
  } | null;
  isHost?: boolean;
}

export const participantApi = {
  getSession: (inviteCode: string) =>
    request<{ id: string; status: string; participantCount: number }>(
      `/join/${inviteCode}`
    ),

  joinSession: (inviteCode: string, displayName: string) =>
    request<JoinSessionResponse>(`/join/${inviteCode}`, {
      method: 'POST',
      body: JSON.stringify({ displayName }),
    }),

  submitSwipes: (
    sessionId: string,
    participantId: string,
    swipes: Array<{ mealId: string; vote: boolean }>
  ) =>
    request<{ message: string }>(`/swipes/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ participantId, swipes }),
    }),

  getResults: (sessionId: string, isHost: boolean = false) =>
    request<ResultsResponse>(`/results/${sessionId}?host=${isHost}`),

  getSessionStatus: (sessionId: string) =>
    request<{ status: string; selectedMealId: string | null }>(
      `/session-status/${sessionId}`
    ),
};

// Quick Session API
export interface QuickSessionResponse {
  session: {
    id: string;
    inviteCode: string;
    status: string;
  };
  participantId: string;
  creatorToken: string | null;
  mealIds: string[];
}

export const quickSessionApi = {
  create: (creatorName: string, meals: Array<{ title: string; description?: string }>) =>
    request<QuickSessionResponse>('/quick-session', {
      method: 'POST',
      body: JSON.stringify({ creatorName, meals }),
    }),
};
