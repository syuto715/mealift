import { Redirect } from 'expo-router';

// S2-B — 中央「＋」記録 FAB のダミー route。
// (tabs) 配下のファイルは自動でタブ化されるため、FAB 用のタブ枠として存在させる。
// タブバー側は custom tabBarButton (app/(tabs)/_layout.tsx) が /add-food への
// push に差し替えるので、この画面へは通常遷移しない。deep link 等で万一
// 直接開かれた場合はホームへ逃がす。
export default function RecordTab() {
  return <Redirect href="/(tabs)" />;
}
