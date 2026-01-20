import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { calculateResults } from './matching';
import { initializeDatabase } from '../db/schema';
import { runQuery } from '../db/schema';

describe('Matching Service - Maybe Vote Support', () => {
  beforeAll(async () => {
    // Initialize in-memory database
    await initializeDatabase();

    // Create test data - use INSERT OR IGNORE to avoid conflicts
    runQuery(`INSERT OR IGNORE INTO hosts (id, email, password_hash) VALUES ('host1', 'test@test.com', 'hash')`, []);
    runQuery(`INSERT OR IGNORE INTO sessions (id, host_id, invite_code, status) VALUES ('session1', 'host1', 'ABC123', 'open')`, []);
    runQuery(`INSERT OR IGNORE INTO meals (id, host_id, title, description) VALUES ('meal1', 'host1', 'Pizza', 'Pepperoni'), ('meal2', 'host1', 'Sushi', 'California Roll'), ('meal3', 'host1', 'Tacos', 'Fish Tacos')`, []);
    runQuery(`INSERT OR IGNORE INTO session_meals (id, session_id, meal_id, display_order) VALUES ('sm1', 'session1', 'meal1', 1), ('sm2', 'session1', 'meal2', 2), ('sm3', 'session1', 'meal3', 3)`, []);
    runQuery(`INSERT OR IGNORE INTO participants (id, session_id, display_name, submitted) VALUES ('p1', 'session1', 'Alice', 1), ('p2', 'session1', 'Bob', 1), ('p3', 'session1', 'Charlie', 1)`, []);
  });

  afterAll(() => {
    // Cleanup is handled by in-memory database
  });

  it('should count yes votes (1) correctly', () => {
    // All yes votes for meal1
    runQuery(`INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES ('s1', 'p1', 'sm1', 1), ('s2', 'p2', 'sm1', 1), ('s3', 'p3', 'sm1', 1)`, []);

    const results = calculateResults('session1', false);
    const meal1Result = results.find(r => r.mealId === 'meal1');

    expect(meal1Result).toBeDefined();
    expect(meal1Result?.yesCount).toBe(3);
    expect(meal1Result?.maybeCount).toBe(0);
    expect(meal1Result?.percentage).toBe(100);
    expect(meal1Result?.isUnanimous).toBe(true);

    // Cleanup
    runQuery(`DELETE FROM swipes WHERE id IN ('s1', 's2', 's3')`, []);
  });

  it('should count maybe votes (2) correctly', () => {
    // All maybe votes for meal1
    runQuery(`INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES ('s1', 'p1', 'sm1', 2), ('s2', 'p2', 'sm1', 2), ('s3', 'p3', 'sm1', 2)`, []);

    const results = calculateResults('session1', false);
    const meal1Result = results.find(r => r.mealId === 'meal1');

    expect(meal1Result).toBeDefined();
    expect(meal1Result?.yesCount).toBe(0);
    expect(meal1Result?.maybeCount).toBe(3);
    expect(meal1Result?.percentage).toBe(100);
    expect(meal1Result?.isUnanimous).toBe(false);

    // Cleanup
    runQuery(`DELETE FROM swipes WHERE id IN ('s1', 's2', 's3')`, []);
  });

  it('should count no votes (0) correctly', () => {
    // All no votes for meal1
    runQuery(`INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES ('s1', 'p1', 'sm1', 0), ('s2', 'p2', 'sm1', 0), ('s3', 'p3', 'sm1', 0)`, []);

    const results = calculateResults('session1', false);
    const meal1Result = results.find(r => r.mealId === 'meal1');

    expect(meal1Result).toBeDefined();
    expect(meal1Result?.yesCount).toBe(0);
    expect(meal1Result?.maybeCount).toBe(0);
    expect(meal1Result?.percentage).toBe(0);

    // Cleanup
    runQuery(`DELETE FROM swipes WHERE id IN ('s1', 's2', 's3')`, []);
  });

  it('should calculate percentage as (yes + maybe) / total', () => {
    // 2 yes, 1 maybe for meal1
    runQuery(`INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES ('s1', 'p1', 'sm1', 1), ('s2', 'p2', 'sm1', 1), ('s3', 'p3', 'sm1', 2)`, []);

    const results = calculateResults('session1', false);
    const meal1Result = results.find(r => r.mealId === 'meal1');

    expect(meal1Result).toBeDefined();
    expect(meal1Result?.yesCount).toBe(2);
    expect(meal1Result?.maybeCount).toBe(1);
    expect(meal1Result?.totalVotes).toBe(3);
    expect(meal1Result?.percentage).toBe(100); // (2+1)/3 = 100%
    expect(meal1Result?.isUnanimous).toBe(false);

    // Cleanup
    runQuery(`DELETE FROM swipes WHERE id IN ('s1', 's2', 's3')`, []);
  });

  it('should implement tiebreaker: fewer maybes rank higher', () => {
    // meal1: 2 yes, 1 maybe = 100%
    // meal2: 3 yes = 100%
    // meal3: 1 yes, 2 maybe = 100%
    runQuery(`INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES
      ('s1', 'p1', 'sm1', 1), ('s2', 'p2', 'sm1', 1), ('s3', 'p3', 'sm1', 2),
      ('s4', 'p1', 'sm2', 1), ('s5', 'p2', 'sm2', 1), ('s6', 'p3', 'sm2', 1),
      ('s7', 'p1', 'sm3', 1), ('s8', 'p2', 'sm3', 2), ('s9', 'p3', 'sm3', 2)`, []);

    const results = calculateResults('session1', false);

    expect(results).toHaveLength(3);

    // All have 100% but should be ordered by maybeCount (ascending)
    // meal2 (0 maybes) should be first
    // meal1 (1 maybe) should be second
    // meal3 (2 maybes) should be third
    expect(results[0].mealId).toBe('meal2');
    expect(results[0].maybeCount).toBe(0);
    expect(results[1].mealId).toBe('meal1');
    expect(results[1].maybeCount).toBe(1);
    expect(results[2].mealId).toBe('meal3');
    expect(results[2].maybeCount).toBe(2);

    // Cleanup
    runQuery(`DELETE FROM swipes WHERE id IN ('s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9')`, []);
  });

  it('should include voter breakdown with vote values when requested', () => {
    // Mixed votes for meal1
    runQuery(`INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES ('s1', 'p1', 'sm1', 1), ('s2', 'p2', 'sm1', 2), ('s3', 'p3', 'sm1', 0)`, []);

    const results = calculateResults('session1', true);
    const meal1Result = results.find(r => r.mealId === 'meal1');

    expect(meal1Result?.voters).toBeDefined();
    expect(meal1Result?.voters).toHaveLength(3);

    const aliceVote = meal1Result?.voters?.find(v => v.name === 'Alice');
    const bobVote = meal1Result?.voters?.find(v => v.name === 'Bob');
    const charlieVote = meal1Result?.voters?.find(v => v.name === 'Charlie');

    expect(aliceVote?.vote).toBe(1);
    expect(bobVote?.vote).toBe(2);
    expect(charlieVote?.vote).toBe(0);

    // Cleanup
    runQuery(`DELETE FROM swipes WHERE id IN ('s1', 's2', 's3')`, []);
  });

  it('should handle mixed votes correctly', () => {
    // 1 yes, 1 maybe, 1 no for meal1
    runQuery(`INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES ('s1', 'p1', 'sm1', 1), ('s2', 'p2', 'sm1', 2), ('s3', 'p3', 'sm1', 0)`, []);

    const results = calculateResults('session1', false);
    const meal1Result = results.find(r => r.mealId === 'meal1');

    expect(meal1Result?.yesCount).toBe(1);
    expect(meal1Result?.maybeCount).toBe(1);
    expect(meal1Result?.totalVotes).toBe(3);
    expect(meal1Result?.percentage).toBe(67); // (1+1)/3 = 66.67 -> 67

    // Cleanup
    runQuery(`DELETE FROM swipes WHERE id IN ('s1', 's2', 's3')`, []);
  });

  it('should sort by percentage first, then maybeCount, then title', () => {
    // meal1: 67% (1 yes, 1 maybe, 1 no)
    // meal2: 67% (2 yes, 0 maybe, 1 no)
    // meal3: 100% (2 yes, 1 maybe)
    runQuery(`INSERT INTO swipes (id, participant_id, session_meal_id, vote) VALUES
      ('s1', 'p1', 'sm1', 1), ('s2', 'p2', 'sm1', 2), ('s3', 'p3', 'sm1', 0),
      ('s4', 'p1', 'sm2', 1), ('s5', 'p2', 'sm2', 1), ('s6', 'p3', 'sm2', 0),
      ('s7', 'p1', 'sm3', 1), ('s8', 'p2', 'sm3', 1), ('s9', 'p3', 'sm3', 2)`, []);

    const results = calculateResults('session1', false);

    expect(results).toHaveLength(3);

    // meal3 (100%) should be first
    expect(results[0].mealId).toBe('meal3');
    expect(results[0].percentage).toBe(100);

    // meal2 (67%, 0 maybes) should be second
    expect(results[1].mealId).toBe('meal2');
    expect(results[1].percentage).toBe(67);
    expect(results[1].maybeCount).toBe(0);

    // meal1 (67%, 1 maybe) should be third
    expect(results[2].mealId).toBe('meal1');
    expect(results[2].percentage).toBe(67);
    expect(results[2].maybeCount).toBe(1);

    // Cleanup
    runQuery(`DELETE FROM swipes WHERE id IN ('s1', 's2', 's3', 's4', 's5', 's6', 's7', 's8', 's9')`, []);
  });
});
