import React, { useCallback, useEffect, useState } from 'react';
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
import { router, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Input, NumberInput, SegmentedControl } from '../../../src/components/ui';
import {
  saveFood,
  updateUserFood,
  getFoodById,
} from '../../../src/infra/repositories/foodRepository';
import { FoodInput } from '../../../src/types/food';

const UNIT_SEGMENTS = [
  { label: 'g', value: 'g' },
  { label: 'ml', value: 'ml' },
  { label: '個', value: '個' },
  { label: '枚', value: '枚' },
  { label: '杯', value: '杯' },
];

export default function FoodSubmitScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const params = useLocalSearchParams<{
    foodId?: string;
    barcode?: string;
    initialName?: string;
  }>();
  const editingId = params.foodId ?? null;

  const [name, setName] = useState(params.initialName ?? '');
  const [brand, setBrand] = useState('');
  const [barcode, setBarcode] = useState(params.barcode ?? '');
  const [servingSize, setServingSize] = useState<number | null>(100);
  const [servingUnit, setServingUnit] = useState<string>('g');

  // Required nutrients
  const [calories, setCalories] = useState<number | null>(null);
  const [protein, setProtein] = useState<number | null>(null);
  const [fat, setFat] = useState<number | null>(null);
  const [carb, setCarb] = useState<number | null>(null);

  // Extended (optional)
  const [showExtended, setShowExtended] = useState(false);
  const [fiber, setFiber] = useState<number | null>(null);
  const [salt, setSalt] = useState<number | null>(null);
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
  const [cholesterol, setCholesterol] = useState<number | null>(null);
  const [satFat, setSatFat] = useState<number | null>(null);
  const [sugar, setSugar] = useState<number | null>(null);

  const [saving, setSaving] = useState(false);

  // Load existing when editing
  useEffect(() => {
    if (!editingId) return;
    (async () => {
      const food = await getFoodById(editingId);
      if (!food) return;
      setName(food.nameJa);
      setBrand(food.brand ?? '');
      setBarcode(food.barcode ?? '');
      setServingSize(food.servingSizeG);
      setServingUnit(food.servingUnit);
      setCalories(food.caloriesPerServing);
      setProtein(food.proteinG);
      setFat(food.fatG);
      setCarb(food.carbG);
      setFiber(food.fiberG ?? null);
      setSalt(food.saltG ?? null);
      setCalcium(food.calciumMg ?? null);
      setIron(food.ironMg ?? null);
      setVitA(food.vitaminAUg ?? null);
      setVitB1(food.vitaminB1Mg ?? null);
      setVitB2(food.vitaminB2Mg ?? null);
      setVitC(food.vitaminCMg ?? null);
      setVitD(food.vitaminDUg ?? null);
      setVitE(food.vitaminEMg ?? null);
      setPotassium(food.potassiumMg ?? null);
      setMagnesium(food.magnesiumMg ?? null);
      setZinc(food.zincMg ?? null);
      setCholesterol(food.cholesterolMg ?? null);
      setSatFat(food.saturatedFatG ?? null);
      setSugar(food.sugarG ?? null);
    })();
  }, [editingId]);

  const handleSave = useCallback(async () => {
    if (saving) return;
    if (!name.trim()) {
      Alert.alert('入力エラー', '商品名を入力してください');
      return;
    }
    if (calories == null || protein == null || fat == null || carb == null) {
      Alert.alert('入力エラー', 'カロリー・タンパク質・脂質・炭水化物を入力してください');
      return;
    }
    const amt = servingSize ?? 100;
    const input: FoodInput = {
      nameJa: name.trim(),
      brand: brand.trim() || null,
      barcode: barcode.trim() || null,
      servingSizeG: amt,
      servingUnit,
      caloriesPerServing: calories,
      proteinG: protein,
      fatG: fat,
      carbG: carb,
      fiberG: fiber,
      saltG: salt,
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
      cholesterolMg: cholesterol,
      saturatedFatG: satFat,
      sugarG: sugar,
    };
    setSaving(true);
    try {
      if (editingId) {
        await updateUserFood(editingId, input);
      } else {
        await saveFood(input, {
          source: 'user',
          externalId: null,
          isUserAdded: true,
          verified: false,
        });
      }
      router.back();
    } catch (error) {
      Alert.alert('エラー', '食品の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  }, [
    saving, editingId, name, brand, barcode, servingSize, servingUnit,
    calories, protein, fat, carb,
    fiber, salt, calcium, iron, vitA, vitB1, vitB2, vitC, vitD, vitE,
    potassium, magnesium, zinc, cholesterol, satFat, sugar,
  ]);

  const canSave =
    !!name.trim() &&
    calories != null &&
    protein != null &&
    fat != null &&
    carb != null;

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
          {editingId ? '食品を編集' : '食品を追加'}
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
              { backgroundColor: colors.primary + '14', borderColor: colors.primary + '33' },
            ]}
          >
            <Ionicons name="information-circle-outline" size={18} color={colors.primary} />
            <Text style={[styles.noticeText, { color: colors.textSecondary }]}>
              あなたが追加した食品は検索で使えます（この端末内のみ）
            </Text>
          </View>

          <Input
            label="商品名 *"
            placeholder="例: コンビニのツナサラダ"
            value={name}
            onChangeText={setName}
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
          />

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            1食分のサイズ
          </Text>
          <View style={styles.sizeRow}>
            <View style={styles.sizeAmount}>
              <NumberInput
                label="量"
                value={servingSize}
                onValueChange={setServingSize}
                step={10}
                min={1}
                max={9999}
              />
            </View>
            <View style={styles.sizeUnit}>
              <Text style={[styles.inlineLabel, { color: colors.textSecondary }]}>
                単位
              </Text>
              <SegmentedControl
                segments={UNIT_SEGMENTS}
                selectedValue={servingUnit}
                onValueChange={setServingUnit}
              />
            </View>
          </View>

          <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
            栄養成分（1食分あたり）
          </Text>
          <NumberInput
            label="カロリー * (kcal)"
            value={calories}
            onValueChange={setCalories}
            step={10}
            min={0}
            max={9999}
            suffix="kcal"
          />
          <NumberInput
            label="タンパク質 * (g)"
            value={protein}
            onValueChange={setProtein}
            step={1}
            min={0}
            max={999}
            decimals={1}
            suffix="g"
          />
          <NumberInput
            label="脂質 * (g)"
            value={fat}
            onValueChange={setFat}
            step={1}
            min={0}
            max={999}
            decimals={1}
            suffix="g"
          />
          <NumberInput
            label="炭水化物 * (g)"
            value={carb}
            onValueChange={setCarb}
            step={1}
            min={0}
            max={999}
            decimals={1}
            suffix="g"
          />

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
              <NumberInput label="食物繊維 (g)" value={fiber} onValueChange={setFiber} step={0.1} min={0} max={100} decimals={1} suffix="g" />
              <NumberInput label="食塩相当量 (g)" value={salt} onValueChange={setSalt} step={0.1} min={0} max={100} decimals={1} suffix="g" />
              <NumberInput label="カルシウム (mg)" value={calcium} onValueChange={setCalcium} step={10} min={0} max={9999} suffix="mg" />
              <NumberInput label="鉄分 (mg)" value={iron} onValueChange={setIron} step={0.1} min={0} max={100} decimals={1} suffix="mg" />
              <NumberInput label="ビタミンA (μg)" value={vitA} onValueChange={setVitA} step={10} min={0} max={99999} suffix="μg" />
              <NumberInput label="ビタミンB1 (mg)" value={vitB1} onValueChange={setVitB1} step={0.01} min={0} max={100} decimals={2} suffix="mg" />
              <NumberInput label="ビタミンB2 (mg)" value={vitB2} onValueChange={setVitB2} step={0.01} min={0} max={100} decimals={2} suffix="mg" />
              <NumberInput label="ビタミンC (mg)" value={vitC} onValueChange={setVitC} step={1} min={0} max={9999} suffix="mg" />
              <NumberInput label="ビタミンD (μg)" value={vitD} onValueChange={setVitD} step={0.1} min={0} max={1000} decimals={1} suffix="μg" />
              <NumberInput label="ビタミンE (mg)" value={vitE} onValueChange={setVitE} step={0.1} min={0} max={1000} decimals={1} suffix="mg" />
              <NumberInput label="カリウム (mg)" value={potassium} onValueChange={setPotassium} step={10} min={0} max={99999} suffix="mg" />
              <NumberInput label="マグネシウム (mg)" value={magnesium} onValueChange={setMagnesium} step={10} min={0} max={9999} suffix="mg" />
              <NumberInput label="亜鉛 (mg)" value={zinc} onValueChange={setZinc} step={0.1} min={0} max={1000} decimals={1} suffix="mg" />
              <NumberInput label="コレステロール (mg)" value={cholesterol} onValueChange={setCholesterol} step={10} min={0} max={9999} suffix="mg" />
              <NumberInput label="飽和脂肪酸 (g)" value={satFat} onValueChange={setSatFat} step={0.1} min={0} max={999} decimals={1} suffix="g" />
              <NumberInput label="糖質 (g)" value={sugar} onValueChange={setSugar} step={0.1} min={0} max={999} decimals={1} suffix="g" />
            </View>
          )}

          <Button
            title={editingId ? '更新する' : '保存する'}
            onPress={handleSave}
            variant="primary"
            fullWidth
            loading={saving}
            disabled={saving || !canSave}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  sizeRow: { flexDirection: 'row', gap: spacing.md },
  sizeAmount: { flex: 1 },
  sizeUnit: { flex: 2 },
  inlineLabel: { ...typography.labelMedium, marginBottom: spacing.xs },
  extToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  extToggleText: { ...typography.labelMedium },
  extSection: { gap: spacing.sm, marginBottom: spacing.sm },
});
