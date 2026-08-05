// Shared domain types
export type SessionMode = 'home' | 'takeout';
export type MealType = 'meal' | 'category' | 'restaurant';

// Database entity types
export interface Host {
  id: string;
  email: string;
  password_hash: string;
  takeout_onboarding_dismissed: number;
  created_at: string;
}

export interface Meal {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  type: MealType;
  archived: number; // SQLite boolean (0 or 1)
  pick_count: number;
  temporary: number; // SQLite boolean (0 or 1)
  creator_token: string | null;
  created_at: string;
}

export interface Session {
  id: string;
  host_id: string;
  invite_code: string;
  status: 'open' | 'closed';
  mode: SessionMode;
  selected_meal_id: string | null;
  created_at: string;
  closed_at: string | null;
}

export interface SessionMeal {
  id: string;
  session_id: string;
  meal_id: string;
  display_order: number;
}

export interface Participant {
  id: string;
  session_id: string;
  display_name: string;
  host_id: string | null;
  submitted: number; // SQLite boolean (0 or 1)
  created_at: string;
}

export interface Swipe {
  id: string;
  participant_id: string;
  session_meal_id: string;
  vote: number; // 0 = no, 1 = yes, 2 = maybe
  created_at: string;
}

export interface SessionHistory {
  id: string;
  session_id: string;
  selected_meal_id: string;
  selected_at: string;
}

// API response types
export interface MatchResult {
  mealId: string;
  title: string;
  description: string | null;
  yesCount: number;
  maybeCount: number;
  totalVotes: number;
  percentage: number;
  isUnanimous: boolean;
  voters?: { name: string; vote: number }[];
}

export interface SessionWithDetails extends Session {
  meals: Meal[];
  participantCount: number;
  submittedCount: number;
}

// API request types
export interface CreateMealRequest {
  title: string;
  description?: string;
  type?: MealType;
}

export interface CreateSessionRequest {
  mealIds: string[];
  mode?: SessionMode;
}

export interface JoinSessionRequest {
  displayName: string;
}

export interface SubmitSwipesRequest {
  participantId: string;
  swipes: { mealId: string; vote: number }[];
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface UpdateHostPreferencesRequest {
  takeoutOnboardingDismissed: boolean;
}

export interface QuickSessionRequest {
  creatorName: string;
  meals: { title: string; description?: string }[];
  mode?: SessionMode;
}
