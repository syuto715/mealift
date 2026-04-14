import { create } from 'zustand';
import { GoalType, ActivityLevel, Gender, Equipment } from '../types/common';

interface OnboardingState {
  // Step 1: goal
  goalType: GoalType;
  // Step 2: body
  gender: Gender;
  birthYear: number;
  heightCm: number;
  currentWeightKg: number;
  targetWeightKg: number | null;
  targetBodyFatPct: number | null;
  // Step 3: training
  activityLevel: ActivityLevel;
  trainingDaysPerWeek: number;
  equipment: Equipment;
  targetDate: string | null;
  // Actions
  setGoal: (goalType: GoalType) => void;
  setBody: (data: {
    gender: Gender;
    birthYear: number;
    heightCm: number;
    currentWeightKg: number;
    targetWeightKg: number | null;
    targetBodyFatPct: number | null;
  }) => void;
  setTraining: (data: {
    activityLevel: ActivityLevel;
    trainingDaysPerWeek: number;
    equipment: Equipment;
    targetDate: string | null;
  }) => void;
  reset: () => void;
}

const INITIAL_STATE = {
  goalType: 'cut' as GoalType,
  gender: 'male' as Gender,
  birthYear: 1995,
  heightCm: 170,
  currentWeightKg: 70,
  targetWeightKg: null as number | null,
  targetBodyFatPct: null as number | null,
  activityLevel: 'moderate' as ActivityLevel,
  trainingDaysPerWeek: 3,
  equipment: 'gym' as Equipment,
  targetDate: null as string | null,
};

export const useOnboardingStore = create<OnboardingState>((set) => ({
  ...INITIAL_STATE,
  setGoal: (goalType) => set({ goalType }),
  setBody: (data) => set(data),
  setTraining: (data) => set(data),
  reset: () => set(INITIAL_STATE),
}));
