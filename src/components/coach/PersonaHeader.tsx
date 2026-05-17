import React from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

// v1.5 Stage 1 Phase 1.2 — persona header.
//
// Renders 「ミー先生」 (large) above 「AI コーチ」 (small sub-label).
// Used across the four AI Coach surfaces (chat / advice /
// diagnostic / generation) so the persona identity stays
// consistent — Decision 7 + §7.3 in the epic doc.

export function PersonaHeader({
  testID,
}: {
  testID?: string;
}): React.ReactElement {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <View
      style={styles.container}
      accessibilityRole="header"
      accessibilityLabel="ミー先生 AI コーチ"
      testID={testID}
    >
      <Text style={[styles.persona, { color: colors.textPrimary }]}>
        ミー先生
      </Text>
      <Text style={[styles.subLabel, { color: colors.textSecondary }]}>
        AI コーチ
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'column',
    alignItems: 'flex-start',
    paddingVertical: spacing.xs,
  },
  persona: {
    ...typography.titleLarge,
    fontWeight: '700',
  },
  subLabel: {
    ...typography.labelSmall,
    marginTop: 2,
  },
});
