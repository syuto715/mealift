import React from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';

// Audit E-07 / Sprint P2-B — a "完了" toolbar above the keyboard for
// numeric keypads (numeric / decimal-pad / number-pad), which have no
// return key to dismiss the keyboard on iOS. Attach by setting a
// TextInput's `inputAccessoryViewID` to the same `nativeID` and rendering
// this component alongside it (see NumberInput / DecimalInput for the
// per-instance wiring). iOS-only: InputAccessoryView is a no-op on
// Android, whose numeric keypads already expose a system dismiss.

interface Props {
  nativeID: string;
}

export function KeyboardDoneAccessory({ nativeID }: Props): React.ReactElement | null {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  if (Platform.OS !== 'ios') return null;

  return (
    <InputAccessoryView nativeID={nativeID}>
      <View
        style={[
          styles.bar,
          { backgroundColor: colors.surfaceSecondary, borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          onPress={() => Keyboard.dismiss()}
          style={styles.doneBtn}
          hitSlop={{ top: 12, bottom: 12, left: 16, right: 16 }}
          accessibilityRole="button"
          accessibilityLabel="キーボードを閉じる"
        >
          <Text style={[styles.done, { color: colors.primary }]}>完了</Text>
        </TouchableOpacity>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    // Vertical size comes from the 44pt doneBtn; keep the bar padding
    // minimal so the toolbar stays a compact ~48pt.
    paddingVertical: 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  doneBtn: {
    // Reach the 44pt iOS minimum tap target (text ~22 + padding).
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: spacing.xs,
  },
  done: {
    ...typography.labelLarge,
    fontWeight: '600',
  },
});
