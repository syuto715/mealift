import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ScrollView,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  useColorScheme,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getColors, radius } from '../../../src/theme/tokens';
import { typography } from '../../../src/theme/typography';
import { spacing } from '../../../src/theme/spacing';
import { Card, Button, Modal } from '../../../src/components/ui';
import {
  NotificationSettings,
  NotificationTime,
  DEFAULT_SETTINGS,
  DAY_LABELS,
  formatTime,
  loadNotificationSettings,
  persistNotificationSettings,
  syncNotifications,
  requestNotificationPermissions,
} from '../../../src/infra/services/notificationService';
import { useProfileStore } from '../../../src/stores/profileStore';

// ---------------------------------------------------------------------------
// Time Picker Modal
// ---------------------------------------------------------------------------

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  value: NotificationTime;
  onConfirm: (time: NotificationTime) => void;
  title: string;
}

function TimePickerModal({ visible, onClose, value, onConfirm, title }: TimePickerModalProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const [hour, setHour] = useState(value.hour);
  const [minute, setMinute] = useState(value.minute);

  useEffect(() => {
    if (visible) {
      setHour(value.hour);
      setMinute(value.minute);
    }
  }, [visible, value.hour, value.minute]);

  const adjustHour = (delta: number) => {
    setHour((h) => (h + delta + 24) % 24);
  };

  const adjustMinute = (delta: number) => {
    setMinute((m) => {
      const next = m + delta;
      if (next < 0) return 55;
      if (next > 55) return 0;
      return next;
    });
  };

  return (
    <Modal visible={visible} onClose={onClose} title={title}>
      <View style={tpStyles.row}>
        <View style={tpStyles.column}>
          <TouchableOpacity
            style={[tpStyles.arrowBtn, { backgroundColor: colors.background }]}
            onPress={() => adjustHour(1)}
          >
            <Ionicons name="chevron-up" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[tpStyles.number, { color: colors.textPrimary }]}>
            {String(hour).padStart(2, '0')}
          </Text>
          <TouchableOpacity
            style={[tpStyles.arrowBtn, { backgroundColor: colors.background }]}
            onPress={() => adjustHour(-1)}
          >
            <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[tpStyles.unit, { color: colors.textTertiary }]}>時</Text>
        </View>

        <Text style={[tpStyles.colon, { color: colors.textPrimary }]}>:</Text>

        <View style={tpStyles.column}>
          <TouchableOpacity
            style={[tpStyles.arrowBtn, { backgroundColor: colors.background }]}
            onPress={() => adjustMinute(5)}
          >
            <Ionicons name="chevron-up" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[tpStyles.number, { color: colors.textPrimary }]}>
            {String(minute).padStart(2, '0')}
          </Text>
          <TouchableOpacity
            style={[tpStyles.arrowBtn, { backgroundColor: colors.background }]}
            onPress={() => adjustMinute(-5)}
          >
            <Ionicons name="chevron-down" size={24} color={colors.textPrimary} />
          </TouchableOpacity>
          <Text style={[tpStyles.unit, { color: colors.textTertiary }]}>分</Text>
        </View>
      </View>

      <Button
        title="完了"
        onPress={() => {
          onConfirm({ hour, minute });
          onClose();
        }}
        variant="primary"
        fullWidth
      />
    </Modal>
  );
}

const tpStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.lg,
    marginBottom: spacing.xl,
  },
  column: {
    alignItems: 'center',
    gap: spacing.sm,
  },
  arrowBtn: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  number: {
    ...typography.displayMedium,
    fontVariant: ['tabular-nums'],
    minWidth: 56,
    textAlign: 'center',
  },
  colon: {
    ...typography.displayMedium,
    marginBottom: 28,
  },
  unit: {
    ...typography.labelMedium,
  },
});

// ---------------------------------------------------------------------------
// Day Selector
// ---------------------------------------------------------------------------

interface DaySelectorProps {
  selectedDays: number[];
  onToggleDay: (day: number) => void;
}

function DaySelector({ selectedDays, onToggleDay }: DaySelectorProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <View style={dsStyles.row}>
      {DAY_LABELS.map((label, idx) => {
        const selected = selectedDays.includes(idx);
        return (
          <TouchableOpacity
            key={idx}
            style={[
              dsStyles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.background,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
            onPress={() => onToggleDay(idx)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                dsStyles.chipText,
                { color: selected ? '#fff' : colors.textSecondary },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const dsStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: spacing.xs,
    justifyContent: 'center',
  },
  chip: {
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  chipText: {
    ...typography.labelMedium,
  },
});

// ---------------------------------------------------------------------------
// Single Day Picker
// ---------------------------------------------------------------------------

interface SingleDayPickerProps {
  value: number;
  onChange: (day: number) => void;
}

function SingleDayPicker({ value, onChange }: SingleDayPickerProps) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  return (
    <View style={dsStyles.row}>
      {DAY_LABELS.map((label, idx) => {
        const selected = idx === value;
        return (
          <TouchableOpacity
            key={idx}
            style={[
              dsStyles.chip,
              {
                backgroundColor: selected ? colors.primary : colors.background,
                borderColor: selected ? colors.primary : colors.border,
              },
            ]}
            onPress={() => onChange(idx)}
            activeOpacity={0.7}
          >
            <Text
              style={[
                dsStyles.chipText,
                { color: selected ? '#fff' : colors.textSecondary },
              ]}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Notification Settings Screen
// ---------------------------------------------------------------------------

export default function NotificationSettingsScreen() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);
  const [loaded, setLoaded] = useState(false);

  // Time picker state
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTitle, setPickerTitle] = useState('');
  const [pickerValue, setPickerValue] = useState<NotificationTime>({ hour: 0, minute: 0 });
  const [pickerTarget, setPickerTarget] = useState<string>('');

  useEffect(() => {
    (async () => {
      const s = await loadNotificationSettings();
      setSettings(s);
      setLoaded(true);
    })();
  }, []);

  // Persist on every keystroke/toggle so settings are durable if the user
  // force-kills the app. The actual reschedule is deferred to screen blur
  // (see useFocusEffect below) so a burst of toggles doesn't produce a
  // cancel+schedule storm that can leave duplicates in the OS queue.
  const save = useCallback(
    async (updated: NotificationSettings) => {
      setSettings(updated);
      await persistNotificationSettings(updated);
    },
    [],
  );

  // Reschedule once when the screen loses focus. We capture the latest
  // settings via a ref to avoid re-registering the focus effect on every edit.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  useFocusEffect(
    useCallback(() => {
      return () => {
        // onBlur — sync once with the latest settings snapshot. Profile is
        // read from the store so trial schedules stay aligned.
        const profile = useProfileStore.getState().profile;
        void syncNotifications({ settings: settingsRef.current, profile });
      };
    }, []),
  );

  const openTimePicker = useCallback(
    (target: string, title: string, currentValue: NotificationTime) => {
      setPickerTarget(target);
      setPickerTitle(title);
      setPickerValue(currentValue);
      setPickerVisible(true);
    },
    [],
  );

  const handleTimeConfirm = useCallback(
    (time: NotificationTime) => {
      const updated = JSON.parse(JSON.stringify(settings)) as NotificationSettings;
      switch (pickerTarget) {
        case 'weight':
          updated.weightReminder.time = time;
          break;
        case 'meal-breakfast':
          updated.mealReminder.breakfastTime = time;
          break;
        case 'meal-lunch':
          updated.mealReminder.lunchTime = time;
          break;
        case 'meal-dinner':
          updated.mealReminder.dinnerTime = time;
          break;
        case 'training':
          updated.trainingReminder.time = time;
          break;
        case 'weekly':
          updated.weeklyReport.time = time;
          break;
      }
      save(updated);
    },
    [settings, pickerTarget, save],
  );

  const handleToggle = useCallback(
    async (
      key: 'weightReminder' | 'mealReminder' | 'trainingReminder' | 'weeklyReport',
      enabled: boolean,
    ) => {
      // Request permission on first enable
      if (enabled) {
        const granted = await requestNotificationPermissions();
        if (!granted) {
          Alert.alert(
            '通知の許可が必要です',
            '設定アプリから通知を許可してください。',
          );
          return;
        }
      }
      const updated = { ...settings, [key]: { ...settings[key], enabled } };
      save(updated);
    },
    [settings, save],
  );

  const handleToggleDay = useCallback(
    (day: number) => {
      const current = settings.trainingReminder.days;
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort();
      save({
        ...settings,
        trainingReminder: { ...settings.trainingReminder, days: next },
      });
    },
    [settings, save],
  );

  const handleWeeklyDayChange = useCallback(
    (day: number) => {
      save({
        ...settings,
        weeklyReport: { ...settings.weeklyReport, dayOfWeek: day },
      });
    },
    [settings, save],
  );

  if (!loaded) return null;

  return (
    <SafeAreaView style={[styles.safe, { backgroundColor: colors.background }]} edges={['top']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.textPrimary} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: colors.textPrimary }]}>通知設定</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        {/* Weight Reminder */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          体重記録
        </Text>
        <Card padding="none">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="scale-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
              毎日リマインド
            </Text>
            <TouchableOpacity
              style={[styles.timeBadge, { backgroundColor: colors.background }]}
              onPress={() =>
                openTimePicker('weight', '体重リマインド時刻', settings.weightReminder.time)
              }
            >
              <Text style={[styles.timeText, { color: colors.primary }]}>
                {formatTime(settings.weightReminder.time)}
              </Text>
            </TouchableOpacity>
            <Switch
              value={settings.weightReminder.enabled}
              onValueChange={(v) => handleToggle('weightReminder', v)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={settings.weightReminder.enabled ? colors.primary : colors.surface}
            />
          </View>
        </Card>

        {/* Meal Reminders */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          食事記録
        </Text>
        <Card padding="none">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="restaurant-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
              食事リマインド
            </Text>
            <Switch
              value={settings.mealReminder.enabled}
              onValueChange={(v) => handleToggle('mealReminder', v)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={settings.mealReminder.enabled ? colors.primary : colors.surface}
            />
          </View>
          {settings.mealReminder.enabled && (
            <View style={[styles.mealTimeSection, { borderBottomColor: colors.border }]}>
              <TouchableOpacity
                style={[styles.mealTimeItem, { backgroundColor: colors.background }]}
                onPress={() =>
                  openTimePicker('meal-breakfast', '朝食リマインド時刻', settings.mealReminder.breakfastTime)
                }
              >
                <Text style={[styles.mealTimeLabel, { color: colors.textSecondary }]}>朝食</Text>
                <Text style={[styles.mealTimeValue, { color: colors.primary }]}>
                  {formatTime(settings.mealReminder.breakfastTime)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mealTimeItem, { backgroundColor: colors.background }]}
                onPress={() =>
                  openTimePicker('meal-lunch', '昼食リマインド時刻', settings.mealReminder.lunchTime)
                }
              >
                <Text style={[styles.mealTimeLabel, { color: colors.textSecondary }]}>昼食</Text>
                <Text style={[styles.mealTimeValue, { color: colors.primary }]}>
                  {formatTime(settings.mealReminder.lunchTime)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.mealTimeItem, { backgroundColor: colors.background }]}
                onPress={() =>
                  openTimePicker('meal-dinner', '夕食リマインド時刻', settings.mealReminder.dinnerTime)
                }
              >
                <Text style={[styles.mealTimeLabel, { color: colors.textSecondary }]}>夕食</Text>
                <Text style={[styles.mealTimeValue, { color: colors.primary }]}>
                  {formatTime(settings.mealReminder.dinnerTime)}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </Card>

        {/* Training Reminder */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          トレーニング
        </Text>
        <Card padding="none">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="barbell-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
              トレーニングリマインド
            </Text>
            <TouchableOpacity
              style={[styles.timeBadge, { backgroundColor: colors.background }]}
              onPress={() =>
                openTimePicker('training', 'トレーニング時刻', settings.trainingReminder.time)
              }
            >
              <Text style={[styles.timeText, { color: colors.primary }]}>
                {formatTime(settings.trainingReminder.time)}
              </Text>
            </TouchableOpacity>
            <Switch
              value={settings.trainingReminder.enabled}
              onValueChange={(v) => handleToggle('trainingReminder', v)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={settings.trainingReminder.enabled ? colors.primary : colors.surface}
            />
          </View>
          {settings.trainingReminder.enabled && (
            <View style={styles.daySection}>
              <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>
                曜日を選択
              </Text>
              <DaySelector
                selectedDays={settings.trainingReminder.days}
                onToggleDay={handleToggleDay}
              />
            </View>
          )}
        </Card>

        {/* Weekly Report */}
        <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
          週次レポート
        </Text>
        <Card padding="none">
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <Ionicons name="bar-chart-outline" size={22} color={colors.textSecondary} />
            <Text style={[styles.rowLabel, { color: colors.textPrimary }]}>
              レポート通知
            </Text>
            <TouchableOpacity
              style={[styles.timeBadge, { backgroundColor: colors.background }]}
              onPress={() =>
                openTimePicker('weekly', '週次レポート時刻', settings.weeklyReport.time)
              }
            >
              <Text style={[styles.timeText, { color: colors.primary }]}>
                {formatTime(settings.weeklyReport.time)}
              </Text>
            </TouchableOpacity>
            <Switch
              value={settings.weeklyReport.enabled}
              onValueChange={(v) => handleToggle('weeklyReport', v)}
              trackColor={{ false: colors.border, true: colors.primaryLight }}
              thumbColor={settings.weeklyReport.enabled ? colors.primary : colors.surface}
            />
          </View>
          {settings.weeklyReport.enabled && (
            <View style={styles.daySection}>
              <Text style={[styles.dayLabel, { color: colors.textSecondary }]}>
                配信曜日
              </Text>
              <SingleDayPicker
                value={settings.weeklyReport.dayOfWeek}
                onChange={handleWeeklyDayChange}
              />
            </View>
          )}
        </Card>

        <Text style={[styles.hint, { color: colors.textTertiary }]}>
          通知はデバイスのローカルスケジュールで配信されます。{'\n'}
          通知が届かない場合は、端末の設定からミーリフトの通知を許可してください。
        </Text>
      </ScrollView>

      <TimePickerModal
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        value={pickerValue}
        onConfirm={handleTimeConfirm}
        title={pickerTitle}
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
  backBtn: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    ...typography.titleMedium,
  },
  scroll: { flex: 1 },
  content: {
    padding: spacing.lg,
    gap: spacing.md,
    paddingBottom: spacing.xxxxl,
  },
  sectionLabel: {
    ...typography.labelMedium,
    marginTop: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    gap: spacing.md,
    borderBottomWidth: 0,
  },
  rowLabel: {
    ...typography.bodyMedium,
    flex: 1,
  },
  timeBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.sm,
  },
  timeText: {
    ...typography.labelLarge,
    fontVariant: ['tabular-nums'],
  },
  mealTimeSection: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  mealTimeItem: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    gap: spacing.xs,
  },
  mealTimeLabel: {
    ...typography.labelSmall,
  },
  mealTimeValue: {
    ...typography.labelLarge,
    fontVariant: ['tabular-nums'],
  },
  daySection: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.sm,
  },
  dayLabel: {
    ...typography.labelSmall,
    textAlign: 'center',
  },
  hint: {
    ...typography.bodySmall,
    textAlign: 'center',
    marginTop: spacing.md,
    lineHeight: 20,
  },
});
