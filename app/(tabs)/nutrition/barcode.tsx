import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  TextInput,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions, BarcodeScanningResult } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Card } from '../../../src/components/ui';
import { useNutrition } from '../../../src/hooks/useNutrition';
import { MealType } from '../../../src/types/common';
import { BarcodeFood } from '../../../src/types/barcodeFood';
import {
  findByBarcode,
  saveBarcodeFood,
} from '../../../src/infra/repositories/barcodeFoodRepository';
import { saveFood } from '../../../src/infra/repositories/foodRepository';
import { lookupBarcode } from '../../../src/infra/services/openFoodFactsService';
import { BarcodeFoodInput } from '../../../src/types/barcodeFood';
import { FoodInput } from '../../../src/types/food';

function barcodeInputToFoodInput(b: BarcodeFoodInput): FoodInput {
  const name = b.brand ? `${b.brand} ${b.nameJa}` : b.nameJa;
  return {
    nameJa: name,
    brand: b.brand ?? null,
    barcode: b.barcode,
    servingSizeG: b.servingSizeG,
    servingUnit: b.servingUnit ?? 'g',
    caloriesPerServing: b.caloriesPerServing,
    proteinG: b.proteinG,
    fatG: b.fatG,
    carbG: b.carbG,
    fiberG: b.fiberG ?? null,
    sodiumMg: b.sodiumMg ?? null,
    calciumMg: b.calciumMg ?? null,
    ironMg: b.ironMg ?? null,
    vitaminAUg: b.vitaminAUg ?? null,
    vitaminB1Mg: b.vitaminB1Mg ?? null,
    vitaminB2Mg: b.vitaminB2Mg ?? null,
    vitaminCMg: b.vitaminCMg ?? null,
    vitaminDUg: b.vitaminDUg ?? null,
    vitaminEMg: b.vitaminEMg ?? null,
    potassiumMg: b.potassiumMg ?? null,
    magnesiumMg: b.magnesiumMg ?? null,
    zincMg: b.zincMg ?? null,
    cholesterolMg: b.cholesterolMg ?? null,
    saturatedFatG: b.saturatedFatG ?? null,
    sugarG: b.sugarG ?? null,
    saltG: b.saltG ?? null,
  };
}

const UNIT_OPTIONS = ['g', 'ml', '個', '本', '枚', 'パック'] as const;

type ScreenMode = 'scan' | 'result' | 'register';

export default function BarcodeScanScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{ mealType: string; date?: string }>();
  const mealType = (params.mealType as MealType) ?? 'breakfast';
  const targetDate = params.date;
  const { addFood } = useNutrition(targetDate);

  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<ScreenMode>('scan');
  const [result, setResult] = useState<BarcodeFood | null>(null);
  const [scannedBarcode, setScannedBarcode] = useState('');
  const lastScannedRef = useRef<string>('');

  // v1.4 ステージ 3.5 / Issue C-1 fix —
  // expo-camera CameraView の iOS native session lifecycle quirk
  // workaround. dogfood で発見: 1 回目 scan 成功後、 router.back で
  // 抜けて再度この画面に来ると `onBarcodeScanned` callback が
  // native 側で発火しなくなる症状。 既知 expo-camera issue で、
  // standard workaround は screen focus の度に CameraView を強制
  // remount すること。 cameraKey を useFocusEffect で increment、
  // CameraView の key prop に渡すことで focus 戻り毎に new native
  // session を起動。 internal state (scanned / mode / lastScannedRef)
  // も同時 reset、 register form の partial state 残留も解消。
  const [cameraKey, setCameraKey] = useState(0);

  // Registration form state
  const [regName, setRegName] = useState('');
  const [regBrand, setRegBrand] = useState('');
  const [regAmount, setRegAmount] = useState('100');
  const [regUnit, setRegUnit] = useState('g');
  const [regCalories, setRegCalories] = useState('');
  const [regProtein, setRegProtein] = useState('');
  const [regFat, setRegFat] = useState('');
  const [regCarb, setRegCarb] = useState('');
  const [regSaving, setRegSaving] = useState(false);

  // Extended nutrients (collapsed section)
  const [showExtended, setShowExtended] = useState(false);
  const [regFiber, setRegFiber] = useState('');
  const [regSalt, setRegSalt] = useState('');
  const [regCalcium, setRegCalcium] = useState('');
  const [regIron, setRegIron] = useState('');
  const [regVitA, setRegVitA] = useState('');
  const [regVitB1, setRegVitB1] = useState('');
  const [regVitB2, setRegVitB2] = useState('');
  const [regVitC, setRegVitC] = useState('');
  const [regVitD, setRegVitD] = useState('');
  const [regVitE, setRegVitE] = useState('');
  const [regPotassium, setRegPotassium] = useState('');
  const [regMagnesium, setRegMagnesium] = useState('');
  const [regZinc, setRegZinc] = useState('');
  const [regCholesterol, setRegCholesterol] = useState('');
  const [regSaturatedFat, setRegSaturatedFat] = useState('');
  const [regSugar, setRegSugar] = useState('');

  // Refs for "next" field navigation
  const brandRef = useRef<TextInput>(null);
  const amountRef = useRef<TextInput>(null);
  const calRef = useRef<TextInput>(null);
  const proRef = useRef<TextInput>(null);
  const fatRef = useRef<TextInput>(null);
  const carbRef = useRef<TextInput>(null);
  const fiberRef = useRef<TextInput>(null);
  const saltRef = useRef<TextInput>(null);
  const calciumRef = useRef<TextInput>(null);
  const ironRef = useRef<TextInput>(null);
  const vitARef = useRef<TextInput>(null);
  const vitB1Ref = useRef<TextInput>(null);
  const vitB2Ref = useRef<TextInput>(null);
  const vitCRef = useRef<TextInput>(null);
  const vitDRef = useRef<TextInput>(null);
  const vitERef = useRef<TextInput>(null);
  const potassiumRef = useRef<TextInput>(null);
  const magnesiumRef = useRef<TextInput>(null);
  const zincRef = useRef<TextInput>(null);
  const cholesterolRef = useRef<TextInput>(null);
  const saturatedFatRef = useRef<TextInput>(null);
  const sugarRef = useRef<TextInput>(null);

  // Issue C-1 fix — focus 戻り毎に CameraView remount + scan state reset.
  // useFocusEffect callback の cleanup phase は触らない (画面を離れた
  // ときの cleanup は次回 focus 時の cameraKey++ で十分代替).
  useFocusEffect(
    useCallback(() => {
      setCameraKey((k) => k + 1);
      setScanned(false);
      setMode('scan');
      setResult(null);
      setScannedBarcode('');
      lastScannedRef.current = '';
      return () => {
        // 明示 cleanup は不要、 次 focus 時の cameraKey++ で remount される.
      };
    }, []),
  );

  const parseNum = (s: string): number => {
    const v = parseFloat(s);
    return isNaN(v) ? 0 : v;
  };
  const parseNullNum = (s: string): number | null => {
    if (!s.trim()) return null;
    const v = parseFloat(s);
    return isNaN(v) ? null : v;
  };

  const handleBarCodeScanned = useCallback(
    async (scanResult: BarcodeScanningResult) => {
      const barcode = scanResult.data;
      if (scanned || barcode === lastScannedRef.current) return;
      lastScannedRef.current = barcode;
      setScanned(true);
      setLoading(true);
      setScannedBarcode(barcode);

      try {
        let food = await findByBarcode(barcode);
        if (!food) {
          const offResult = await lookupBarcode(barcode);
          if (offResult) {
            food = await saveBarcodeFood(offResult);
            // Mirror into foods table so text search picks it up too.
            try {
              await saveFood(barcodeInputToFoodInput(offResult), {
                source: 'open_food_facts',
                externalId: barcode,
                isUserAdded: false,
                verified: true,
              });
            } catch {
              // Non-fatal — barcode_foods entry still exists.
            }
          }
        }

        if (food) {
          setResult(food);
          setMode('result');
        } else {
          // Not found → show registration form
          setMode('register');
        }
      } catch (error) {
        Alert.alert('エラー', 'バーコード検索中にエラーが発生しました。');
        setScanned(false);
        lastScannedRef.current = '';
      } finally {
        setLoading(false);
      }
    },
    [scanned],
  );

  const handleAddResult = async () => {
    if (!result) return;
    await addFood(mealType, {
      foodName: result.nameJa,
      servingAmount: result.servingSizeG,
      servingUnit: result.servingUnit,
      calories: Math.round(result.caloriesPerServing),
      proteinG: result.proteinG,
      fatG: result.fatG,
      carbG: result.carbG,
      fiberG: result.fiberG ?? 0,
      sodiumMg: result.sodiumMg ?? 0,
      calciumMg: result.calciumMg ?? 0,
      ironMg: result.ironMg ?? 0,
      vitaminAUg: result.vitaminAUg ?? 0,
      vitaminB1Mg: result.vitaminB1Mg ?? 0,
      vitaminB2Mg: result.vitaminB2Mg ?? 0,
      vitaminCMg: result.vitaminCMg ?? 0,
      vitaminDUg: result.vitaminDUg ?? 0,
      vitaminEMg: result.vitaminEMg ?? 0,
      potassiumMg: result.potassiumMg ?? 0,
      magnesiumMg: result.magnesiumMg ?? 0,
      zincMg: result.zincMg ?? 0,
      cholesterolMg: result.cholesterolMg ?? 0,
      saturatedFatG: result.saturatedFatG ?? 0,
      sugarG: result.sugarG ?? 0,
      saltG: result.saltG ?? 0,
    });
    router.back();
  };

  const handleRescan = () => {
    setScanned(false);
    setResult(null);
    setMode('scan');
    setScannedBarcode('');
    lastScannedRef.current = '';
    // Reset form
    setRegName(''); setRegBrand(''); setRegAmount('100'); setRegUnit('g');
    setRegCalories(''); setRegProtein(''); setRegFat(''); setRegCarb('');
    setRegFiber(''); setRegSalt(''); setRegCalcium(''); setRegIron('');
    setRegVitA(''); setRegVitB1(''); setRegVitB2(''); setRegVitC('');
    setRegVitD(''); setRegVitE(''); setRegPotassium(''); setRegMagnesium('');
    setRegZinc(''); setRegCholesterol(''); setRegSaturatedFat(''); setRegSugar('');
    setShowExtended(false);
  };

  const buildBarcodeInput = () => ({
    barcode: scannedBarcode,
    nameJa: regName.trim(),
    brand: regBrand.trim() || null,
    servingSizeG: parseNum(regAmount) || 100,
    servingUnit: regUnit,
    caloriesPerServing: parseNum(regCalories),
    proteinG: parseNum(regProtein),
    fatG: parseNum(regFat),
    carbG: parseNum(regCarb),
    fiberG: parseNullNum(regFiber),
    sodiumMg: parseNullNum(regSalt) != null ? parseNum(regSalt) * 393 : null, // salt→sodium approx
    calciumMg: parseNullNum(regCalcium),
    ironMg: parseNullNum(regIron),
    vitaminAUg: parseNullNum(regVitA),
    vitaminB1Mg: parseNullNum(regVitB1),
    vitaminB2Mg: parseNullNum(regVitB2),
    vitaminCMg: parseNullNum(regVitC),
    vitaminDUg: parseNullNum(regVitD),
    vitaminEMg: parseNullNum(regVitE),
    potassiumMg: parseNullNum(regPotassium),
    magnesiumMg: parseNullNum(regMagnesium),
    zincMg: parseNullNum(regZinc),
    cholesterolMg: parseNullNum(regCholesterol),
    saturatedFatG: parseNullNum(regSaturatedFat),
    sugarG: parseNullNum(regSugar),
    saltG: parseNullNum(regSalt),
    source: 'user' as const,
  });

  const handleRegisterAndAdd = async () => {
    if (!regName.trim()) {
      Alert.alert('入力エラー', '商品名を入力してください');
      return;
    }
    setRegSaving(true);
    try {
      const input = buildBarcodeInput();
      const saved = await saveBarcodeFood(input);
      // Also write to foods table as a user-added row so it appears in search.
      try {
        await saveFood(barcodeInputToFoodInput(input), {
          source: 'user',
          externalId: input.barcode,
          isUserAdded: true,
          verified: false,
        });
      } catch {
        // Non-fatal.
      }

      // Also add to meal log
      await addFood(mealType, {
        foodName: saved.nameJa,
        servingAmount: saved.servingSizeG,
        servingUnit: saved.servingUnit,
        calories: Math.round(saved.caloriesPerServing),
        proteinG: saved.proteinG,
        fatG: saved.fatG,
        carbG: saved.carbG,
        fiberG: saved.fiberG ?? 0,
        sodiumMg: saved.sodiumMg ?? 0,
        calciumMg: saved.calciumMg ?? 0,
        ironMg: saved.ironMg ?? 0,
        vitaminAUg: saved.vitaminAUg ?? 0,
        vitaminB1Mg: saved.vitaminB1Mg ?? 0,
        vitaminB2Mg: saved.vitaminB2Mg ?? 0,
        vitaminCMg: saved.vitaminCMg ?? 0,
        vitaminDUg: saved.vitaminDUg ?? 0,
        vitaminEMg: saved.vitaminEMg ?? 0,
        potassiumMg: saved.potassiumMg ?? 0,
        magnesiumMg: saved.magnesiumMg ?? 0,
        zincMg: saved.zincMg ?? 0,
        cholesterolMg: saved.cholesterolMg ?? 0,
        saturatedFatG: saved.saturatedFatG ?? 0,
        sugarG: saved.sugarG ?? 0,
        saltG: saved.saltG ?? 0,
      });
      router.back();
    } catch (error) {
      // v1.4 ステージ 3.5 / Issue C-2 visibility lift —
      // Pattern 11 補強 facet 6 (Error visibility 3-tier):
      //   1. user-facing: Alert に error.message を露出 (推測ベース fix
      //      を避け、 actual root cause を user-reportable に)
      //   2. dev-time: __DEV__ console.error で開発時の log path 確立
      //   3. prod telemetry: Sentry 等の telemetry hookup TODO 記録
      //      (v1.5 prep)
      //
      // dogfood で C-2 が generic Alert 「登録に失敗しました」 に
      // 吸収されていた reason: catch block が error.message を 捨てて
      // いた。 actual root cause (saveBarcodeFood / addFood / etc.) を
      // 特定するための diagnostic lift。 actual fix は次 turn で
      // Syuto-san reproduce 後の error 詳細に基づき確定。
      const msg = error instanceof Error ? error.message : String(error);
      if (__DEV__) {
        console.error(
          '[barcode.handleRegisterAndAdd] Registration failed:',
          error,
        );
      }
      // TODO(v1.5 Sentry): Sentry.captureException(error, { context: 'barcode.register' });
      Alert.alert('エラー', `登録に失敗しました: ${msg}`);
    } finally {
      setRegSaving(false);
    }
  };

  const handleRegisterOnly = async () => {
    if (!regName.trim()) {
      Alert.alert('入力エラー', '商品名を入力してください');
      return;
    }
    setRegSaving(true);
    try {
      const input = buildBarcodeInput();
      await saveBarcodeFood(input);
      try {
        await saveFood(barcodeInputToFoodInput(input), {
          source: 'user',
          externalId: input.barcode,
          isUserAdded: true,
          verified: false,
        });
      } catch {
        // Non-fatal.
      }
      handleRescan();
    } catch (error) {
      // v1.4 ステージ 3.5 / Issue C-2 visibility lift —
      // 同 Pattern 11 補強 facet 6 (Error visibility 3-tier) を
      // handleRegisterAndAdd と統一適用。
      const msg = error instanceof Error ? error.message : String(error);
      if (__DEV__) {
        console.error(
          '[barcode.handleRegisterOnly] Registration failed:',
          error,
        );
      }
      // TODO(v1.5 Sentry): Sentry.captureException(error, { context: 'barcode.registerOnly' });
      Alert.alert('エラー', `登録に失敗しました: ${msg}`);
    } finally {
      setRegSaving(false);
    }
  };

  // Reusable number field
  const renderNumField = (
    label: string,
    unit: string,
    value: string,
    onChangeText: (v: string) => void,
    ref?: React.RefObject<TextInput | null>,
    nextRef?: React.RefObject<TextInput | null>,
  ) => (
    <View style={styles.numFieldRow}>
      <Text style={[styles.numFieldLabel, { color: colors.textSecondary }]}>{label}</Text>
      <View style={[styles.numFieldInput, { backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }]}>
        <TextInput
          ref={ref}
          style={[styles.numFieldText, { color: colors.textPrimary }]}
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          returnKeyType={nextRef ? 'next' : 'done'}
          onSubmitEditing={() => nextRef?.current?.focus()}
          placeholder="0"
          placeholderTextColor={colors.textTertiary}
        />
        <Text style={[styles.numFieldUnit, { color: colors.textTertiary }]}>{unit}</Text>
      </View>
    </View>
  );

  // Permission not yet determined
  if (!permission) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  // Permission denied
  if (!permission.granted) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]}>
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            バーコードスキャン
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons name="camera-outline" size={64} color={colors.textTertiary} />
          <Text style={[styles.permissionText, { color: colors.textPrimary }]}>
            カメラへのアクセスが必要です
          </Text>
          <Text style={[styles.permissionHint, { color: colors.textSecondary }]}>
            バーコードをスキャンするにはカメラの権限が必要です
          </Text>
          <Button
            title="カメラを許可する"
            onPress={requestPermission}
            variant="primary"
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          バーコードスキャン
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {mode === 'scan' && (
        <View style={styles.cameraContainer}>
          {/* Issue C-1 fix — key={cameraKey} で focus 戻り毎に
              CameraView を新規 mount、 native session を完全 reset。
              cameraKey は useFocusEffect で increment される. */}
          <CameraView
            key={cameraKey}
            style={styles.camera}
            facing="back"
            barcodeScannerSettings={{
              barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
            }}
            onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
          />
          <View style={styles.overlay}>
            <View style={styles.scanFrame}>
              <View style={[styles.cornerTL, { borderColor: colors.primary }]} />
              <View style={[styles.cornerTR, { borderColor: colors.primary }]} />
              <View style={[styles.cornerBL, { borderColor: colors.primary }]} />
              <View style={[styles.cornerBR, { borderColor: colors.primary }]} />
            </View>
            {loading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="large" color={colors.primary} />
                <Text style={styles.loadingText}>検索中...</Text>
              </View>
            )}
          </View>
          <Text style={[styles.scanHint, { color: colors.textSecondary }]}>
            バーコードをフレーム内に合わせてください
          </Text>
        </View>
      )}

      {mode === 'result' && result && (
        <View style={styles.resultContainer}>
          <Card style={styles.resultCard}>
            <Text style={[styles.resultName, { color: colors.textPrimary }]}>
              {result.nameJa}
            </Text>
            {result.brand && (
              <Text style={[styles.resultBrand, { color: colors.textSecondary }]}>
                {result.brand}
              </Text>
            )}
            <Text style={[styles.resultBarcode, { color: colors.textTertiary }]}>
              {result.barcode}
            </Text>

            <View style={styles.nutritionGrid}>
              <View style={styles.nutritionItem}>
                <Text style={[styles.nutritionValue, { color: colors.calorie }]}>
                  {Math.round(result.caloriesPerServing)}
                </Text>
                <Text style={[styles.nutritionLabel, { color: colors.textTertiary }]}>
                  kcal
                </Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={[styles.nutritionValue, { color: colors.protein }]}>
                  {result.proteinG}g
                </Text>
                <Text style={[styles.nutritionLabel, { color: colors.textTertiary }]}>
                  P
                </Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={[styles.nutritionValue, { color: colors.fat }]}>
                  {result.fatG}g
                </Text>
                <Text style={[styles.nutritionLabel, { color: colors.textTertiary }]}>
                  F
                </Text>
              </View>
              <View style={styles.nutritionItem}>
                <Text style={[styles.nutritionValue, { color: colors.carb }]}>
                  {result.carbG}g
                </Text>
                <Text style={[styles.nutritionLabel, { color: colors.textTertiary }]}>
                  C
                </Text>
              </View>
            </View>

            <Text style={[styles.servingInfo, { color: colors.textSecondary }]}>
              {result.servingDescription ?? `${result.servingSizeG}${result.servingUnit}`} あたり
            </Text>
            {result.source === 'openfoodfacts' && (
              <Text style={[styles.sourceHint, { color: colors.textTertiary }]}>
                データ提供: Open Food Facts
              </Text>
            )}
          </Card>

          <View style={styles.resultActions}>
            <Button
              title="この食品を追加"
              onPress={handleAddResult}
              variant="primary"
              fullWidth
            />
            <Button
              title="再スキャン"
              onPress={handleRescan}
              variant="outline"
              fullWidth
            />
          </View>
        </View>
      )}

      {mode === 'register' && (
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={100}
        >
          <ScrollView
            style={styles.registerScroll}
            contentContainerStyle={styles.registerContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Header message */}
            <Card>
              <View style={styles.regHeaderRow}>
                <Ionicons name="information-circle-outline" size={20} color={colors.primary} />
                <Text style={[styles.regHeaderText, { color: colors.textPrimary }]}>
                  この商品はまだ登録されていません
                </Text>
              </View>
              <Text style={[styles.regBarcodeDisplay, { color: colors.textTertiary }]}>
                バーコード: {scannedBarcode}
              </Text>
            </Card>

            {/* Sprint 5 phase 5-3: OCR-based public-submission CTA.
                The user scanned a barcode that's not in any DB. Offer
                to capture the nutrition label via OCR and contribute
                the food to the public DB. Future scans of the same
                barcode by anyone will then resolve. */}
            <TouchableOpacity
              style={[
                styles.ocrSubmitCta,
                {
                  backgroundColor: colors.primary + '14',
                  borderColor: colors.primary + '44',
                },
              ]}
              onPress={() =>
                router.push({
                  pathname: '/(tabs)/nutrition/food-submit-public',
                  params: { prefillBarcode: scannedBarcode },
                })
              }
              activeOpacity={0.7}
              testID="barcode-not-found-ocr-cta"
            >
              <Ionicons
                name="camera-outline"
                size={22}
                color={colors.primary}
              />
              <View style={styles.ocrSubmitCtaTextWrap}>
                <Text
                  style={[styles.ocrSubmitCtaTitle, { color: colors.primary }]}
                >
                  栄養成分表を撮影して投稿
                </Text>
                <Text
                  style={[
                    styles.ocrSubmitCtaSubtitle,
                    { color: colors.textSecondary },
                  ]}
                >
                  OCRで自動入力 → みんなのDBに登録
                </Text>
              </View>
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.primary}
              />
            </TouchableOpacity>

            {/* Registration form */}
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>基本情報</Text>

              {/* Product name */}
              <View style={styles.textFieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                  商品名 <Text style={{ color: colors.error }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.textField, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }]}
                  value={regName}
                  onChangeText={setRegName}
                  placeholder="例: プロテインバー チョコレート味"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="next"
                  onSubmitEditing={() => brandRef.current?.focus()}
                />
              </View>

              {/* Brand */}
              <View style={styles.textFieldContainer}>
                <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>ブランド名</Text>
                <TextInput
                  ref={brandRef}
                  style={[styles.textField, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }]}
                  value={regBrand}
                  onChangeText={setRegBrand}
                  placeholder="例: 明治"
                  placeholderTextColor={colors.textTertiary}
                  returnKeyType="next"
                  onSubmitEditing={() => amountRef.current?.focus()}
                />
              </View>

              {/* Serving size + unit */}
              <View style={styles.servingRow}>
                <View style={styles.servingAmountWrap}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>1食あたりの量</Text>
                  <TextInput
                    ref={amountRef}
                    style={[styles.textField, { color: colors.textPrimary, backgroundColor: colors.surfaceSecondary, borderRadius: radius.md }]}
                    value={regAmount}
                    onChangeText={setRegAmount}
                    keyboardType="decimal-pad"
                    returnKeyType="next"
                    onSubmitEditing={() => calRef.current?.focus()}
                  />
                </View>
                <View style={styles.unitWrap}>
                  <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>単位</Text>
                  <View style={styles.unitRow}>
                    {UNIT_OPTIONS.map((u) => (
                      <TouchableOpacity
                        key={u}
                        style={[
                          styles.unitChip,
                          { borderColor: colors.border },
                          regUnit === u && { backgroundColor: colors.primary, borderColor: colors.primary },
                        ]}
                        onPress={() => setRegUnit(u)}
                      >
                        <Text style={[
                          styles.unitChipText,
                          { color: colors.textSecondary },
                          regUnit === u && { color: '#fff' },
                        ]}>
                          {u}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              </View>
            </Card>

            {/* Nutrition - ordered like package labels */}
            <Card>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>栄養成分</Text>
              {renderNumField('カロリー', 'kcal', regCalories, setRegCalories, calRef, proRef)}
              {renderNumField('タンパク質', 'g', regProtein, setRegProtein, proRef, fatRef)}
              {renderNumField('脂質', 'g', regFat, setRegFat, fatRef, carbRef)}
              {renderNumField('炭水化物', 'g', regCarb, setRegCarb, carbRef, undefined)}

              {/* Extended nutrients toggle */}
              <TouchableOpacity
                style={styles.extendedToggle}
                onPress={() => setShowExtended(!showExtended)}
              >
                <Text style={[styles.extendedToggleText, { color: colors.primary }]}>
                  詳細栄養素を入力
                </Text>
                <Ionicons
                  name={showExtended ? 'chevron-up' : 'chevron-down'}
                  size={18}
                  color={colors.primary}
                />
              </TouchableOpacity>

              {showExtended && (
                <View style={styles.extendedSection}>
                  {renderNumField('食物繊維', 'g', regFiber, setRegFiber, fiberRef, saltRef)}
                  {renderNumField('食塩相当量', 'g', regSalt, setRegSalt, saltRef, calciumRef)}
                  {renderNumField('カルシウム', 'mg', regCalcium, setRegCalcium, calciumRef, ironRef)}
                  {renderNumField('鉄分', 'mg', regIron, setRegIron, ironRef, vitARef)}
                  {renderNumField('ビタミンA', 'μg', regVitA, setRegVitA, vitARef, vitB1Ref)}
                  {renderNumField('ビタミンB1', 'mg', regVitB1, setRegVitB1, vitB1Ref, vitB2Ref)}
                  {renderNumField('ビタミンB2', 'mg', regVitB2, setRegVitB2, vitB2Ref, vitCRef)}
                  {renderNumField('ビタミンC', 'mg', regVitC, setRegVitC, vitCRef, vitDRef)}
                  {renderNumField('ビタミンD', 'μg', regVitD, setRegVitD, vitDRef, vitERef)}
                  {renderNumField('ビタミンE', 'mg', regVitE, setRegVitE, vitERef, potassiumRef)}
                  {renderNumField('カリウム', 'mg', regPotassium, setRegPotassium, potassiumRef, magnesiumRef)}
                  {renderNumField('マグネシウム', 'mg', regMagnesium, setRegMagnesium, magnesiumRef, zincRef)}
                  {renderNumField('亜鉛', 'mg', regZinc, setRegZinc, zincRef, cholesterolRef)}
                  {renderNumField('コレステロール', 'mg', regCholesterol, setRegCholesterol, cholesterolRef, saturatedFatRef)}
                  {renderNumField('飽和脂肪酸', 'g', regSaturatedFat, setRegSaturatedFat, saturatedFatRef, sugarRef)}
                  {renderNumField('糖質', 'g', regSugar, setRegSugar, sugarRef, undefined)}
                </View>
              )}
            </Card>

            {/* Actions */}
            <View style={styles.regActions}>
              <Button
                title="登録して追加"
                onPress={handleRegisterAndAdd}
                variant="primary"
                fullWidth
                loading={regSaving}
                disabled={!regName.trim()}
              />
              <Button
                title="登録だけする"
                onPress={handleRegisterOnly}
                variant="outline"
                fullWidth
                loading={regSaving}
                disabled={!regName.trim()}
              />
              <Button
                title="再スキャン"
                onPress={handleRescan}
                variant="ghost"
                fullWidth
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  headerBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  headerTitle: { ...typography.titleMedium },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  permissionText: {
    ...typography.titleSmall,
    textAlign: 'center',
  },
  permissionHint: {
    ...typography.bodyMedium,
    textAlign: 'center',
  },
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  scanFrame: {
    width: 250,
    height: 150,
    position: 'relative',
  },
  cornerTL: { position: 'absolute', top: 0, left: 0, width: 30, height: 30, borderTopWidth: 3, borderLeftWidth: 3 },
  cornerTR: { position: 'absolute', top: 0, right: 0, width: 30, height: 30, borderTopWidth: 3, borderRightWidth: 3 },
  cornerBL: { position: 'absolute', bottom: 0, left: 0, width: 30, height: 30, borderBottomWidth: 3, borderLeftWidth: 3 },
  cornerBR: { position: 'absolute', bottom: 0, right: 0, width: 30, height: 30, borderBottomWidth: 3, borderRightWidth: 3 },
  loadingOverlay: {
    position: 'absolute',
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 12,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  loadingText: { ...typography.bodySmall, color: '#fff' },
  scanHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    padding: spacing.lg,
  },
  // Result mode
  resultContainer: { flex: 1, padding: spacing.lg, gap: spacing.lg },
  resultCard: { gap: spacing.sm },
  resultName: { ...typography.titleMedium },
  resultBrand: { ...typography.bodyMedium },
  resultBarcode: { ...typography.labelSmall, marginBottom: spacing.sm },
  nutritionGrid: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: spacing.md },
  nutritionItem: { alignItems: 'center', gap: 2 },
  nutritionValue: { ...typography.titleSmall },
  nutritionLabel: { ...typography.labelSmall },
  servingInfo: { ...typography.bodySmall, textAlign: 'center' },
  sourceHint: { ...typography.labelSmall, textAlign: 'center', marginTop: spacing.xs },
  resultActions: { gap: spacing.md },
  // Register mode
  registerScroll: { flex: 1 },
  registerContent: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxxl },
  regHeaderRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  regHeaderText: { ...typography.bodyMedium, flex: 1 },
  regBarcodeDisplay: { ...typography.labelSmall, marginTop: spacing.xs },
  sectionTitle: { ...typography.titleSmall, marginBottom: spacing.md },
  textFieldContainer: { marginBottom: spacing.md },
  fieldLabel: { ...typography.labelMedium, marginBottom: spacing.xs },
  textField: { ...typography.bodyMedium, height: 44, paddingHorizontal: spacing.md },
  servingRow: { gap: spacing.md },
  servingAmountWrap: { marginBottom: spacing.sm },
  unitWrap: {},
  unitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  unitChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderWidth: 1,
    borderRadius: 16,
  },
  unitChipText: { ...typography.labelMedium },
  // Number fields
  numFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  numFieldLabel: { ...typography.bodyMedium, flex: 1 },
  numFieldInput: {
    flexDirection: 'row',
    alignItems: 'center',
    width: 140,
    height: 40,
    paddingHorizontal: spacing.md,
  },
  numFieldText: { ...typography.bodyMedium, flex: 1, textAlign: 'right', padding: 0 },
  numFieldUnit: { ...typography.labelSmall, marginLeft: spacing.xs, width: 30 },
  extendedToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
    marginTop: spacing.sm,
  },
  extendedToggleText: { ...typography.labelMedium },
  extendedSection: { marginTop: spacing.sm },
  regActions: { gap: spacing.md },
  ocrSubmitCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
  ocrSubmitCtaTextWrap: { flex: 1 },
  ocrSubmitCtaTitle: { ...typography.titleSmall },
  ocrSubmitCtaSubtitle: { ...typography.bodySmall, marginTop: 2 },
});
