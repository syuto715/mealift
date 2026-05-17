import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { getColors } from '../../../src/theme/tokens';

// v1.5 Stage 1 Phase 1.2 — coach tab stack.
// Mirrors settings/_layout.tsx for headerless full-bleed screens
// + initialRouteName so deep router.push lands on top of the
// conversation list rather than replacing it.
export default function CoachLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <Stack
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        headerBackTitle: '戻る',
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
