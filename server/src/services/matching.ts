import { getAll } from '../db/schema';
import { MatchResult } from '../types';

interface SwipeData {
  session_meal_id: string;
  meal_id: string;
  meal_title: string;
  meal_description: string | null;
  participant_name: string;
  vote: number;
}

interface MealAggregation {
  mealId: string;
  title: string;
  description: string | null;
  votes: { name: string; vote: boolean }[];
}

export function calculateResults(sessionId: string, includeVoters: boolean = false): MatchResult[] {
  // Get all swipes for this session with meal and participant info
  const swipes = getAll<SwipeData>(
    `SELECT
      sm.id as session_meal_id,
      m.id as meal_id,
      m.title as meal_title,
      m.description as meal_description,
      p.display_name as participant_name,
      s.vote
    FROM swipes s
    JOIN participants p ON s.participant_id = p.id
    JOIN session_meals sm ON s.session_meal_id = sm.id
    JOIN meals m ON sm.meal_id = m.id
    WHERE sm.session_id = ? AND p.submitted = 1
    ORDER BY m.title`,
    [sessionId]
  );

  // Aggregate votes by meal
  const mealMap = new Map<string, MealAggregation>();

  for (const swipe of swipes) {
    if (!mealMap.has(swipe.meal_id)) {
      mealMap.set(swipe.meal_id, {
        mealId: swipe.meal_id,
        title: swipe.meal_title,
        description: swipe.meal_description,
        votes: [],
      });
    }

    mealMap.get(swipe.meal_id)!.votes.push({
      name: swipe.participant_name,
      vote: swipe.vote === 1,
    });
  }

  // Calculate results
  const results: MatchResult[] = [];

  for (const meal of mealMap.values()) {
    const yesCount = meal.votes.filter(v => v.vote).length;
    const totalVotes = meal.votes.length;
    const percentage = totalVotes > 0 ? Math.round((yesCount / totalVotes) * 100) : 0;

    const result: MatchResult = {
      mealId: meal.mealId,
      title: meal.title,
      description: meal.description,
      yesCount,
      totalVotes,
      percentage,
      isUnanimous: totalVotes > 0 && yesCount === totalVotes,
    };

    if (includeVoters) {
      result.voters = meal.votes;
    }

    results.push(result);
  }

  // Sort by percentage descending, then by title for ties
  results.sort((a, b) => {
    if (b.percentage !== a.percentage) {
      return b.percentage - a.percentage;
    }
    return a.title.localeCompare(b.title);
  });

  return results;
}

// Generate invite code - 6 alphanumeric characters
export function generateInviteCode(): string {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () =>
    chars[Math.floor(Math.random() * chars.length)]
  ).join('');
}
