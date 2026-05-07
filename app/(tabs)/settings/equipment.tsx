import React, { useCallback, useState } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Toast } from '../../../src/components/ui';
import { useProfileStore } from '../../../src/stores/profileStore';
import {
  EQUIPMENT_CATEGORIES,
  type EquipmentKey,
} from '../../../src/constants/equipment';
import {
  listByProfileId,
  setAvailable,
} from '../../../src/infra/repositories/userEquipmentRepository';

// Build 15 / Session 8 / Feature 5-元 — gym equipment registry editor.
// 2-column chip grid of the 8 equipment categories. Tap toggles
// available state with optimistic UI; DB write rolls back + shows a
// toast on failure.
//
// Empty state: if listByProfileId returns [] (legacy bug or migration
// race) the grid renders all 8 chips OFF; toggling ON triggers
// setAvailable's INSERT path so the row gets created on first tap.

export default function EquipmentSettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const profile = useProfileStore((s) => s.profile);
  const [availableSet, setAvailableSet] = useState<Set<EquipmentKey>>(new Set());
  const [errorVisible, setErrorVisible] = useState(false);

  // Refetch on every screen focus so changes pulled from sync (other
  // device) surface here without needing a full unmount.
  useFocusEffect(
    useCallback(() => {
      if (!profile) return;
      let cancelled = false;
      (async () => {
        try {
          const rows = await listByProfileId(profile.id);
          if (cancelled) return;
          const next = new Set<EquipmentKey>();
          for (const row of rows) {
            if (row.available) next.add(row.equipmentKey);
          }
          setAvailableSet(next);
        } catch {
          // silently fail — user sees previous state until retry
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [profile]),
  );

  const handleToggle = useCallback(
    async (key: EquipmentKey) => {
      if (!profile) return;
      const previousState = availableSet.has(key);
      const nextState = !previousState;

      // Optimistic update — UI reflects immediately.
      setAvailableSet((prev) => {
        const next = new Set(prev);
        if (nextState) next.add(key);
        else next.delete(key);
        return next;
      });

      try {
        await setAvailable(profile.id, key, nextState);
      } catch {
        // Roll back the optimistic update on failure.
        setAvailableSet((prev) => {
          const next = new Set(prev);
          if (previousState) next.add(key);
          else next.delete(key);
          return next;
        });
        setErrorVisible(true);
      }
    },
    [profile, availableSet],
  );

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <Toast
        message="保存に失敗しました"
        type="error"
        visible={errorVisible}
        onHide={() => setErrorVisible(false)}
      />
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={28} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>ジム器具</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Card>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
            利用可能な器具
          </Text>
          <Text style={[styles.hint, { color: colors.textTertiary }]}>
            AI メニュー生成の参考として、自宅・ジムで使える器具を選んでください。
          </Text>

          <View style={styles.grid}>
            {EQUIPMENT_CATEGORIES.map((cat) => {
              const selected = availableSet.has(cat.key);
              return (
                <TouchableOpacity
                  key={cat.key}
                  style={[
                    styles.chip,
                    {
                      backgroundColor: selected
                        ? colors.primary
                        : colors.surfaceSecondary,
                      borderColor: selected ? colors.primary : colors.border,
                      borderRadius: radius.md,
                    },
                  ]}
                  onPress={() => handleToggle(cat.key)}
                  activeOpacity={0.6}
                >
                  <Ionicons
                    name={cat.icon}
                    size={22}
                    color={selected ? '#FFFFFF' : colors.textSecondary}
                  />
                  <Text
                    style={[
                      styles.chipLabel,
                      { color: selected ? '#FFFFFF' : colors.textPrimary },
                    ]}
                  >
                    {cat.ja}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </Card>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  title: { ...typography.titleMedium, flex: 1, textAlign: 'center' },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: spacing.xxxxl },
  sectionLabel: { ...typography.titleSmall, marginBottom: spacing.xs },
  hint: { ...typography.bodySmall, marginBottom: spacing.md },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    flexBasis: '48%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  chipLabel: {
    ...typography.bodyMedium,
    flex: 1,
  },
});
