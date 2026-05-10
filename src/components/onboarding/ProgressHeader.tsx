import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { AbandonDialog } from './AbandonDialog';
import { shouldShowAbandonDialog } from '../../domain/onboardingNavGuard';

// v1.3.0 / Onboarding v2 / Phase A-6 — common header injected by
// app/(onboarding)/_layout.tsx into all 13/14/15 screens.
//
// Three responsibilities:
//   1. Back button — hidden when route descriptor says showBack=false
//      (welcome / complete don't expose a back path).
//   2. Progress dots — Phase A-6 visual choice per kickoff §2,
//      revisitable in Phase E QA. Dot count == totalSteps.
//   3. Step label — "{currentStep} / {totalSteps}" right-aligned.
//
// Abandon-confirm gating (kickoff §A-6 §3): if the user has progressed
// past the 50% mark, tapping back opens AbandonDialog instead of
// firing onBack directly. Below 50% the back behavior is immediate
// (early-flow exits are cheap to redo).
//
// Patterns applied:
//   #11 color + non-color redundant encoding — dots are tinted but
//       the "{n} / {total}" label carries the count textually.
//   #12 conditional accessibilityRole — back button only carries
//       button role when showBack is true; absent otherwise.

// Pure dialog-gating helper lives in src/domain/onboardingNavGuard.ts
// so jest tests can import it without dragging react-native through
// the CJS runtime (Build 15+ TODO 12 — missing jest-expo preset).

interface ProgressHeaderProps {
  currentStep: number;
  totalSteps: number;
  onBack: () => void;
  showBack?: boolean;
}

export function ProgressHeader({
  currentStep,
  totalSteps,
  onBack,
  showBack = true,
}: ProgressHeaderProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [abandonVisible, setAbandonVisible] = useState(false);

  const handleBack = () => {
    if (shouldShowAbandonDialog(currentStep, totalSteps)) {
      setAbandonVisible(true);
    } else {
      onBack();
    }
  };

  const handleConfirmAbandon = () => {
    setAbandonVisible(false);
    onBack();
  };

  const handleCancelAbandon = () => setAbandonVisible(false);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.row}>
        <View style={styles.left}>
          {showBack ? (
            <TouchableOpacity
              onPress={handleBack}
              style={styles.backBtn}
              accessibilityRole="button"
              accessibilityLabel="戻る"
              testID="progress-header-back"
            >
              <Ionicons
                name="chevron-back"
                size={24}
                color={colors.textPrimary}
              />
            </TouchableOpacity>
          ) : (
            <View style={styles.backBtnPlaceholder} />
          )}
        </View>

        <View
          style={styles.center}
          accessibilityRole="progressbar"
          accessibilityValue={{
            now: currentStep,
            min: 1,
            max: totalSteps,
          }}
          accessibilityLabel={`進捗 ${currentStep} / ${totalSteps}`}
          testID="progress-header-dots"
        >
          {Array.from({ length: totalSteps }).map((_, i) => {
            const stepNumber = i + 1;
            const isPast = stepNumber < currentStep;
            const isCurrent = stepNumber === currentStep;
            const dotColor = isCurrent
              ? colors.primary
              : isPast
                ? colors.primaryLight
                : colors.surfaceSecondary;
            return (
              <View
                key={stepNumber}
                style={[
                  styles.dot,
                  isCurrent && styles.dotCurrent,
                  { backgroundColor: dotColor },
                ]}
              />
            );
          })}
        </View>

        <View style={styles.right}>
          <Text
            style={[styles.stepLabel, { color: colors.textSecondary }]}
            testID="progress-header-step-label"
          >
            {currentStep} / {totalSteps}
          </Text>
        </View>
      </View>

      <AbandonDialog
        visible={abandonVisible}
        onConfirm={handleConfirmAbandon}
        onCancel={handleCancelAbandon}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  left: {
    width: 40,
    alignItems: 'flex-start',
  },
  center: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    flexWrap: 'wrap',
  },
  right: {
    minWidth: 56,
    alignItems: 'flex-end',
  },
  backBtn: {
    width: 36,
    height: 36,
    justifyContent: 'center',
    alignItems: 'flex-start',
  },
  backBtnPlaceholder: {
    width: 36,
    height: 36,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  dotCurrent: {
    width: 18,
    height: 6,
    borderRadius: 3,
  },
  stepLabel: {
    ...typography.labelMedium,
    fontVariant: ['tabular-nums'],
  },
});
