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
import { router } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button } from '../../../src/components/ui';
import { useSubmissionScanStore } from '../../../src/stores/submissionScanStore';
import {
  recognizeText,
  OcrUnavailableError,
} from '../../../src/infra/services/ocrService';
import { parseNutritionLabel } from '../../../src/domain/submission/nutritionLabelParser';

// OCR capture screen for the submission flow's nutrition-label
// extraction. Capture-and-return only:
//   1. User frames the 栄養成分表示 panel
//   2. Tap shutter → expo-camera takePictureAsync writes to a tmp URI
//   3. ocrService.recognizeText runs ML Kit on the URI
//   4. parseNutritionLabel extracts structured fields
//   5. Result stored on submissionScanStore.pendingOcrResult
//   6. router.back() — the form picks up the result via useEffect
//
// Failure modes (all surfaced to user, none silent):
//   - Permission denied → fallback view with "カメラを許可する"
//   - OCR module not installed (OcrUnavailableError) → alert, no-op
//   - OCR runs but returns no recognizable text → alert, no-op
//   - Parser finds nothing → result still gets stored; the form
//     surfaces "no fields filled" feedback to the user
//
// IMPORTANT: accuracy of the parser depends on real OCR output
// quality. Synthetic test fixtures cannot validate field extraction
// against real package labels. Manual verification on the 5/1+ build
// across 5-10 distinct products (conveni / supplement / packaged
// food / restaurant menu) is required before this is shipped to
// users.

export default function SubmissionOcrScanScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [permission, requestPermission] = useCameraPermissions();
  const setPendingOcrResult = useSubmissionScanStore(
    (s) => s.setPendingOcrResult,
  );

  const cameraRef = useRef<CameraView>(null);
  const [capturing, setCapturing] = useState(false);
  const [processing, setProcessing] = useState(false);

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
          Alert.alert(
            '読み取れませんでした',
            '栄養成分表示の文字をはっきり写すようにしてください',
          );
          return;
        }
        const parsed = parseNutritionLabel(ocr.text);
        setPendingOcrResult(parsed);
        router.back();
      } catch (e) {
        if (e instanceof OcrUnavailableError) {
          Alert.alert('OCRサービスが利用できません', e.message);
        } else {
          Alert.alert(
            'エラー',
            e instanceof Error
              ? e.message
              : 'OCR処理中にエラーが発生しました',
          );
        }
      }
    } finally {
      setCapturing(false);
      setProcessing(false);
    }
  }, [capturing, processing, setPendingOcrResult]);

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
            栄養成分表を撮影
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons
            name="camera-outline"
            size={64}
            color={colors.textTertiary}
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
          栄養成分表を撮影
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
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
          testID="submission-ocr-shutter"
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
