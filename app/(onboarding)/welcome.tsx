import { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { router } from 'expo-router';

// Onboarding v2: redirect welcome → welcome-and-goal (combined screen).
// Existing onboarded users skip this flow; new users land here fresh.
export default function WelcomeScreen() {
  useEffect(() => {
    router.replace('/(onboarding)/welcome-and-goal');
  }, []);
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator />
    </View>
  );
}
