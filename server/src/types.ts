// Database entity types
export interface Host {
  id: string;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface Meal {
  id: string;
  host_id: string;
  title: string;
  description: string | null;
  type: 'meal' | 'restaurant';
  archived: number; // SQLite boolean (0 or 1)
  pick_count: number;
  created_at: string;
}

export interface Session {
  id: string;
  host_id: string;
  invite_code: string;
  status: 'open' | 'closed';
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
  vote: number; // 1 = yes, 0 = no
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
  totalVotes: number;
  percentage: number;
  isUnanimous: boolean;
  voters?: { name: string; vote: boolean }[];
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
}

export interface CreateSessionRequest {
  mealIds: string[];
}

export interface JoinSessionRequest {
  displayName: string;
}

export interface SubmitSwipesRequest {
  participantId: string;
  swipes: { mealId: string; vote: boolean }[];
}

export interface RegisterRequest {
  email: string;
  password: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}
