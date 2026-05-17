import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { getColors } from '../../../../src/theme/tokens';

// v1.5 Stage 1 Phase 1.3 — diagnostic wizard stack.
// Headerless, matches the existing coach/_layout convention.
export default function DiagnosticLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <Stack
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
