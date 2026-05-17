import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { signIn, signUp, signOut, signInWithApple } from '../infra/supabase/auth';
import { generateId } from '../utils/id';
import { getDatabase } from '../infra/database/connection';
import { claimLocalDataForUser } from '../infra/database/dataReconciliation';

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
  loginWithApple: (
    identityToken: string,
    rawNonce: string,
  ) => Promise<{ error?: string }>;
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

      loginWithApple: async (identityToken: string, rawNonce: string) => {
        try {
          const { data, error } = await signInWithApple(
            identityToken,
            rawNonce,
          );
          if (error) {
            const message =
              error.message?.includes('network') ||
              error.message?.includes('fetch')
                ? 'ネットワークエラーが発生しました。接続を確認してください。'
                : error.message ?? 'Apple Sign In に失敗しました';
            return { error: message };
          }
          if (!data.session?.user) {
            return { error: 'Apple Sign In に失敗しました' };
          }
          const userId = data.session.user.id;

          // Reconcile local data with the new auth identity. Three of the
          // four ClaimResult kinds (remapped / already_claimed_same_uid /
          // no_profile) all proceed to authenticated state; the fourth
          // (conflict_different_uid) aborts with a sign-out so the user's
          // session doesn't stick when their device data belongs to a
          // different auth account.
          try {
            const db = await getDatabase();
            const claimResult = await claimLocalDataForUser(db, userId);
            if (claimResult.kind === 'conflict_different_uid') {
              await signOut();
              return {
                error:
                  'このデバイスには別のアカウントのデータが残っています。一度ログアウトしてからやり直してください。',
              };
            }
          } catch (e) {
            // Reconciliation transaction failed — sign out so the
            // partially-authenticated state doesn't masquerade as success.
            await signOut();
            return {
              error:
                e instanceof Error
                  ? `データ整合中にエラーが発生しました: ${e.message}`
                  : 'データ整合中にエラーが発生しました',
            };
          }

          set({
            isAuthenticated: true,
            isLocalOnly: false,
            user: {
              id: userId,
              email: data.session.user.email,
            },
            isLoading: false,
          });
          return {};
        } catch (e) {
          const err = e instanceof Error ? e.message : '';
          if (err.includes('network') || err.includes('fetch')) {
            return {
              error:
                'ネットワークエラーが発生しました。接続を確認してください。',
            };
          }
          return { error: 'Apple Sign In に失敗しました' };
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
        // v1.5 Stage 1 Phase 1.4 — clear in-memory caches that
        // hold per-user content (Codex round 1 Critical: a stale
        // coach-advice row from User A must not survive into User
        // B's session on same-process account switch). Lazy
        // import so the auth boot path (which hydrates BEFORE the
        // chat/advice stores) doesn't load these modules
        // prematurely.
        try {
          const { useCoachAdviceStore } = await import(
            './coachAdviceStore'
          );
          useCoachAdviceStore.getState().reset();
        } catch {
          // No-op: the store hasn't been loaded yet in this
          // session (e.g. logout from the welcome screen before
          // visiting a coach surface).
        }
        // Phase 1.5 — routineGenStore drafts can leak to User B
        // across an account switch in the same process (Drafting
        // 106). Same lazy-import pattern.
        try {
          const { useRoutineGenStore } = await import('./routineGenStore');
          useRoutineGenStore.getState().reset();
        } catch {
          // No-op.
        }
        // Phase 1.3 — diagnosticStore wizard answers (3rd store
        // with the Drafting 106 logout-reset pattern). Wizard
        // state is in-memory only (no SQLite mirror), so the
        // reset() call is the lone safeguard against cross-account
        // leak on same-process account switch.
        try {
          const { useDiagnosticStore } = await import('./diagnosticStore');
          useDiagnosticStore.getState().reset();
        } catch {
          // No-op.
        }
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
