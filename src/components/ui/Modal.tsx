import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Modal as RNModal,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { getColors, radius, shadow } from '../../theme/tokens';
import { spacing } from '../../theme/spacing';
import { typography } from '../../theme/typography';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
}

export function Modal({ visible, onClose, title, children }: ModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.wrapper}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable style={styles.overlay} onPress={onClose} />
        <View style={styles.centered} pointerEvents="box-none">
          <Pressable
            style={[styles.content, { backgroundColor: colors.surface }, shadow.lg]}
            onPress={() => {}}
          >
            {title && (
              <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
            )}
            {children}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xxl,
  },
  content: {
    width: '100%',
    borderRadius: radius.xl,
    padding: spacing.xxl,
  },
  title: {
    ...typography.titleMedium,
    marginBottom: spacing.lg,
  },
});
