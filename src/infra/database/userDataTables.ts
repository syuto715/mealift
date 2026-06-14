// v1.6.0 Sprint 6 — single source of truth for the local-table classification
// used by wipeUserData / resetAllData (account deletion + local reset). Kept in
// a dependency-free module so it can be imported by both connection.ts and the
// drift test without pulling expo-sqlite / migration modules.

// USER (PII) tables — wiped on account deletion AND local reset. Ordered
// children-before-parents for FK-safe deletion.
export const USER_DATA_TABLES: readonly string[] = [
  // meal / nutrition
  'meal_log_items',
  'meal_logs',
  'meal_templates',
  'dish_ingredients',
  'dishes',
  // workout
  'workout_sets',
  'workout_sessions',
  'workout_routine_items',
  'workout_routines',
  'personal_records',
  'estimated_1rm',
  'deload_recommendations',
  'user_equipment',
  // body / progress
  'body_logs',
  'water_logs',
  'weekly_reports',
  'progress_photos',
  'notes',
  'adaptive_goal_suggestions',
  // coach / chat
  'chat_messages_local',
  'chat_conversations_local',
  'coach_advice_local',
  'routine_generations_local',
  // misc user state
  'user_badges',
  'user_consents',
  'user_submitted_foods',
  'search_favorites',
  // sync bookkeeping
  'sync_queue',
  'sync_dead_letter',
  'sync_watermarks',
  // parent last
  'profiles',
];

// REFERENCE tables — seeded shared data, NO PII. Preserved across wipe (the
// app re-uses them; foods/exercises are large seed sets). search_index also
// creates FTS5 shadow tables that must NOT be DELETE-d directly.
export const REFERENCE_TABLES: readonly string[] = [
  'foods',
  'exercises',
  'barcode_foods',
  'food_aliases',
  'search_index',
  'restaurants_local',
  'restaurant_aliases_local',
  'restaurant_chain_categories_local',
  'restaurant_menu_items_local',
  'restaurant_menu_item_aliases_local',
];
