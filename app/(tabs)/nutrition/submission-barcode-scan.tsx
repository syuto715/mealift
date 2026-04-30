import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  useColorScheme,
  TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import {
  CameraView,
  useCameraPermissions,
  type BarcodeScanningResult,
} from 'expo-camera';
import { Ionicons } from '@expo/vector-icons';
import { getColors } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button } from '../../../src/components/ui';
import { useSubmissionScanStore } from '../../../src/stores/submissionScanStore';

// Lightweight barcode scanner for the submission flow.
//
// Distinct from app/(tabs)/nutrition/barcode.tsx (the meal-logging
// scanner) — that one auto-saves to local foods, does OFF lookup,
// and terminates by calling addFood() into a meal slot. The two have
// different missions and we keep them as parallel screens rather
// than a shared component until a third caller emerges.
//
// Capture-and-return only:
//   - Mount camera, request permission if needed
//   - Scan-once gate (prevents double-fire from the rapid camera frames)
//   - On scan: write to submissionScanStore, router.back()
//   - The form picks up the value via the store on focus
//
// barcodeScannerSettings copied from barcode.tsx so the two scanners
// stay in sync on supported types: EAN13/JAN (JP-domestic primary),
// EAN8 (short JP), UPC-A/E (US imports — protein/supplements).

export default function SubmissionBarcodeScanScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [permission, requestPermission] = useCameraPermissions();
  const setPendingBarcode = useSubmissionScanStore((s) => s.setPendingBarcode);

  // scanned ref + state combo: the ref blocks double-dispatch within
  // the same render frame (CameraView fires onBarcodeScanned rapidly);
  // the state drives the visible "scanned" feedback.
  const scannedRef = useRef(false);
  const [scanned, setScanned] = useState(false);

  const handleScan = useCallback(
    (result: BarcodeScanningResult) => {
      if (scannedRef.current) return;
      scannedRef.current = true;
      setScanned(true);
      const value = result.data;
      // Defer the navigation by one tick so the visible feedback
      // (scanned overlay) renders before the screen pops. Without
      // this, the user sees no acknowledgement of the scan.
      setPendingBarcode(value);
      setTimeout(() => router.back(), 200);
    },
    [setPendingBarcode],
  );

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
            バーコードスキャン
          </Text>
          <View style={{ width: 24 }} />
        </View>
        <View style={styles.centered}>
          <Ionicons
            name="camera-outline"
            size={64}
            color={colors.textTertiary}
          />
          <Text
            style={[styles.permissionText, { color: colors.textPrimary }]}
          >
            カメラへのアクセスが必要です
          </Text>
          <Text
            style={[styles.permissionHint, { color: colors.textSecondary }]}
          >
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
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <View style={styles.headerBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={8}>
          <Ionicons name="arrow-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.textPrimary }]}>
          バーコードスキャン
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.cameraContainer}>
        <CameraView
          style={styles.camera}
          facing="back"
          barcodeScannerSettings={{
            barcodeTypes: ['ean13', 'ean8', 'upc_a', 'upc_e'],
          }}
          onBarcodeScanned={scanned ? undefined : handleScan}
        />
        <View style={styles.overlay}>
          <View style={styles.scanFrame}>
            <View style={[styles.cornerTL, { borderColor: colors.primary }]} />
            <View style={[styles.cornerTR, { borderColor: colors.primary }]} />
            <View style={[styles.cornerBL, { borderColor: colors.primary }]} />
            <View style={[styles.cornerBR, { borderColor: colors.primary }]} />
          </View>
          {scanned && (
            <View
              style={[
                styles.successOverlay,
                { backgroundColor: colors.success + 'CC' },
              ]}
            >
              <Ionicons name="checkmark-circle" size={64} color="#FFFFFF" />
              <Text style={styles.successText}>読み取りました</Text>
            </View>
          )}
        </View>
        <Text style={[styles.scanHint, { color: colors.textSecondary }]}>
          バーコードをフレーム内に合わせてください
        </Text>
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
    width: 260,
    height: 160,
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
  successOverlay: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderRadius: 16,
    gap: spacing.sm,
  },
  successText: {
    ...typography.titleSmall,
    color: '#FFFFFF',
  },
  scanHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
