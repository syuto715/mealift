import { create } from 'zustand';

interface UIState {
  isBottomSheetOpen: boolean;
  bottomSheetContent: string | null;
  toastMessage: string | null;
  toastType: 'success' | 'error' | 'info' | null;
  openBottomSheet: (content: string) => void;
  closeBottomSheet: () => void;
  showToast: (message: string, type: 'success' | 'error' | 'info') => void;
  hideToast: () => void;
}

export const useUIStore = create<UIState>((set) => ({
  isBottomSheetOpen: false,
  bottomSheetContent: null,
  toastMessage: null,
  toastType: null,
  openBottomSheet: (content) => set({ isBottomSheetOpen: true, bottomSheetContent: content }),
  closeBottomSheet: () => set({ isBottomSheetOpen: false, bottomSheetContent: null }),
  showToast: (message, type) => set({ toastMessage: message, toastType: type }),
  hideToast: () => set({ toastMessage: null, toastType: null }),
}));
