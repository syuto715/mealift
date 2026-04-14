export interface WeeklyReportData {
  weekStart: string; // ISO date, Monday
  weekEnd: string; // ISO date, Sunday

  // Weight
  weightStart: number | null;
  weightEnd: number | null;
  weightChange: number | null;

  // Nutrition averages (per day)
  avgCalories: number;
  avgProtein: number;
  avgFat: number;
  avgCarb: number;
  mealLogDays: number; // how many days had at least 1 meal logged

  // Training
  workoutCount: number;
  totalVolume: number; // kg * reps
  totalCaloriesBurned: number;

  // Scores (0-100)
  consistencyScore: number; // based on logging streak
  nutritionScore: number; // how close to target macros
  trainingScore: number; // based on workout frequency

  overallScore: number; // weighted average
}
