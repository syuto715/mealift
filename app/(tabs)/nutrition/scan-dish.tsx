import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
// expo-file-system 19 moved the simple readAsStringAsync API to the
// `legacy` subpath. The new File-based API is more capable but
// requires a constructor + .base64() call; the legacy form is a
// closer one-liner that matches the read pattern in scan-label.tsx,
// so we use it here intentionally.
import * as FileSystem from 'expo-file-system/legacy';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button } from '../../../src/components/ui';
import { useMealLoggingOcrStore } from '../../../src/stores/mealLoggingOcrStore';
import {
  decomposeFromImage,
  AIError,
} from '../../../src/infra/services/aiNutritionService';
import { canUse } from '../../../src/infra/services/subscriptionService';

// v1.4 ステージ 4 Phase 4C-2 — meal-logging Vision (dish photo) scan
// screen.
//
// Sibling of `scan-label.tsx` (Phase 4D OCR pathway): captures a dish
// photo, sends base64 to the `estimate-nutrition-vision` Edge
// Function, and routes the returned `RecipeDecomposition` to
// `useMealLoggingOcrStore.setPendingVisionResult` so that `add.tsx`
// pre-fills `ServingQuantityModal` on focus return.
//
// Gating: Pro plan only (judgment α + entitlement reuse in Turn 2
// recon — `canUse('aiNutritionEstimate')` is the existing AI gate;
// Vision shares it so Pro upsell copy stays consistent with text AI
// estimate). Free / trial users are redirected back with a hint —
// the calling sub-CTA in `nutrition/index.tsx` (Phase 4C-3) also
// disables itself client-side, so this is defense in depth for
// deep-link entries.
//
// Capture quality (judgment C-3 in Turn 2 recon):
//   - quality = 0.4 (vs 0.8 in scan-label.tsx) — base64-encoded jpeg
//     at quality 0.4 typically lands at 270-680KB for iPhone photos,
//     comfortably under the EF's 1.3M base64 length cap. Higher
//     quality is wasted on multimodal Gemini which downsamples
//     internally anyway.
//
// Lifecycle: same `useFocusEffect + cameraKey` pattern as
// `scan-label.tsx` and `barcode.tsx` — forces a fresh CameraView
// mount on every focus to bypass the expo-camera iOS native session
// quirk (Stage 3.5 Issue C-1 learning).

export default function ScanDishScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  // Codex pass 2 Critical fix — preserve meal type / date context all
  // the way through to add.tsx. scan-dish is opened from
  // nutrition/index.tsx's meal-type sub-CTA, which carries those
  // params. Routing back with `router.back()` would land on
  // nutrition/index.tsx, leaving the Vision result orphaned in the
  // store until *some other* add.tsx focus event picks it up against
  // a different meal/date. `router.replace` to add.tsx forces the
  // consume to fire on the correct context.
  const params = useLocalSearchParams<{ mealType?: string; date?: string }>();
  const mealTypeParam = params.mealType ?? 'breakfast';
  const dateParam = params.date;

  const [permission, requestPermission] = useCameraPermissions();
  const setPendingVisionResult = useMealLoggingOcrStore(
    (s) => s.setPendingVisionResult,
  );

  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Defense-in-depth Pro gate. The sub-CTA in nutrition/index.tsx
  // (Phase 4C-3) is the primary gate; this guard catches direct
  // navigation (deep link, internal refactor, etc.).
  useEffect(() => {
    if (!canUse('aiNutritionEstimate')) {
      Alert.alert(
        'Proプラン限定',
        'AI料理スキャンはProプランでご利用いただけます',
        [
          { text: 'キャンセル', onPress: () => router.back() },
          {
            text: 'プランを見る',
            onPress: () => {
              router.back();
              router.push('/(tabs)/settings/subscription');
            },
          },
        ],
      );
    }
  }, []);

  const [cameraKey, setCameraKey] = useState(0);
  useFocusEffect(
    useCallback(() => {
      setCameraKey((k) => k + 1);
      return () => {
        // Cleanup not needed — next focus's cameraKey++ remounts.
      };
    }, []),
  );

  const handleCapture = useCallback(async () => {
    if (capturing || processing || !cameraRef.current) return;
    setCapturing(true);
    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.4,
        skipProcessing: false,
      });
      if (!photo?.uri) {
        Alert.alert('エラー', '撮影に失敗しました');
        return;
      }
      setCapturing(false);
      setProcessing(true);
      try {
        const imageBase64 = await FileSystem.readAsStringAsync(photo.uri, {
          encoding: FileSystem.EncodingType.Base64,
        });
        const vision = await decomposeFromImage(imageBase64);
        setPendingVisionResult(vision);
        // Codex pass 2 Critical fix — go to add.tsx with the original
        // meal context, not back to home, so the consume happens in
        // the right place.
        router.replace({
          pathname: '/(tabs)/nutrition/add',
          params: {
            mealType: mealTypeParam,
            ...(dateParam ? { date: dateParam } : {}),
          },
        });
      } catch (e) {
        if (__DEV__) {
          console.error('[scan-dish.handleCapture] Vision pipeline failed:', e);
        }
        if (e instanceof AIError) {
          // Pro gate / quota / 413 / gemini_error — surface the
          // server-supplied Japanese message verbatim (Pattern 11
          // visibility 3-tier).
          Alert.alert('AI料理スキャン', e.message);
        } else {
          const msg =
            e instanceof Error
              ? e.message
              : '画像処理中にエラーが発生しました';
          Alert.alert('エラー', msg);
        }
      }
    } finally {
      setCapturing(false);
      setProcessing(false);
    }
  }, [capturing, processing, setPendingVisionResult, mealTypeParam, dateParam]);

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
            <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
            料理を撮影
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
            料理を撮影するにはカメラの権限が必要です
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
          料理を撮影
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraContainer}>
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
                style={[styles.processingText, { color: colors.textPrimary }]}
              >
                AIが料理を分析中...
              </Text>
            </View>
          )}
        </View>
        <Text style={[styles.scanHint, { color: colors.textSecondary }]}>
          料理全体をフレーム内に収めて撮影
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
          accessibilityLabel="料理を撮影"
          testID="scan-dish-shutter"
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
    height: 240,
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
