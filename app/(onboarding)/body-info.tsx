import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  useColorScheme,
} from 'react-native';
import { router } from 'expo-router';
import Slider from '@react-native-community/slider';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../src/theme/tokens';
import { spacing } from '../../src/theme/spacing';
import { typography } from '../../src/theme/typography';
import { Button } from '../../src/components/ui';
import { WeightSlider } from '../../src/components/onboarding/WeightSlider';
import { useOnboardingStore } from '../../src/stores/onboardingStore';
import {
  CURRENT_WEIGHT_KG_MAX,
  CURRENT_WEIGHT_KG_MIN,
  CURRENT_WEIGHT_KG_STEP,
  GENDER_OPTIONS,
  HEIGHT_CM_MAX,
  HEIGHT_CM_MIN,
  HEIGHT_CM_STEP,
  getBMIFeedback,
  getBirthYearErrorMessage,
  getGenderLabel,
  getHeightErrorMessage,
  getMaxBirthYear,
  getWeightErrorMessage,
  isAllInputsValid,
  validateBirthYear,
  validateCurrentWeightKg,
  validateHeightCm,
} from '../../src/domain/bodyInfoValidation';
import { quantizeToGrid } from '../../src/domain/weightSliderUtils';

// v1.3.0 / Onboarding v2 / Phase C-3 — Body info screen [3].
//
// Four inputs:
//   - gender (3-segment radiogroup)
//   - birthYear (TextInput numeric, 4-digit)
//   - heightCm (inline slider with ± buttons; tap-to-edit Modal
//     deferred to Phase E TODO — kickoff "inline 実装" direction)
//   - currentWeightKg (B-2 WeightSlider component, full feature set)
//
// BMI live feedback below the inputs once height + weight are both
// valid. Pattern 18 SSoT — calls into the existing src/domain/bmi.ts
// helper (japan-standard 6-tier classification 低体重 〜 肥満4度).
//
// Pattern 26 transitional bridge — CTA pushes
// /(onboarding)/body-and-training (legacy [3][4] combined screen)
// until Phase C-4 ships /activity. complete.tsx already preserves
// gender / birthYear / heightCm / currentWeightKg via createProfile
// (lines 117-120), so unlike C-2 nickname there's no integrity
// hardening needed for this phase's bridge — verified at recon.
//
// Patterns applied:
//   #5  per-field validation fail-fast + CTA double-tap defense
//   #11 error state uses border color + JP message; BMI feedback
//       uses category color + label text + extreme-warning text
//   #12 header / radiogroup+radio (gender) / textbox (birthYear) /
//       adjustable (sliders) / button (CTA + ± buttons) / live
//       region (BMI + errors) — full role coverage
//   #18 SSoT — calculateBMI from domain/bmi.ts (existing JP-tier),
//       weightSliderUtils.quantizeToGrid for height grid math
//   #23 「次へ」 tap calls store.persistToProfile once (single
//       transaction); per-input store updates skip persist
//   #24 atomic 4-field persist on submit (one persistToProfile
//       call writes all four fields together)
//   #25 all logic lives in domain/bodyInfoValidation.ts; this
//       file is render-only orchestration

const TITLE = 'あなたの身体情報を教えてください';
const SUBTITLE = '基礎代謝の計算とBMIの算出に使います';
const CTA_LABEL = '次へ';

const HEIGHT_DEFAULT = 170;
const BIRTH_YEAR_DEFAULT_PLACEHOLDER = '1995';

export default function BodyInfoScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const gender = useOnboardingStore((s) => s.gender);
  const birthYear = useOnboardingStore((s) => s.birthYear);
  const heightCm = useOnboardingStore((s) => s.heightCm);
  const currentWeightKg = useOnboardingStore((s) => s.currentWeightKg);
  const onboardingStep = useOnboardingStore((s) => s.onboardingStep);
  const setGender = useOnboardingStore((s) => s.setGender);
  const setBirthYear = useOnboardingStore((s) => s.setBirthYear);
  const setHeightCm = useOnboardingStore((s) => s.setHeightCm);
  const setCurrentWeightKg = useOnboardingStore((s) => s.setCurrentWeightKg);
  const persistToProfile = useOnboardingStore((s) => s.persistToProfile);

  // Codex pass 1 / Critical #1 — INITIAL_STATE seeds Build 14/15
  // legacy placeholders (male / 1995 / 170 / 70) into store, so a
  // user landing on this screen for the first time would see
  // isAllInputsValid=true against scaffold defaults and could
  // submit without touching anything. Gate the CTA on
  // onboardingStep >= 3 — every field setter atomically bumps the
  // step monotonically to 3, so this proxies "user has touched at
  // least one field this session." On a back-nav revisit the step
  // is already past 3 and the CTA enables without re-touch — same
  // UX the kickoff §B-style "returning user pre-fill" pattern
  // assumes elsewhere.
  const hasInteracted = onboardingStep >= 3;

  const [birthYearText, setBirthYearText] = useState<string>(() =>
    birthYear ? String(birthYear) : '',
  );
  const [touched, setTouched] = useState({
    birthYear: false,
    height: false,
    weight: false,
  });
  const [isAdvancing, setIsAdvancing] = useState(false);

  const birthYearValidation = useMemo(
    () => validateBirthYear(birthYear),
    [birthYear],
  );
  const heightValidation = useMemo(
    () => validateHeightCm(heightCm),
    [heightCm],
  );
  const weightValidation = useMemo(
    () => validateCurrentWeightKg(currentWeightKg),
    [currentWeightKg],
  );
  const allValid = isAllInputsValid(
    gender,
    birthYear,
    heightCm,
    currentWeightKg,
  );

  const bmi = useMemo(() => {
    if (!heightValidation.valid || !weightValidation.valid) return null;
    return getBMIFeedback(currentWeightKg, heightCm);
  }, [currentWeightKg, heightCm, heightValidation.valid, weightValidation.valid]);

  const birthYearError =
    touched.birthYear && !birthYearValidation.valid
      ? getBirthYearErrorMessage(birthYearValidation.reason)
      : null;
  const heightError =
    touched.height && !heightValidation.valid
      ? getHeightErrorMessage(heightValidation.reason)
      : null;
  const weightError =
    touched.weight && !weightValidation.valid
      ? getWeightErrorMessage(weightValidation.reason)
      : null;

  const handleBirthYearChange = useCallback(
    (text: string) => {
      // Strip non-digits so paste/IME can't sneak letters past
      // the keyboardType="number-pad" hint.
      const digits = text.replace(/[^0-9]/g, '').slice(0, 4);
      setBirthYearText(digits);
      // Codex pass 1 / Critical #2 — always sync to store so the
      // visible input never diverges from the validated value.
      // For partial input (length < 4) we still write a number so
      // the validator can flag it as too_old/too_young rather than
      // letting a stale full-year value sit in store while the
      // user sees an incomplete field. NaN for empty input
      // collapses to the not_integer branch, disabling the CTA.
      const parsed =
        digits.length === 0 ? NaN : Number.parseInt(digits, 10);
      setBirthYear(parsed);
    },
    [setBirthYear],
  );

  const handleHeightChange = useCallback(
    (raw: number) => {
      // Pattern 27 — quantize relative to min so the slider snaps
      // to the 140 + n×0.5 grid rather than n×0.5 globally. Reuses
      // weightSliderUtils.quantizeToGrid since the math is unit-
      // agnostic (the helper's name is historical, not semantic).
      const snapped = quantizeToGrid(
        raw,
        HEIGHT_CM_MIN,
        HEIGHT_CM_MAX,
        HEIGHT_CM_STEP,
      );
      setHeightCm(snapped);
    },
    [setHeightCm],
  );

  const handleSubmit = useCallback(async () => {
    if (isAdvancing) return;
    setTouched({ birthYear: true, height: true, weight: true });
    if (!allValid || !hasInteracted) return;
    setIsAdvancing(true);
    try {
      await persistToProfile();
    } catch (err) {
      console.warn('[onboarding/body-info] persistToProfile failed', err);
    }
    // Phase C-4 flipped this to the new flow's [4] /activity
    // screen. The C-3 stop-gap (legacy /body-and-training) is no
    // longer reachable from this CTA. activity itself still
    // bridges to /body-and-training until Phase C-5 ships
    // /goal-weight (Pattern 26 transitional chain continues).
    router.push('/(onboarding)/activity');
  }, [allValid, hasInteracted, isAdvancing, persistToProfile]);

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        <Text
          style={[styles.title, { color: colors.textPrimary }]}
          accessibilityRole="header"
        >
          {TITLE}
        </Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {SUBTITLE}
        </Text>

        {/* Gender */}
        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            性別
          </Text>
          <View
            style={styles.segmentRow}
            accessibilityRole="radiogroup"
            accessibilityLabel="性別"
          >
            {GENDER_OPTIONS.map((g) => {
              const selected = gender === g;
              return (
                <TouchableOpacity
                  key={g}
                  onPress={() => setGender(g)}
                  style={[
                    styles.segmentBtn,
                    {
                      borderColor: selected ? colors.primary : colors.border,
                      backgroundColor: selected
                        ? colors.primary + '15'
                        : colors.surface,
                    },
                    selected && styles.segmentBtnSelected,
                  ]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected }}
                  accessibilityLabel={getGenderLabel(g)}
                  testID={`body-info-gender-${g}`}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      {
                        color: selected ? colors.primary : colors.textPrimary,
                        fontWeight: selected ? '700' : '500',
                      },
                    ]}
                  >
                    {getGenderLabel(g)}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {/* Birth year */}
        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            生まれ年
          </Text>
          <TextInput
            value={birthYearText}
            onChangeText={handleBirthYearChange}
            onBlur={() =>
              setTouched((prev) => ({ ...prev, birthYear: true }))
            }
            keyboardType="number-pad"
            maxLength={4}
            placeholder={BIRTH_YEAR_DEFAULT_PLACEHOLDER}
            placeholderTextColor={colors.textTertiary}
            style={[
              styles.numericInput,
              {
                borderColor: birthYearError
                  ? colors.error
                  : birthYearValidation.valid
                    ? colors.primary
                    : colors.border,
                backgroundColor: colors.surface,
                color: colors.textPrimary,
              },
            ]}
            accessibilityLabel="生まれ年"
            accessibilityHint={`${1900} 年から ${getMaxBirthYear()} 年の範囲で4桁入力します`}
            testID="body-info-birth-year"
          />
          <View
            style={styles.errorRow}
            accessibilityLiveRegion="polite"
            accessible={!!birthYearError}
          >
            {birthYearError && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {birthYearError}
              </Text>
            )}
          </View>
        </View>

        {/* Height */}
        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            身長
          </Text>
          <HeightSliderInline
            value={heightCm}
            onChange={handleHeightChange}
            onBlur={() =>
              setTouched((prev) => ({ ...prev, height: true }))
            }
            colors={colors}
          />
          <View
            style={styles.errorRow}
            accessibilityLiveRegion="polite"
            accessible={!!heightError}
          >
            {heightError && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {heightError}
              </Text>
            )}
          </View>
        </View>

        {/* Current weight (B-2 component) */}
        <View style={styles.section}>
          <Text style={[styles.fieldLabel, { color: colors.textPrimary }]}>
            現在の体重
          </Text>
          <WeightSlider
            value={currentWeightKg}
            onChange={(v) => {
              setCurrentWeightKg(v);
              setTouched((prev) => ({ ...prev, weight: true }));
            }}
            min={CURRENT_WEIGHT_KG_MIN}
            max={CURRENT_WEIGHT_KG_MAX}
            step={CURRENT_WEIGHT_KG_STEP}
            label="現在の体重"
            testID="body-info-weight"
          />
          <View
            style={styles.errorRow}
            accessibilityLiveRegion="polite"
            accessible={!!weightError}
          >
            {weightError && (
              <Text style={[styles.errorText, { color: colors.error }]}>
                {weightError}
              </Text>
            )}
          </View>
        </View>

        {/* BMI live feedback (Pattern 11 + 18) */}
        {bmi && (
          <View
            style={[
              styles.bmiBox,
              {
                backgroundColor: bmi.isExtreme
                  ? colors.error + '15'
                  : colors.surfaceSecondary,
                borderColor: bmi.isExtreme ? colors.error : colors.border,
              },
            ]}
            accessibilityLiveRegion="polite"
          >
            <Text
              style={[
                styles.bmiText,
                {
                  color: bmi.isExtreme ? colors.error : colors.textPrimary,
                },
              ]}
            >
              BMI {bmi.result.bmi.toFixed(1)}（{bmi.result.label}）
            </Text>
            {bmi.isExtreme && (
              <Text
                style={[styles.bmiWarning, { color: colors.error }]}
              >
                極端な値です。医療相談をおすすめします
              </Text>
            )}
          </View>
        )}
      </ScrollView>

      <View style={[styles.ctaBar, { borderTopColor: colors.border }]}>
        <Button
          title={CTA_LABEL}
          onPress={handleSubmit}
          variant="primary"
          size="lg"
          fullWidth
          disabled={!allValid || !hasInteracted || isAdvancing}
          testID="body-info-cta"
        />
      </View>
    </KeyboardAvoidingView>
  );
}

// === HeightSliderInline ===
//
// Thin inline cm slider — kickoff direction "inline 実装". Skips
// the WeightSlider's tap-to-edit Modal feature for now (Phase E
// TODO; tap-to-edit is overkill for the height range where
// single-cm precision via slider+buttons is enough). Reuses
// weightSliderUtils.quantizeToGrid via the parent's onChange so
// Pattern 27 (min-relative grid) and Pattern 29 (step-derived
// precision) both apply.

interface HeightSliderInlineProps {
  value: number;
  onChange: (v: number) => void;
  onBlur: () => void;
  colors: ReturnType<typeof getColors>;
}

function HeightSliderInline({
  value,
  onChange,
  onBlur,
  colors,
}: HeightSliderInlineProps) {
  const safeValue = Math.max(
    HEIGHT_CM_MIN,
    Math.min(HEIGHT_CM_MAX, Number.isFinite(value) ? value : HEIGHT_DEFAULT),
  );
  const decrement = () => {
    onChange(safeValue - HEIGHT_CM_STEP);
    onBlur();
  };
  const increment = () => {
    onChange(safeValue + HEIGHT_CM_STEP);
    onBlur();
  };
  return (
    <View>
      <Text style={[styles.sliderValue, { color: colors.textPrimary }]}>
        {safeValue.toFixed(1)} cm
      </Text>
      <Slider
        style={styles.slider}
        minimumValue={HEIGHT_CM_MIN}
        maximumValue={HEIGHT_CM_MAX}
        step={HEIGHT_CM_STEP}
        value={safeValue}
        onValueChange={onChange}
        onSlidingComplete={onBlur}
        minimumTrackTintColor={colors.primary}
        maximumTrackTintColor={colors.surfaceSecondary}
        thumbTintColor={colors.primary}
        accessibilityRole="adjustable"
        accessibilityLabel="身長"
        accessibilityValue={{
          min: HEIGHT_CM_MIN,
          max: HEIGHT_CM_MAX,
          now: safeValue,
          text: `${safeValue.toFixed(1)} cm`,
        }}
        testID="body-info-height-slider"
      />
      <View style={styles.stepRow}>
        <TouchableOpacity
          onPress={decrement}
          disabled={safeValue <= HEIGHT_CM_MIN}
          style={[
            styles.stepBtn,
            {
              backgroundColor: colors.surfaceSecondary,
              opacity: safeValue <= HEIGHT_CM_MIN ? 0.4 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="身長を下げる"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          testID="body-info-height-decrement"
        >
          <Ionicons name="remove" size={20} color={colors.primary} />
        </TouchableOpacity>
        <Text style={[styles.stepLabel, { color: colors.textTertiary }]}>
          {HEIGHT_CM_STEP.toFixed(1)} cm
        </Text>
        <TouchableOpacity
          onPress={increment}
          disabled={safeValue >= HEIGHT_CM_MAX}
          style={[
            styles.stepBtn,
            {
              backgroundColor: colors.surfaceSecondary,
              opacity: safeValue >= HEIGHT_CM_MAX ? 0.4 : 1,
            },
          ]}
          accessibilityRole="button"
          accessibilityLabel="身長を上げる"
          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
          testID="body-info-height-increment"
        >
          <Ionicons name="add" size={20} color={colors.primary} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  title: {
    ...typography.titleLarge,
  },
  subtitle: {
    ...typography.bodyMedium,
  },
  section: {
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  fieldLabel: {
    ...typography.labelLarge,
  },
  segmentRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
  },
  segmentBtnSelected: {
    borderWidth: 2,
  },
  segmentText: {
    ...typography.labelLarge,
  },
  numericInput: {
    height: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1.5,
    ...typography.bodyLarge,
    fontVariant: ['tabular-nums'],
  },
  sliderValue: {
    ...typography.titleMedium,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  slider: {
    height: 36,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    ...typography.bodySmall,
  },
  errorRow: {
    minHeight: 18,
  },
  errorText: {
    ...typography.bodySmall,
  },
  bmiBox: {
    marginTop: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.xs,
  },
  bmiText: {
    ...typography.titleSmall,
    fontVariant: ['tabular-nums'],
  },
  bmiWarning: {
    ...typography.bodySmall,
  },
  ctaBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
