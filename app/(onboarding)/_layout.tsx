import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { getColors } from '../../src/theme/tokens';

export default function OnboardingLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
        animation: 'slide_from_right',
      }}
    />
  );
}
