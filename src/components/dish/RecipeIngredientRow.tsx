import React, { useEffect, useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Input } from '../ui';
import { getColors } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import type { Food } from '../../types/food';
import {
  validateRecipeIngredient,
  type RecipeIngredientValidation,
} from '../../domain/recipeCalculator';

// Inline-editable row for one ingredient in the recipe builder.
//
// Live mode (food provided): the user types into a numeric input. The
// draft is held locally for typing snappiness, then committed to the
// parent via onAmountChange after a debounce (default 150ms). Validation
// runs on the draft so feedback is immediate (a typed "0" turns red
// before debounce fires); the parent gates save on the committed value.
//
// Loaded mode (food === null): the row was rehydrated from a persisted
// dish, and we don't have the canonical Food row to recompute against
// in this commit. We render amount as static text. Sprint 2B-2 commit 3
// can upgrade these to live by resolving foodId → Food via
// foodRepository.getFoodsByIds at load time.

const VALIDATION_MESSAGES: Record<string, string> = {
  amount_not_positive: '量は0より大きくしてください',
  amount_too_large: '量は5000gまでです',
  food_serving_invalid: '食材の1人前データが不正です',
};

export interface RecipeIngredientRowProps {
  localId: string;
  foodName: string;
  /** Committed amount from parent state. Source of truth post-debounce. */
  amountG: number;
  /** Canonical Food row for live recompute + validation. null = loaded mode. */
  food: Food | null;
  /** Pre-rounded (0dp) calorie contribution displayed under the row. */
  caloriesPreview: number;
  onAmountChange: (localId: string, amountG: number) => void;
  onRemove: (localId: string) => void;
  /** Debounce window before committing draft to parent. Defaults to 150ms. */
  debounceMs?: number;
}

export function RecipeIngredientRow({
  localId,
  foodName,
  amountG,
  food,
  caloriesPreview,
  onAmountChange,
  onRemove,
  debounceMs = 150,
}: RecipeIngredientRowProps): React.ReactElement {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // Local draft holds the literal typed string so partial entries
  // ("12.", "") render correctly without parent round-trips.
  const [draft, setDraft] = useState<string>(String(amountG));

  // Resync if the parent's amountG changes externally (e.g. on initial
  // mount, or a future "duplicate ingredient" feature).
  useEffect(() => {
    setDraft(String(amountG));
  }, [amountG]);

  // Debounced commit. Only fires when the parsed draft differs from the
  // committed amountG, so re-renders triggered by other state don't
  // re-fire the commit and cause feedback loops.
  useEffect(() => {
    if (!food) return;
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) return;
    if (parsed === amountG) return;
    const t = setTimeout(() => {
      onAmountChange(localId, parsed);
    }, debounceMs);
    return () => clearTimeout(t);
  }, [draft, food, amountG, localId, onAmountChange, debounceMs]);

  // Validate against the draft for immediate feedback. Loaded rows
  // skip validation (they came from the DB and we can't revalidate
  // without the Food).
  let validation: RecipeIngredientValidation | null = null;
  if (food) {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      validation = {
        ok: false,
        issues: [{ code: 'amount_not_positive', message: '数値を入力してください' }],
      };
    } else {
      validation = validateRecipeIngredient(food, parsed);
    }
  }

  const errorMsg =
    validation && !validation.ok && validation.issues[0]
      ? VALIDATION_MESSAGES[validation.issues[0].code] ??
        validation.issues[0].message
      : undefined;

  return (
    <View style={[styles.row, { borderBottomColor: colors.border }]}>
      <View style={styles.info}>
        <Text
          style={[styles.name, { color: colors.textPrimary }]}
          numberOfLines={1}
        >
          {foodName}
        </Text>
        {food ? (
          <View style={styles.amountWrap}>
            <View style={styles.amountInput}>
              <Input
                value={draft}
                onChangeText={setDraft}
                keyboardType="numeric"
                suffix="g"
                error={errorMsg}
                testID={`amount-input-${localId}`}
              />
            </View>
          </View>
        ) : (
          <Text style={[styles.staticAmount, { color: colors.textSecondary }]}>
            {amountG}g
          </Text>
        )}
        <Text style={[styles.kcalPreview, { color: colors.textTertiary }]}>
          {caloriesPreview} kcal
        </Text>
      </View>
      <TouchableOpacity
        onPress={() => onRemove(localId)}
        hitSlop={8}
        testID={`remove-ingredient-${localId}`}
      >
        <Ionicons name="trash-outline" size={22} color={colors.error} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: spacing.md,
  },
  info: { flex: 1, gap: spacing.xs },
  name: { ...typography.bodyMedium },
  amountWrap: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  amountInput: {
    width: 140,
  },
  staticAmount: {
    ...typography.bodySmall,
    paddingVertical: spacing.sm,
  },
  kcalPreview: { ...typography.labelSmall },
});
