import React from 'react';
import { View, Text, StyleSheet, Modal, TouchableOpacity, useColorScheme } from 'react-native';
import { getColors, radius, shadow } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function BottomSheet({ visible, onClose, title, children }: BottomSheetProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={styles.overlay} activeOpacity={1} onPress={onClose}>
        <View />
      </TouchableOpacity>
      <View style={[styles.sheet, { backgroundColor: colors.surface }, shadow.lg]}>
        <View style={[styles.handle, { backgroundColor: colors.border }]} />
        {title && (
          <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
        )}
        {children}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xxxxl,
    paddingTop: spacing.md,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: spacing.lg,
  },
  title: {
    ...typography.titleMedium,
    marginBottom: spacing.lg,
  },
});
