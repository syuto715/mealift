import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signIn, signUp, signOut } from '../infra/supabase/auth';
import { generateId } from '../utils/id';

interface AuthUser {
  id: string;
  email?: string;
}

interface AuthState {
  isAuthenticated: boolean;
  isLocalOnly: boolean;
  user: AuthUser | null;
  isLoading: boolean;
  setAuthenticated: (userId: string, email?: string) => void;
  setLocalOnly: () => void;
  setUnauthenticated: () => void;
  setLoading: (loading: boolean) => void;
  login: (email: string, password: string) => Promise<{ error?: string }>;
  register: (email: string, password: string) => Promise<{ error?: string }>;
  logout: () => Promise<void>;
  startLocalMode: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      isAuthenticated: false,
      isLocalOnly: false,
      user: null,
      isLoading: true,

      setAuthenticated: (userId: string, email?: string) =>
        set({
          isAuthenticated: true,
          isLocalOnly: false,
          user: { id: userId, email },
          isLoading: false,
        }),

      setLocalOnly: () =>
        set({
          isAuthenticated: true,
          isLocalOnly: true,
          user: { id: 'local' },
          isLoading: false,
        }),

      setUnauthenticated: () =>
        set({
          isAuthenticated: false,
          isLocalOnly: false,
          user: null,
          isLoading: false,
        }),

      setLoading: (loading: boolean) => set({ isLoading: loading }),

      login: async (email: string, password: string) => {
        try {
          const { data, error } = await signIn(email, password);
          if (error) {
            const message =
              error.message === 'Invalid login credentials'
                ? 'メールアドレスまたはパスワードが正しくありません'
                : error.message?.includes('network') ||
                    error.message?.includes('fetch')
                  ? 'ネットワークエラーが発生しました。接続を確認してください。'
                  : error.message ?? 'ログインに失敗しました';
            return { error: message };
          }
          if (data.session?.user) {
            set({
              isAuthenticated: true,
              isLocalOnly: false,
              user: {
                id: data.session.user.id,
                email: data.session.user.email,
              },
              isLoading: false,
            });
          }
          return {};
        } catch (e) {
          const err = e instanceof Error ? e.message : '';
          if (err.includes('network') || err.includes('fetch')) {
            return {
              error:
                'ネットワークエラーが発生しました。接続を確認してください。',
            };
          }
          return { error: 'ログインに失敗しました' };
        }
      },

      register: async (email: string, password: string) => {
        try {
          const { data, error } = await signUp(email, password);
          if (error) {
            const message =
              error.message?.includes('already registered') ||
              error.message?.includes('already been registered')
                ? 'このメールアドレスは既に登録されています'
                : error.message ?? '登録に失敗しました';
            return { error: message };
          }
          if (data.session?.user) {
            set({
              isAuthenticated: true,
              isLocalOnly: false,
              user: {
                id: data.session.user.id,
                email: data.session.user.email,
              },
              isLoading: false,
            });
            return {};
          }
          // Email confirmation required
          return {
            error:
              '確認メールを送信しました。メールを確認してからログインしてください。',
          };
        } catch (e) {
          const err = e instanceof Error ? e.message : '';
          if (err.includes('network') || err.includes('fetch')) {
            return {
              error:
                'ネットワークエラーが発生しました。接続を確認してください。',
            };
          }
          return { error: '登録に失敗しました' };
        }
      },

      logout: async () => {
        try {
          await signOut();
        } catch {
          // Ignore sign out errors
        }
        set({
          isAuthenticated: false,
          isLocalOnly: false,
          user: null,
          isLoading: false,
        });
      },

      startLocalMode: () => {
        const id = generateId();
        set({
          isAuthenticated: true,
          isLocalOnly: true,
          user: { id },
          isLoading: false,
        });
      },
    }),
    {
      name: 'mealift-auth',
      storage: createJSONStorage(() => AsyncStorage),
      partialize: (state) => ({
        isAuthenticated: state.isAuthenticated,
        isLocalOnly: state.isLocalOnly,
        user: state.user,
      }),
      onRehydrateStorage: () => {
        return (state, error) => {
          if (error) {
            // If hydration fails (e.g. AsyncStorage broken on Android),
            // force isLoading to false so the app can proceed to login
            state?.setLoading(false);
          }
        };
      },
    },
  ),
);
