import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { SQLiteDatabase } from 'expo-sqlite';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import {
  Button,
  Input,
  NumberInput,
  SegmentedControl,
} from '../../../src/components/ui';
import { getDatabase } from '../../../src/infra/database/connection';
import { submitFood } from '../../../src/domain/submission/submitFood';
import {
  validateSubmission,
  type SubmissionIssue,
} from '../../../src/domain/submission/submissionValidator';
import { ConsentRequiredError } from '../../../src/domain/submission/errors';
import {
  ConsentModal,
  FOOD_SUBMISSION_CONSENT_VERSION,
} from '../../../src/components/submissions/ConsentModal';
import type {
  UserSubmittedFoodInput,
  FoodSourceType,
} from '../../../src/types/userSubmittedFood';

// food-submit-public — manual-entry submission flow for public_foods.
//
// Distinct screen from food-submit.tsx (which is the local-only user
// food editor). The two intentionally don't share a file: the save
// path is fundamentally different (public moderated DB vs private
// local table) and the legal posture is different (consent gate vs
// none). Form layout is similar but kept as parallel code rather
// than a shared component until both surfaces stabilize.

const SOURCE_TYPE_SEGMENTS: { label: string; value: FoodSourceType }[] = [
  { label: 'パッケージ', value: 'package_label' },
  { label: 'メニュー表示', value: 'menu_board' },
  { label: '公式サイト', value: 'official_site' },
  { label: '推定', value: 'estimation' },
  { label: 'その他', value: 'other' },
];

// 1g salt ≈ 393.4 mg sodium. Used to auto-fill sodium when the user
// types salt and hasn't entered sodium themselves.
const SODIUM_MG_PER_G_SALT = 393.4;

export default function FoodSubmitPublicScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // Required core fields
  const [name, setName] = useState('');
  const [servingSize, setServingSize] = useState<number | null>(100);
  const [calories, setCalories] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [carb, setCarb] = useState<number | null>(null);
  const [sourceType, setSourceType] = useState<FoodSourceType>('package_label');

  // Optional metadata
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState('');
  const [notes, setNotes] = useState('');

  // Extended nutrients
  const [showExtended, setShowExtended] = useState(false);
  const [salt, setSalt] = useState<number | null>(null);
  const [sodium, setSodium] = useState<number | null>(null);
  const [sodiumTouched, setSodiumTouched] = useState(false);
  const [fiber, setFiber] = useState<number | null>(null);
  const [sugar, setSugar] = useState<number | null>(null);
  const [satFat, setSatFat] = useState<number | null>(null);
  const [cholesterol, setCholesterol] = useState<number | null>(null);
  const [calcium, setCalcium] = useState<number | null>(null);
  const [iron, setIron] = useState<number | null>(null);
  const [vitA, setVitA] = useState<number | null>(null);
  const [vitB1, setVitB1] = useState<number | null>(null);
  const [vitB2, setVitB2] = useState<number | null>(null);
  const [vitC, setVitC] = useState<number | null>(null);
  const [vitD, setVitD] = useState<number | null>(null);
  const [vitE, setVitE] = useState<number | null>(null);
  const [potassium, setPotassium] = useState<number | null>(null);
  const [magnesium, setMagnesium] = useState<number | null>(null);
  const [zinc, setZinc] = useState<number | null>(null);

  // UI state
  const [touched, setTouched] = useState<Set<string>>(new Set());
  const [attempted, setAttempted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [consentModalVisible, setConsentModalVisible] = useState(false);
  const [db, setDb] = useState<SQLiteDatabase | null>(null);

  // Lazy DB acquisition. We don't open the DB at mount because the
  // user may dismiss the screen without ever submitting; opening only
  // when first needed keeps cold-render fast.
  const ensureDb = useCallback(async (): Promise<SQLiteDatabase> => {
    if (db) return db;
    const next = await getDatabase();
    setDb(next);
    return next;
  }, [db]);

  const markTouched = useCallback((field: string) => {
    setTouched((prev) => {
      if (prev.has(field)) return prev;
      const next = new Set(prev);
      next.add(field);
      return next;
    });
  }, []);

  // When the user enters salt and hasn't manually edited sodium,
  // auto-fill sodium from the JP-standard 1:393.4 conversion. Once the
  // user types sodium themselves, sodiumTouched flips and we stop
  // overwriting their value.
  const handleSaltChange = useCallback(
    (next: number | null) => {
      setSalt(next);
      markTouched('saltG');
      if (!sodiumTouched) {
        setSodium(
          next !== null ? Math.round(next * SODIUM_MG_PER_G_SALT) : null,
        );
      }
    },
    [markTouched, sodiumTouched],
  );

  const handleSodiumChange = useCallback(
    (next: number | null) => {
      setSodium(next);
      setSodiumTouched(true);
      markTouched('sodiumMg');
    },
    [markTouched],
  );

  // Build the submission input from current state. Fields with
  // numeric `null` get coerced to NaN for the validator so that
  // "calories_negative" fires for empty required fields rather than
  // silently passing.
  const formInput: UserSubmittedFoodInput = useMemo(
    () => ({
      nameJa: name.trim(),
      brand: brand.trim() || null,
      barcode: barcode.trim() || null,
      servingSizeG: servingSize ?? Number.NaN,
      servingUnit: 'g',
      caloriesPerServing: calories ?? Number.NaN,
      proteinG: protein ?? Number.NaN,
      fatG: fat ?? Number.NaN,
      carbG: carb ?? Number.NaN,
      sourceType,
      notes: notes.trim() || null,
      saltG: salt,
      sodiumMg: sodium,
      fiberG: fiber,
      sugarG: sugar,
      saturatedFatG: satFat,
      cholesterolMg: cholesterol,
      calciumMg: calcium,
      ironMg: iron,
      vitaminAUg: vitA,
      vitaminB1Mg: vitB1,
      vitaminB2Mg: vitB2,
      vitaminCMg: vitC,
      vitaminDUg: vitD,
      vitaminEMg: vitE,
      potassiumMg: potassium,
      magnesiumMg: magnesium,
      zincMg: zinc,
    }),
    [
      name, brand, barcode, servingSize, calories, protein, fat, carb,
      sourceType, notes, salt, sodium, fiber, sugar, satFat, cholesterol,
      calcium, iron, vitA, vitB1, vitB2, vitC, vitD, vitE, potassium,
      magnesium, zinc,
    ],
  );

  const validation = useMemo(
    () => validateSubmission(formInput),
    [formInput],
  );

  // Inline error per field. Shown only after a field is touched OR
  // a submit attempt has been made — avoids the cold-load "everything
  // is red" UX.
  const errorByField = useMemo(() => {
    const map = new Map<string, SubmissionIssue>();
    for (const issue of validation.issues) {
      if (issue.severity !== 'error') continue;
      if (issue.field == null) continue;
      const visible = attempted || touched.has(issue.field);
      if (!visible) continue;
      if (!map.has(issue.field)) map.set(issue.field, issue);
    }
    return map;
  }, [validation, attempted, touched]);

  // Soft PFC×Atwater warn — surfaced as a banner regardless of
  // touched state once macros are all filled (the validator only
  // emits this issue after macro and serving sanity checks pass).
  const pfcWarn = useMemo(
    () =>
      validation.issues.find(
        (i) =>
          i.code === 'pfc_calorie_mismatch' && i.severity === 'warn',
      ) ?? null,
    [validation],
  );

  const requiredFilled =
    name.trim().length > 0 &&
    servingSize != null &&
    calories != null &&
    protein != null &&
    fat != null &&
    carb != null;

  const canSubmit = requiredFilled && validation.ok && !submitting;

  const persistSubmission = useCallback(
    async (database: SQLiteDatabase) => {
      await submitFood(database, formInput, FOOD_SUBMISSION_CONSENT_VERSION);
      Alert.alert(
        '投稿しました',
        '承認後、他のユーザーも利用できるようになります',
        [{ text: 'OK', onPress: () => router.back() }],
      );
    },
    [formInput],
  );

  const handleSubmit = useCallback(async () => {
    if (submitting) return;
    setAttempted(true);
    setSubmitError(null);
    if (!validation.ok || !requiredFilled) return;

    setSubmitting(true);
    try {
      const database = await ensureDb();
      await persistSubmission(database);
    } catch (e) {
      if (e instanceof ConsentRequiredError) {
        setConsentModalVisible(true);
      } else {
        setSubmitError(
          e instanceof Error
            ? `投稿に失敗しました: ${e.message}`
            : '投稿に失敗しました',
        );
      }
    } finally {
      setSubmitting(false);
    }
  }, [
    submitting, validation.ok, requiredFilled, ensureDb, persistSubmission,
  ]);

  const handleConsentAgreed = useCallback(async () => {
    setConsentModalVisible(false);
    setSubmitting(true);
    setSubmitError(null);
    try {
      const database = await ensureDb();
      await persistSubmission(database);
    } catch (e) {
      setSubmitError(
        e instanceof Error
          ? `投稿に失敗しました: ${e.message}`
          : '投稿に失敗しました',
      );
    } finally {
      setSubmitting(false);
    }
  }, [ensureDb, persistSubmission]);

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          食品をみんなに投稿
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        style={styles.flex1}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View
            style={[
              styles.noticeBox,
              {
                backgroundColor: colors.primary + '14',
                borderColor: colors.primary + '33',
              },
            ]}
          >
            <Ionicons
              name="information-circle-outline"
              size={18}
              color={colors.primary}
            />
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
              投稿された食品はモデレーション後、他のユーザーも検索で利用できるようになります
            </Text>
          </View>

          <Input
            label="商品名 *"
            placeholder="例: コンビニのツナサラダ"
            value={name}
            onChangeText={(text) => {
              setName(text);
              markTouched('nameJa');
            }}
            error={errorByField.get('nameJa')?.message}
            testID="submission-name-input"
          />
          <Input
            label="ブランド（任意）"
            placeholder="例: セブンイレブン"
            value={brand}
            onChangeText={setBrand}
          />
          <Input
            label="バーコード（任意）"
            placeholder="例: 4901234567890"
            value={barcode}
            onChangeText={setBarcode}
            keyboardType="number-pad"
          />

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            情報源 *
          </Text>
          <View testID="submission-source-type">
            <SegmentedControl
              segments={SOURCE_TYPE_SEGMENTS}
              selectedValue={sourceType}
              onValueChange={(v) => {
                setSourceType(v as FoodSourceType);
                markTouched('sourceType');
              }}
              scrollable
            />
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            1食分のサイズ
          </Text>
          <View>
            <NumberInput
              label="量 (g) *"
              value={servingSize}
              onValueChange={(v) => {
                setServingSize(v);
                markTouched('servingSizeG');
              }}
              step={10}
              min={1}
              max={9999}
              suffix="g"
            />
            {errorByField.get('servingSizeG') && (
              <Text style={[styles.fieldError, { color: colors.error }]}>
                {errorByField.get('servingSizeG')?.message}
              </Text>
            )}
            <Text style={[styles.helper, { color: colors.textTertiary }]}>
              ml・個・枚などの単位は今のところ未対応です。グラム換算で入力してください
            </Text>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            栄養成分（1食分あたり）
          </Text>
          <View>
            <NumberInput
              label="カロリー * (kcal)"
              value={calories}
              onValueChange={(v) => {
                setCalories(v);
                markTouched('caloriesPerServing');
              }}
              step={10}
              min={0}
              max={9999}
              suffix="kcal"
            />
            {errorByField.get('caloriesPerServing') && (
              <Text style={[styles.fieldError, { color: colors.error }]}>
                {errorByField.get('caloriesPerServing')?.message}
              </Text>
            )}
          </View>
          <View>
            <NumberInput
              label="タンパク質 * (g)"
              value={protein}
              onValueChange={(v) => {
                setProtein(v);
                markTouched('proteinG');
              }}
              step={1}
              min={0}
              max={999}
              decimals={1}
              suffix="g"
            />
            {errorByField.get('proteinG') && (
              <Text style={[styles.fieldError, { color: colors.error }]}>
                {errorByField.get('proteinG')?.message}
              </Text>
            )}
          </View>
          <View>
            <NumberInput
              label="脂質 * (g)"
              value={fat}
              onValueChange={(v) => {
                setFat(v);
                markTouched('fatG');
              }}
              step={1}
              min={0}
              max={999}
              decimals={1}
              suffix="g"
            />
            {errorByField.get('fatG') && (
              <Text style={[styles.fieldError, { color: colors.error }]}>
                {errorByField.get('fatG')?.message}
              </Text>
            )}
          </View>
          <View>
            <NumberInput
              label="炭水化物 * (g)"
              value={carb}
              onValueChange={(v) => {
                setCarb(v);
                markTouched('carbG');
              }}
              step={1}
              min={0}
              max={999}
              decimals={1}
              suffix="g"
            />
            {errorByField.get('carbG') && (
              <Text style={[styles.fieldError, { color: colors.error }]}>
                {errorByField.get('carbG')?.message}
              </Text>
            )}
          </View>

          {pfcWarn && (
            <View
              style={[
                styles.warnBanner,
                {
                  backgroundColor: colors.warning + '1A',
                  borderColor: colors.warning,
                },
              ]}
              testID="submission-pfc-warn"
            >
              <Ionicons
                name="alert-circle-outline"
                size={18}
                color={colors.warning}
              />
              <View style={styles.flex1}>
                <Text style={[styles.warnTitle, { color: colors.textPrimary }]}>
                  確認しますか?
                </Text>
                <Text
                  style={[styles.warnBody, { color: colors.textSecondary }]}
                >
                  {pfcWarn.message}
                </Text>
              </View>
            </View>
          )}

          <TouchableOpacity
            style={styles.extToggle}
            onPress={() => setShowExtended((p) => !p)}
          >
            <Text style={[styles.extToggleText, { color: colors.primary }]}>
              詳細栄養素を入力
            </Text>
            <Ionicons
              name={showExtended ? 'chevron-up' : 'chevron-down'}
              size={16}
              color={colors.primary}
            />
          </TouchableOpacity>

          {showExtended && (
            <View style={styles.extSection}>
              <NumberInput
                label="食塩相当量 (g)"
                value={salt}
                onValueChange={handleSaltChange}
                step={0.1}
                min={0}
                max={100}
                decimals={1}
                suffix="g"
              />
              <View>
                <NumberInput
                  label="ナトリウム (mg)"
                  value={sodium}
                  onValueChange={handleSodiumChange}
                  step={10}
                  min={0}
                  max={99999}
                  suffix="mg"
                />
                <Text style={[styles.helper, { color: colors.textTertiary }]}>
                  食塩相当量から自動計算（1g ≒ 393.4mg）。手動で上書きできます
                </Text>
              </View>
              <NumberInput
                label="食物繊維 (g)"
                value={fiber}
                onValueChange={setFiber}
                step={0.1}
                min={0}
                max={100}
                decimals={1}
                suffix="g"
              />
              <NumberInput
                label="糖質 (g)"
                value={sugar}
                onValueChange={setSugar}
                step={0.1}
                min={0}
                max={999}
                decimals={1}
                suffix="g"
              />
              <NumberInput
                label="飽和脂肪酸 (g)"
                value={satFat}
                onValueChange={setSatFat}
                step={0.1}
                min={0}
                max={999}
                decimals={1}
                suffix="g"
              />
              <NumberInput
                label="コレステロール (mg)"
                value={cholesterol}
                onValueChange={setCholesterol}
                step={10}
                min={0}
                max={9999}
                suffix="mg"
              />
              <NumberInput
                label="カルシウム (mg)"
                value={calcium}
                onValueChange={setCalcium}
                step={10}
                min={0}
                max={9999}
                suffix="mg"
              />
              <NumberInput
                label="鉄分 (mg)"
                value={iron}
                onValueChange={setIron}
                step={0.1}
                min={0}
                max={100}
                decimals={1}
                suffix="mg"
              />
              <NumberInput
                label="ビタミンA (μg)"
                value={vitA}
                onValueChange={setVitA}
                step={10}
                min={0}
                max={99999}
                suffix="μg"
              />
              <NumberInput
                label="ビタミンB1 (mg)"
                value={vitB1}
                onValueChange={setVitB1}
                step={0.01}
                min={0}
                max={100}
                decimals={2}
                suffix="mg"
              />
              <NumberInput
                label="ビタミンB2 (mg)"
                value={vitB2}
                onValueChange={setVitB2}
                step={0.01}
                min={0}
                max={100}
                decimals={2}
                suffix="mg"
              />
              <NumberInput
                label="ビタミンC (mg)"
                value={vitC}
                onValueChange={setVitC}
                step={1}
                min={0}
                max={9999}
                suffix="mg"
              />
              <NumberInput
                label="ビタミンD (μg)"
                value={vitD}
                onValueChange={setVitD}
                step={0.1}
                min={0}
                max={1000}
                decimals={1}
                suffix="μg"
              />
              <NumberInput
                label="ビタミンE (mg)"
                value={vitE}
                onValueChange={setVitE}
                step={0.1}
                min={0}
                max={1000}
                decimals={1}
                suffix="mg"
              />
              <NumberInput
                label="カリウム (mg)"
                value={potassium}
                onValueChange={setPotassium}
                step={10}
                min={0}
                max={99999}
                suffix="mg"
              />
              <NumberInput
                label="マグネシウム (mg)"
                value={magnesium}
                onValueChange={setMagnesium}
                step={10}
                min={0}
                max={9999}
                suffix="mg"
              />
              <NumberInput
                label="亜鉛 (mg)"
                value={zinc}
                onValueChange={setZinc}
                step={0.1}
                min={0}
                max={1000}
                decimals={1}
                suffix="mg"
              />
            </View>
          )}

          <Input
            label="メモ（任意）"
            placeholder="補足情報があれば記入してください"
            value={notes}
            onChangeText={setNotes}
            multiline
            numberOfLines={3}
          />

          {submitError && (
            <Text
              style={[styles.submitError, { color: colors.error }]}
              testID="submission-error"
            >
              {submitError}
            </Text>
          )}

          <Button
            title="投稿する"
            onPress={handleSubmit}
            variant="primary"
            fullWidth
            loading={submitting}
            disabled={!canSubmit}
            testID="submission-submit"
          />
        </ScrollView>
      </KeyboardAvoidingView>

      {db && (
        <ConsentModal
          visible={consentModalVisible}
          db={db}
          onClose={() => setConsentModalVisible(false)}
          onAgree={handleConsentAgreed}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  flex1: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.titleMedium },
  scroll: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  noticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noticeText: { ...typography.bodySmall, flex: 1 },
  sectionTitle: {
    ...typography.titleSmall,
    marginTop: spacing.md,
  },
  helper: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
  },
  fieldError: {
    ...typography.bodySmall,
    marginTop: spacing.xs,
  },
  warnBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  warnTitle: {
    ...typography.labelMedium,
    marginBottom: spacing.xs,
  },
  warnBody: {
    ...typography.bodySmall,
    lineHeight: 20,
  },
  extToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  extToggleText: { ...typography.labelMedium },
  extSection: { gap: spacing.sm, marginBottom: spacing.sm },
  submitError: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
});
