export const TABLES = {
  PROFILES: 'profiles',
  BODY_LOGS: 'body_logs',
  EXERCISES: 'exercises',
  WORKOUT_ROUTINES: 'workout_routines',
  WORKOUT_ROUTINE_ITEMS: 'workout_routine_items',
  WORKOUT_SESSIONS: 'workout_sessions',
  WORKOUT_SETS: 'workout_sets',
  FOODS: 'foods',
  MEAL_LOGS: 'meal_logs',
  MEAL_LOG_ITEMS: 'meal_log_items',
  NOTES: 'notes',
  MEAL_TEMPLATES: 'meal_templates',
  SYNC_QUEUE: 'sync_queue',
} as const;

export type TableName = (typeof TABLES)[keyof typeof TABLES];
