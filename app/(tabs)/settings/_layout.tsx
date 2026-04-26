import { Stack } from 'expo-router';
import { useColorScheme } from 'react-native';
import { getColors } from '../../../src/theme/tokens';

export default function SettingsLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <Stack
      // Anchor the stack so deep pushes (e.g. router.push(
      // '/(tabs)/settings/subscription') from outside this tab) land on top
      // of settings/index instead of replacing it. Without this, back from a
      // deep screen pops out of the tab and a tab-press cannot pop-to-top.
      initialRouteName="index"
      screenOptions={{
        headerShown: false,
        headerBackTitle: '戻る',
        contentStyle: { backgroundColor: colors.background },
      }}
    />
  );
}
