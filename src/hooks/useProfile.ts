import { useProfileStore } from '../stores/profileStore';

export function useProfile() {
  const { profile, setProfile, clearProfile, updateProfile } = useProfileStore();

  return {
    profile,
    setProfile,
    clearProfile,
    updateProfile,
    isOnboarded: profile?.onboardingCompleted ?? false,
  };
}
