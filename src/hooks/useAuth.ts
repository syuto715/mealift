import { useAuthStore } from '../stores/authStore';

export function useAuth() {
  const store = useAuthStore();

  return {
    isAuthenticated: store.isAuthenticated,
    isLocalOnly: store.isLocalOnly,
    user: store.user,
    isLoading: store.isLoading,
    login: store.login,
    register: store.register,
    logout: store.logout,
    startLocalMode: store.startLocalMode,
    setAuthenticated: store.setAuthenticated,
    setUnauthenticated: store.setUnauthenticated,
    setLoading: store.setLoading,
  };
}
