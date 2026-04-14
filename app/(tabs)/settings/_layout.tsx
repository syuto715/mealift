import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { getColors } from '../../../src/theme/tokens';

export default function SettingsLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        headerBackTitle: '戻る',
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
