import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { SQLiteDatabase } from 'expo-sqlite';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { getColors, radius } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { recordConsent } from '../../infra/repositories/userConsentRepository';
import { computeConsentTextHash } from '../../domain/consent/consentHash';
import type { ConsentVersion } from '../../types/userConsent';

// ⚠️  LEGAL TEMPLATE — Sprint 4 placeholder copy.
//
// The wording below has NOT been reviewed by counsel. It exists so the
// food-submission flow can ship behind a working consent gate while the
// real terms are being drafted. Before any external release that
// surfaces this modal to users, replace `CONSENT_BODY_TEXT` and the
// checkbox labels with lawyer-reviewed copy AND bump
// `FOOD_SUBMISSION_CONSENT_VERSION` so prior placeholder agreements do
// not satisfy the new gate.
//
// The hash binding (computeConsentTextHash) means changing any visible
// wording without bumping the version produces a hash mismatch — the
// audit row no longer matches what we'd render today, and the gate
// will demand re-consent. That's the desired behavior; do not work
// around it by editing text in place.

// TODO: replace with lawyer-reviewed text + bump version on next change.
export const FOOD_SUBMISSION_CONSENT_VERSION: ConsentVersion = '2026-04-26';

export const FOOD_SUBMISSION_CONSENT_BODY_TEXT =
  '入力情報は商品パッケージ等の事実情報を参照したものであり、ミーリフトおよび他のユーザーによる利用に同意します。詳細は利用規約をご確認ください。';

const CHECKBOX_FACTS_LABEL =
  '入力した栄養成分情報は、商品パッケージの事実情報を写したものであり、私の創作物ではないことを理解しています';

const CHECKBOX_SHARE_LABEL =
  '投稿したデータをミーリフトと他のユーザーが利用することに同意します';

interface ConsentModalProps {
  visible: boolean;
  db: SQLiteDatabase;
  onClose: () => void;
  // Fired after a fresh consent row has been written. The submission
  // screen catches this to retry submitFood with a now-valid gate.
  onAgree: () => void;
}

interface CheckRowProps {
  checked: boolean;
  onToggle: () => void;
  label: string;
  testID?: string;
}

function CheckRow({ checked, onToggle, label, testID }: CheckRowProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  return (
    <TouchableOpacity
      style={styles.checkRow}
      onPress={onToggle}
      activeOpacity={0.7}
      testID={testID}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View
        style={[
          styles.checkBox,
          {
            borderColor: checked ? colors.primary : colors.border,
            backgroundColor: checked ? colors.primary : 'transparent',
          },
        ]}
      >
        {checked && <Ionicons name="checkmark" size={16} color="#FFFFFF" />}
      </View>
      <Text style={[styles.checkLabel, { color: colors.textPrimary }]}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

export function ConsentModal({
  visible,
  db,
  onClose,
  onAgree,
}: ConsentModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [factsAck, setFactsAck] = useState(false);
  const [shareAck, setShareAck] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAgree = factsAck && shareAck && !submitting;

  const handleAgree = useCallback(async () => {
    if (!canAgree) return;
    setSubmitting(true);
    setError(null);
    try {
      await recordConsent(db, {
        consentType: 'food_submission',
        consentVersion: FOOD_SUBMISSION_CONSENT_VERSION,
        consentTextHash: computeConsentTextHash(FOOD_SUBMISSION_CONSENT_BODY_TEXT),
      });
      // Reset local checkbox state so re-opening the modal starts fresh.
      setFactsAck(false);
      setShareAck(false);
      onAgree();
    } catch {
      setError('同意の保存に失敗しました。もう一度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }, [canAgree, db, onAgree]);

  const handleCancel = useCallback(() => {
    // Cancel does NOT mutate consent state — caller treats it as
    // "user declined", and the next submit attempt will re-trigger.
    setError(null);
    onClose();
  }, [onClose]);

  return (
    <Modal visible={visible} onClose={handleCancel} title="食品の投稿について">
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.body, { color: colors.textSecondary }]}>
          {FOOD_SUBMISSION_CONSENT_BODY_TEXT}
        </Text>

        <View style={styles.checks}>
          <CheckRow
            checked={factsAck}
            onToggle={() => setFactsAck((p) => !p)}
            label={CHECKBOX_FACTS_LABEL}
            testID="consent-checkbox-facts"
          />
          <CheckRow
            checked={shareAck}
            onToggle={() => setShareAck((p) => !p)}
            label={CHECKBOX_SHARE_LABEL}
            testID="consent-checkbox-share"
          />
        </View>

        {error && (
          <Text style={[styles.error, { color: colors.error }]}>{error}</Text>
        )}

        <View style={styles.actions}>
          <Button
            title="キャンセル"
            variant="ghost"
            onPress={handleCancel}
            testID="consent-cancel"
          />
          <Button
            title="同意して投稿"
            variant="primary"
            onPress={handleAgree}
            disabled={!canAgree}
            loading={submitting}
            testID="consent-agree"
          />
        </View>
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scroll: {
    maxHeight: 480,
  },
  scrollContent: {
    gap: spacing.lg,
  },
  body: {
    ...typography.bodyMedium,
    lineHeight: 22,
  },
  checks: {
    gap: spacing.md,
  },
  checkRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  checkBox: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkLabel: {
    ...typography.bodySmall,
    flex: 1,
    lineHeight: 20,
  },
  error: {
    ...typography.bodySmall,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: spacing.md,
    marginTop: spacing.sm,
  },
});
