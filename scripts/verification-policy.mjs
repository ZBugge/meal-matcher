export const VERIFICATION_BUDGET_MS = 300_000;
export const VERIFICATION_GOAL_MS = 120_000;

export function verificationTiming(durationMs) {
  return {
    durationMs,
    budgetMs: VERIFICATION_BUDGET_MS,
    performanceGoalMs: VERIFICATION_GOAL_MS,
    performanceGoalMet: Number.isFinite(durationMs) && durationMs >= 0 && durationMs < VERIFICATION_GOAL_MS,
  };
}
