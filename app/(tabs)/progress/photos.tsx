import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  useColorScheme,
  Dimensions,
  Alert,
  Modal as RNModal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Button, Card, BottomSheet, SegmentedControl } from '../../../src/components/ui';
import { canUse } from '../../../src/infra/services/subscriptionService';
import { useSubscription } from '../../../src/hooks/useSubscription';
import {
  historyWindowDaysFor,
  canAddProgressPhoto,
  FREE_PROGRESS_PHOTO_LIMIT,
} from '../../../src/domain/subscription/gates';
import { UpgradePromptModal } from '../../../src/components/subscription/UpgradePromptModal';
import { useProfileStore } from '../../../src/stores/profileStore';
import { ProgressPhoto, PoseType } from '../../../src/types/progressPhoto';
import {
  getAllPhotos,
  addProgressPhoto,
  deleteProgressPhoto,
  pickPhoto,
  takePhoto,
  persistPhoto,
  PhotoLimitExceededError,
} from '../../../src/infra/repositories/progressPhotoRepository';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const GRID_GAP = spacing.xs;
const GRID_COLUMNS = 3;
const TILE_SIZE = (SCREEN_WIDTH - spacing.lg * 2 - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS;

const POSE_SEGMENTS = [
  { label: '前面', value: 'front' },
  { label: '側面', value: 'side' },
  { label: '背面', value: 'back' },
];

// ---------------------------------------------------------------------------
// Photo Grid Screen
// ---------------------------------------------------------------------------

export default function PhotosScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const hasAccess = canUse('progressPhotos');
  const profile = useProfileStore((s) => s.profile);

  const [photos, setPhotos] = useState<ProgressPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [addSheetVisible, setAddSheetVisible] = useState(false);
  const [poseType, setPoseType] = useState<PoseType>('front');
  const [compareMode, setCompareMode] = useState(false);
  const [selectedPhotos, setSelectedPhotos] = useState<ProgressPhoto[]>([]);
  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerPhoto, setViewerPhoto] = useState<ProgressPhoto | null>(null);
  const [upgradeVisible, setUpgradeVisible] = useState(false);

  const { status: planStatus } = useSubscription();
  const historyWindowDays = historyWindowDaysFor(planStatus);

  const loadPhotos = useCallback(async () => {
    if (!profile?.id) return;
    try {
      const data = await getAllPhotos(profile.id, 200, historyWindowDays);
      setPhotos(data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [profile?.id, historyWindowDays]);

  useEffect(() => {
    loadPhotos();
  }, [loadPhotos]);

  const handlePickImage = useCallback(
    async (source: 'library' | 'camera') => {
      if (!profile?.id) return;
      if (!canAddProgressPhoto(planStatus, photos.length)) {
        setAddSheetVisible(false);
        setUpgradeVisible(true);
        return;
      }
      const uri = source === 'library' ? await pickPhoto() : await takePhoto();
      if (!uri) return;

      try {
        const savedUri = await persistPhoto(uri);
        await addProgressPhoto(
          {
            profileId: profile.id,
            date: format(new Date(), 'yyyy-MM-dd'),
            photoUri: savedUri,
            poseType,
          },
          planStatus,
        );
        setAddSheetVisible(false);
        loadPhotos();
      } catch (e) {
        if (e instanceof PhotoLimitExceededError) {
          setAddSheetVisible(false);
          setUpgradeVisible(true);
          return;
        }
        Alert.alert('エラー', '写真の保存に失敗しました。');
      }
    },
    [profile?.id, poseType, loadPhotos, planStatus, photos.length],
  );

  const handleAddTap = useCallback(() => {
    if (!canAddProgressPhoto(planStatus, photos.length)) {
      setUpgradeVisible(true);
      return;
    }
    setAddSheetVisible(true);
  }, [planStatus, photos.length]);

  const handleDelete = useCallback(
    (photo: ProgressPhoto) => {
      Alert.alert('写真を削除', 'この写真を削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            await deleteProgressPhoto(photo.id);
            loadPhotos();
            setViewerVisible(false);
          },
        },
      ]);
    },
    [loadPhotos],
  );

  const handlePhotoPress = useCallback(
    (photo: ProgressPhoto) => {
      if (compareMode) {
        setSelectedPhotos((prev) => {
          if (prev.find((p) => p.id === photo.id)) {
            return prev.filter((p) => p.id !== photo.id);
          }
          if (prev.length >= 2) {
            return [prev[1], photo];
          }
          return [...prev, photo];
        });
      } else {
        setViewerPhoto(photo);
        setViewerVisible(true);
      }
    },
    [compareMode],
  );

  // ---- Locked state ----
  if (!hasAccess) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.lockedContainer}>
          <View style={[styles.lockIconContainer, { backgroundColor: colors.surfaceSecondary }]}>
            <Ionicons name="lock-closed" size={48} color={colors.textTertiary} />
          </View>
          <Text style={[styles.lockedTitle, { color: colors.textPrimary }]}>進捗写真</Text>
          <Text style={[styles.lockedMessage, { color: colors.textSecondary }]}>
            Plus プランで利用可能
          </Text>
          <Text style={[styles.lockedDescription, { color: colors.textTertiary }]}>
            定期的に写真を撮影して、体の変化を視覚的に記録しましょう。
          </Text>
          <Button
            title="プランを見る"
            onPress={() => router.push('/(tabs)/settings/subscription')}
            variant="primary"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Compare mode ----
  if (compareMode && selectedPhotos.length === 2) {
    return (
      <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => {
              setCompareMode(false);
              setSelectedPhotos([]);
            }}
            style={styles.headerBtn}
          >
            <Ionicons name="close" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.textPrimary }]}>比較</Text>
          <View style={styles.headerBtn} />
        </View>
        <View style={styles.compareContainer}>
          {selectedPhotos.map((photo) => (
            <View key={photo.id} style={styles.compareItem}>
              <Image
                source={{ uri: photo.photoUri }}
                style={styles.compareImage}
                contentFit="cover"
              />
              <Text style={[styles.compareDate, { color: colors.textSecondary }]}>
                {photo.date}
              </Text>
            </View>
          ))}
        </View>
        <View style={styles.compareActions}>
          <Button
            title="やり直す"
            onPress={() => setSelectedPhotos([])}
            variant="outline"
          />
          <Button
            title="終了"
            onPress={() => {
              setCompareMode(false);
              setSelectedPhotos([]);
            }}
            variant="primary"
          />
        </View>
      </SafeAreaView>
    );
  }

  // ---- Main grid ----
  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.headerBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>進捗写真</Text>
        <TouchableOpacity
          onPress={() => {
            if (compareMode) {
              setCompareMode(false);
              setSelectedPhotos([]);
            } else {
              setCompareMode(true);
              setSelectedPhotos([]);
            }
          }}
          style={styles.headerBtn}
        >
          <Ionicons
            name={compareMode ? 'close' : 'git-compare-outline'}
            size={22}
            color={compareMode ? colors.error : colors.textPrimary}
          />
        </TouchableOpacity>
      </View>

      {compareMode && (
        <View style={[styles.compareBanner, { backgroundColor: colors.primary + '15' }]}>
          <Text style={[styles.compareBannerText, { color: colors.primary }]}>
            比較する写真を2枚選択してください ({selectedPhotos.length}/2)
          </Text>
        </View>
      )}

      {photos.length === 0 && !loading ? (
        <View style={styles.emptyContainer}>
          <Ionicons name="camera-outline" size={48} color={colors.textTertiary} />
          <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
            まだ写真がありません
          </Text>
          <Text style={[styles.emptyHint, { color: colors.textTertiary }]}>
            定期的に写真を撮影して、体の変化を記録しましょう。{'\n'}
            前面・側面・背面の3枚がおすすめです。
          </Text>
          <Button
            title="写真を追加"
            onPress={handleAddTap}
            variant="primary"
          />
        </View>
      ) : (
        <FlatList
          data={photos}
          keyExtractor={(item) => item.id}
          numColumns={GRID_COLUMNS}
          contentContainerStyle={styles.gridContent}
          columnWrapperStyle={styles.gridRow}
          renderItem={({ item }) => {
            const isSelected = selectedPhotos.some((p) => p.id === item.id);
            return (
              <TouchableOpacity
                onPress={() => handlePhotoPress(item)}
                activeOpacity={0.8}
                style={[
                  styles.gridTile,
                  isSelected && { borderWidth: 3, borderColor: colors.primary },
                ]}
              >
                <Image
                  source={{ uri: item.photoUri }}
                  style={styles.gridImage}
                  contentFit="cover"
                />
                <View style={[styles.tileDateOverlay, { backgroundColor: 'rgba(0,0,0,0.5)' }]}>
                  <Text style={styles.tileDateText}>{item.date}</Text>
                </View>
                <View style={[styles.tilePoseBadge, { backgroundColor: colors.primary }]}>
                  <Text style={styles.tilePoseText}>
                    {item.poseType === 'front' ? '前' : item.poseType === 'side' ? '横' : '後'}
                  </Text>
                </View>
                {isSelected && (
                  <View style={[styles.selectedOverlay, { backgroundColor: colors.primary + '30' }]}>
                    <Ionicons name="checkmark-circle" size={28} color={colors.primary} />
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* FAB */}
      {!compareMode && (
        <TouchableOpacity
          style={[styles.fab, { backgroundColor: colors.primary }]}
          onPress={handleAddTap}
          activeOpacity={0.8}
        >
          <Ionicons name="add" size={28} color="#fff" />
        </TouchableOpacity>
      )}

      {/* Add Photo Sheet */}
      <BottomSheet
        visible={addSheetVisible}
        onClose={() => setAddSheetVisible(false)}
        title="写真を追加"
      >
        <View style={styles.sheetContent}>
          <Text style={[styles.sheetLabel, { color: colors.textSecondary }]}>ポーズ</Text>
          <SegmentedControl
            segments={POSE_SEGMENTS}
            selectedValue={poseType}
            onValueChange={(v) => setPoseType(v as PoseType)}
          />

          <View style={styles.sheetActions}>
            <Button
              title="カメラで撮影"
              onPress={() => handlePickImage('camera')}
              variant="primary"
              fullWidth
              icon={<Ionicons name="camera-outline" size={20} color="#fff" />}
            />
            <Button
              title="ライブラリから選択"
              onPress={() => handlePickImage('library')}
              variant="outline"
              fullWidth
              icon={<Ionicons name="images-outline" size={20} color={colors.primary} />}
            />
          </View>
        </View>
      </BottomSheet>

      {/* Photo Viewer */}
      <RNModal
        visible={viewerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setViewerVisible(false)}
      >
        <View style={[styles.viewer, { backgroundColor: 'rgba(0,0,0,0.95)' }]}>
          <SafeAreaView style={styles.viewerSafe} edges={['top', 'bottom']}>
            <View style={styles.viewerHeader}>
              <TouchableOpacity onPress={() => setViewerVisible(false)} style={styles.viewerBtn}>
                <Ionicons name="close" size={28} color="#fff" />
              </TouchableOpacity>
              <Text style={styles.viewerDate}>
                {viewerPhoto?.date}
              </Text>
              <TouchableOpacity
                onPress={() => viewerPhoto && handleDelete(viewerPhoto)}
                style={styles.viewerBtn}
              >
                <Ionicons name="trash-outline" size={24} color="#FF3B30" />
              </TouchableOpacity>
            </View>

            {viewerPhoto && (
              <Image
                source={{ uri: viewerPhoto.photoUri }}
                style={styles.viewerImage}
                contentFit="contain"
              />
            )}

            {viewerPhoto && (
              <View style={styles.viewerInfo}>
                <Text style={styles.viewerPose}>
                  {viewerPhoto.poseType === 'front'
                    ? '前面'
                    : viewerPhoto.poseType === 'side'
                      ? '側面'
                      : '背面'}
                </Text>
              </View>
            )}
          </SafeAreaView>
        </View>
      </RNModal>

      <UpgradePromptModal
        visible={upgradeVisible}
        onClose={() => setUpgradeVisible(false)}
        featureName="進捗写真の無制限保存"
        featureDescription={`Free プランでは ${FREE_PROGRESS_PHOTO_LIMIT} 枚までの保存に制限されています。Plus で無制限に記録できます。`}
        requiredPlan="plus"
        benefits={['無制限の進捗写真', 'ビフォーアフター比較', '月別アルバム']}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  headerBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.titleMedium,
  },
  compareBanner: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginHorizontal: spacing.lg,
    borderRadius: radius.sm,
    marginBottom: spacing.sm,
  },
  compareBannerText: {
    ...typography.bodySmall,
    textAlign: 'center',
  },
  gridContent: {
    padding: spacing.lg,
    paddingBottom: 100,
  },
  gridRow: {
    gap: GRID_GAP,
    marginBottom: GRID_GAP,
  },
  gridTile: {
    width: TILE_SIZE,
    height: TILE_SIZE * 1.33,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  gridImage: {
    width: '100%',
    height: '100%',
  },
  tileDateOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 2,
    paddingHorizontal: spacing.xs,
  },
  tileDateText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '500',
  },
  tilePoseBadge: {
    position: 'absolute',
    top: spacing.xs,
    right: spacing.xs,
    width: 22,
    height: 22,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tilePoseText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: '700',
  },
  selectedOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    bottom: spacing.xxl,
    right: spacing.lg,
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    gap: spacing.md,
  },
  emptyTitle: { ...typography.titleSmall },
  emptyHint: {
    ...typography.bodySmall,
    textAlign: 'center',
    lineHeight: 20,
  },
  sheetContent: {
    gap: spacing.lg,
  },
  sheetLabel: {
    ...typography.labelMedium,
  },
  sheetActions: {
    gap: spacing.sm,
  },
  compareContainer: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
  compareItem: {
    flex: 1,
    gap: spacing.xs,
  },
  compareImage: {
    flex: 1,
    borderRadius: radius.md,
  },
  compareDate: {
    ...typography.labelSmall,
    textAlign: 'center',
  },
  compareActions: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    justifyContent: 'center',
  },
  lockedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxxl,
    gap: spacing.lg,
  },
  lockIconContainer: {
    width: 96,
    height: 96,
    borderRadius: radius.full,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  lockedTitle: { ...typography.titleLarge },
  lockedMessage: { ...typography.titleSmall },
  lockedDescription: {
    ...typography.bodyMedium,
    textAlign: 'center',
    lineHeight: 22,
  },
  viewer: {
    flex: 1,
  },
  viewerSafe: {
    flex: 1,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  viewerBtn: {
    width: 44,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerDate: {
    color: '#fff',
    ...typography.titleSmall,
  },
  viewerImage: {
    flex: 1,
  },
  viewerInfo: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  viewerPose: {
    color: '#fff',
    ...typography.labelMedium,
  },
});
