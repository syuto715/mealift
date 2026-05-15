import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button } from '../../../src/components/ui';
import { useMealLoggingOcrStore } from '../../../src/stores/mealLoggingOcrStore';
import {
  recognizeText,
  OcrUnavailableError,
} from '../../../src/infra/services/ocrService';
import { parseNutritionLabel } from '../../../src/domain/submission/nutritionLabelParser';
import { decomposeFromImage } from '../../../src/infra/services/aiNutritionService';
import { canUse } from '../../../src/infra/services/subscriptionService';

// v1.4 ステージ 4 Phase 4D — meal-logging OCR scan screen.
//
// `submission-ocr-scan.tsx` (community DB contribution flow) を fork、
// meal-logging variant に adapt:
//   1. User 食品ラベル (栄養成分表示) を frame in + 撮影
//   2. expo-camera takePictureAsync で tmp URI 書き出し
//   3. ocrService.recognizeText (ML Kit、 既存 service 流用) で text
//   4. parseNutritionLabel (既存 parser 流用) で structured fields
//   5. useMealLoggingOcrStore.setPendingResult → router.back
//   6. add.tsx (OCR tab) が consumePendingResult → ServingQuantityModal
//      pre-fill
//
// Differences from submission-ocr-scan.tsx:
//   - Store: useMealLoggingOcrStore (NEW、 軽量、 独立 channel)
//     vs useSubmissionScanStore (community DB flow 用)
//   - 後続 flow: add.tsx の OCR tab で meal_log_items insert 候補と
//     して提示 vs submission form で food-submit に register
//
// Failure modes (Stage 3.5 Issue C-2 visibility lift pattern 流用):
//   - Permission denied → fallback view with "カメラを許可する"
//   - OCR module not installed → OcrUnavailableError surface
//   - OCR returns no text → 「読み取れませんでした」 alert
//   - Parser finds nothing → result still stored、 add.tsx で「no
//     fields filled」 UI を表示 (graceful degradation)
//
// Lifecycle (Stage 3.5 Issue C-1 learning 流用):
//   useFocusEffect + cameraKey で focus 戻り毎 CameraView 強制 remount、
//   iOS expo-camera native session lifecycle quirk 防御。
//
// IMPORTANT: ML Kit native module dependency は既存 ocrService が
// 管理、 ここでは追加 native dep なし。 prebuild は既に Mealift
// release infra で済 (memory: native folders are CNG-managed).

export default function ScanLabelScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [permission, requestPermission] = useCameraPermissions();
  const setPendingResult = useMealLoggingOcrStore((s) => s.setPendingResult);
  const setPendingVisionResult = useMealLoggingOcrStore(
    (s) => s.setPendingVisionResult,
  );

  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Stage 3.5 Issue C-1 learning — useFocusEffect + cameraKey で
  // CameraView を focus 戻り毎強制 remount、 iOS expo-camera native
  // session reset を確実にする。
  const [cameraKey, setCameraKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setCameraKey((k) => k + 1);
      return () => {
        // 明示 cleanup 不要、 次 focus 時の cameraKey++ で remount.
      };
    }, []),
  );

  // v1.4 ステージ 4 Phase 4E-2 — Issue B 3-tier fallback helper.
  // OCR is the primary path; if the parser yields nothing usable AND
  // the user is on a Pro plan, we silently retry the same captured
  // image through the Vision Edge Function (judgment α: handed off
  // via the Vision channel of mealLoggingOcrStore, NOT mapped into
  // ParsedNutritionLabel). Vision failure falls through to a manual
  // entry alert — the user is never blocked.
  const runVisionFallback = useCallback(
    async (photoUri: string): Promise<boolean> => {
      if (!canUse('aiNutritionEstimate')) return false;
      try {
        const base64 = await FileSystem.readAsStringAsync(photoUri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const vision = await decomposeFromImage(base64);
        setPendingVisionResult(vision);
        router.back();
        return true;
      } catch (visionError) {
        if (__DEV__) {
          console.error(
            '[scan-label.runVisionFallback] Vision retry failed:',
            visionError,
          );
        }
        return false;
      }
    },
    [setPendingVisionResult],
  );

  const handleCapture = useCallback(async () => {
    if (capturing || processing || !cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        Alert.alert('エラー', '撮影に失敗しました');
        return;
      }
      setCapturing(false);
      setProcessing(true);
      try {
        const ocr = await recognizeText(photo.uri);
        if (!ocr.text || ocr.text.trim().length === 0) {
          // Tier 2 — Vision fallback for Pro users on empty OCR.
          const recovered = await runVisionFallback(photo.uri);
          if (recovered) return;
          // Tier 3 — manual entry.
          Alert.alert(
            '読み取れませんでした',
            '栄養成分表示の文字をはっきり写すか、手入力してください',
          );
          return;
        }
        const parsed = parseNutritionLabel(ocr.text);
        // If the parser found NOTHING (no kcal, no macros), Tier 2
        // Vision fallback also fires — OCR caught text but it wasn't
        // a label panel, so Vision may still recover the dish from
        // the image.
        const hasAnyMacro =
          parsed.calories != null ||
          parsed.proteinG != null ||
          parsed.fatG != null ||
          parsed.carbG != null;
        if (!hasAnyMacro) {
          const recovered = await runVisionFallback(photo.uri);
          if (recovered) return;
        }
        setPendingResult(parsed);
        router.back();
      } catch (e) {
        // Stage 3.5 Issue C-2 visibility lift pattern — error.message
        // を user に露出、 __DEV__ で console.error log path
        if (__DEV__) {
          console.error('[scan-label.handleCapture] OCR pipeline failed:', e);
        }
        if (e instanceof OcrUnavailableError) {
          // Tier 2 — Vision fallback when ML Kit is unavailable.
          const recovered = await runVisionFallback(photo.uri);
          if (recovered) return;
          Alert.alert('OCRサービスが利用できません', e.message);
        } else {
          const msg =
            e instanceof Error
              ? e.message
              : 'OCR処理中にエラーが発生しました';
          Alert.alert('エラー', msg);
        }
      }
    } finally {
      setCapturing(false);
      setProcessing(false);
    }
  }, [capturing, processing, setPendingResult, runVisionFallback]);

  if (!permission) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
      />
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView
        style={[styles.safe, { backgroundColor: colors.background }]}
        edges={['top']}
      >
        <View style={styles.headerBar}>
          <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
            <Ionicons
              name="arrow-back"
              size={24}
              color={colors.textPrimary}
            />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            食品ラベルを撮影
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons
            name="camera-outline"
            size={64}
            color={colors.textTertiary}
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          />
          <Text style={[styles.permissionText, { color: colors.textPrimary }]}>
            カメラへのアクセスが必要です
          </Text>
          <Text
            style={[styles.permissionHint, { color: colors.textSecondary }]}
          >
            栄養成分表示を撮影するにはカメラの権限が必要です
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
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          食品ラベルを撮影
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraContainer}>
        {/* Stage 3.5 Issue C-1 fix — key={cameraKey} で focus 戻り毎
            CameraView を新規 mount、 native session 完全 reset. */}
        <CameraView
          key={cameraKey}
          ref={cameraRef}
          style={styles.camera}
          facing="back"
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={[styles.cornerTL, { borderColor: colors.primary }]} />
            <View style={[styles.cornerTR, { borderColor: colors.primary }]} />
            <View style={[styles.cornerBL, { borderColor: colors.primary }]} />
            <View style={[styles.cornerBR, { borderColor: colors.primary }]} />
          </View>
          {processing && (
            <View
              style={[
                styles.processingOverlay,
                { backgroundColor: colors.background + 'CC' },
              ]}
            >
              <ActivityIndicator size="large" color={colors.primary} />
              <Text
                style={[
                  styles.processingText,
                  { color: colors.textPrimary },
                ]}
              >
                解析中...
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.scanHint, { color: colors.textSecondary }]}>
          栄養成分表示をフレーム内に合わせて撮影
        </Text>
      </View>

      <View
        style={[
          styles.shutterBar,
          { backgroundColor: colors.surface, borderTopColor: colors.border },
        ]}
      >
        <TouchableOpacity
          style={[
            styles.shutterButton,
            {
              backgroundColor:
                capturing || processing ? colors.textTertiary : colors.primary,
            },
          ]}
          onPress={handleCapture}
          disabled={capturing || processing}
          accessibilityRole="button"
          accessibilityLabel="栄養成分表を撮影"
          testID="scan-label-shutter"
        >
          {capturing ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Ionicons name="camera" size={28} color="#FFFFFF" />
          )}
        </TouchableOpacity>
      </View>
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
    paddingVertical: spacing.sm,
  },
  headerTitle: { ...typography.titleMedium },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.md,
  },
  permissionText: { ...typography.titleSmall },
  permissionHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  cameraContainer: { flex: 1 },
  camera: { flex: 1 },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanFrame: {
    width: 320,
    height: 200,
    position: 'relative',
  },
  cornerTL: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 28,
    height: 28,
    borderTopWidth: 4,
    borderLeftWidth: 4,
  },
  cornerTR: {
    position: 'absolute',
    top: 0,
    right: 0,
    width: 28,
    height: 28,
    borderTopWidth: 4,
    borderRightWidth: 4,
  },
  cornerBL: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
  },
  cornerBR: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderBottomWidth: 4,
    borderRightWidth: 4,
  },
  processingOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    gap: spacing.sm,
  },
  processingText: { ...typography.titleSmall },
  scanHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
  shutterBar: {
    paddingVertical: spacing.lg,
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  shutterButton: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
