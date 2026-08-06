const API_BASE = '/api';

interface ApiError {
  error: string;
  sessionClosed?: boolean;
  existingId?: string;
}

export class ApiException extends Error {
  sessionClosed: boolean;
  existingId?: string;

  constructor(message: string, sessionClosed: boolean = false, existingId?: string) {
    super(message);
    this.name = 'ApiException';
    this.sessionClosed = sessionClosed;
    this.existingId = existingId;
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
    throw new ApiException(
      error.error || 'An error occurred',
      error.sessionClosed || false,
      error.existingId
    );
  }

  return data as T;
}

// Auth API
export interface User {
  id: string;
  email: string;
  createdAt?: string;
  takeoutOnboardingDismissed?: boolean;
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

  updatePreferences: (takeoutOnboardingDismissed: boolean) =>
    request<User>('/auth/preferences', {
      method: 'PATCH',
      body: JSON.stringify({ takeoutOnboardingDismissed }),
    }),
};

// Meals API
export type SessionMode = 'home' | 'takeout';
export type MealType = 'meal' | 'category' | 'restaurant';

export interface RecipeIngredient {
  amount: string;
  ingredient: string;
}

export interface RecipeInput {
  instructions?: string | null;
  ingredients?: RecipeIngredient[];
}

export interface ParsedRecipe {
  title: string;
  description: string | null;
  instructions: string | null;
  ingredients: RecipeIngredient[];
}

export interface Meal {
  id: string;
  title: string;
  description: string | null;
  instructions?: string | null;
  ingredients?: RecipeIngredient[];
  type: MealType;
  pickCount: number;
  createdAt?: string;
  lastSelectedAt?: string | null;
  archived?: boolean;
}

export const mealsApi = {
  parseRecipe: (text: string) =>
    request<ParsedRecipe>('/meals/parse-recipe', {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),

  list: (type?: MealType) =>
    request<Meal[]>(`/meals${type ? `?type=${type}` : ''}`),

  listAll: (type?: MealType) =>
    request<Meal[]>(`/meals/all${type ? `?type=${type}` : ''}`),

  get: (id: string) => request<Meal>(`/meals/${id}`),

  create: (
    title: string,
    description?: string,
    type: MealType = 'meal',
    recipe?: RecipeInput
  ) =>
    request<Meal>('/meals', {
      method: 'POST',
      body: JSON.stringify({ title, description, type, ...recipe }),
    }),

  update: (
    id: string,
    data: { title?: string; description?: string; instructions?: string | null; ingredients?: RecipeIngredient[] }
  ) =>
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
  mode: SessionMode;
  selectedMealId: string | null;
  selectedMeal: { id: string; title: string; type: MealType } | null;
  mealCount: number;
  participantCount: number;
  createdAt: string;
  closedAt: string | null;
}

export interface SessionDetails extends Session {
  meals: Array<{ id: string; title: string; description: string | null; type: MealType }>;
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
  maybeCount: number;
  totalVotes: number;
  percentage: number;
  isUnanimous: boolean;
  voters?: Array<{ name: string; vote: number }>;
}

export const sessionsApi = {
  list: () => request<Session[]>('/sessions'),

  create: (mealIds: string[], mode: SessionMode = 'home') =>
    request<{ id: string; inviteCode: string; status: string; mode: SessionMode; mealCount: number }>(
      '/sessions',
      {
        method: 'POST',
        body: JSON.stringify({ mealIds, mode }),
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
  mode: SessionMode;
  meals: Array<{
    id: string;
    title: string;
    description: string | null;
    type: MealType;
    sessionMealId: string;
  }>;
}

export interface ResultsResponse {
  status: 'waiting' | 'closed';
  mode: SessionMode;
  message?: string;
  results?: MatchResult[];
  selectedMeal?: {
    id: string;
    title: string;
    description: string | null;
    type: MealType;
  } | null;
  isHost?: boolean;
}

export const participantApi = {
  getSession: (inviteCode: string) =>
    request<{ id: string; status: string; mode: SessionMode; participantCount: number }>(
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
    swipes: Array<{ mealId: string; vote: number }>
  ) =>
    request<{ message: string }>(`/swipes/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ participantId, swipes }),
    }),

  getResults: (sessionId: string, isHost: boolean = false) =>
    request<ResultsResponse>(`/results/${sessionId}?host=${isHost}`),

  getSessionStatus: (sessionId: string) =>
    request<{
      status: string;
      mode: SessionMode;
      selectedMealId: string | null;
      participants: Array<{
        id: string;
        displayName: string;
        submitted: boolean;
      }>;
    }>(`/session-status/${sessionId}`),

  closeSession: (sessionId: string, creatorToken: string) =>
    request<{ message: string; results: MatchResult[] }>(`/close-session/${sessionId}`, {
      method: 'POST',
      body: JSON.stringify({ creatorToken }),
    }),
};

// Quick Session API
export interface QuickSessionResponse {
  session: {
    id: string;
    inviteCode: string;
    status: string;
    mode: SessionMode;
  };
  participantId: string;
  creatorToken: string | null;
  meals: Array<{
    id: string;
    title: string;
    description: string | null;
    type: MealType;
    sessionMealId: string;
  }>;
}

export const quickSessionApi = {
  create: (
    creatorName: string,
    meals: Array<{ title: string; description?: string }>,
    mode: SessionMode = 'home'
  ) =>
    request<QuickSessionResponse>('/quick-session', {
      method: 'POST',
      body: JSON.stringify({ creatorName, meals, mode }),
    }),
};
