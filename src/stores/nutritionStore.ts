import { create } from 'zustand';
import { DailyNutritionSummary } from '../types/nutrition';

interface NutritionState {
  todaySummary: DailyNutritionSummary | null;
  setTodaySummary: (summary: DailyNutritionSummary) => void;
  clearTodaySummary: () => void;
}

export const useNutritionStore = create<NutritionState>((set) => ({
  todaySummary: null,
  setTodaySummary: (summary) => set({ todaySummary: summary }),
  clearTodaySummary: () => set({ todaySummary: null }),
}));
