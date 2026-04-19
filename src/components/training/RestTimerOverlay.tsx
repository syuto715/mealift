import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
  useColorScheme,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { getColors, radius, shadow } from '../../theme/tokens';
import { typography } from '../../theme/typography';
import { spacing } from '../../theme/spacing';
import { restTimerService } from '../../infra/services/restTimerService';
import { formatTimerDisplay } from '../../utils/format';

interface Props {
  visible: boolean;
  onClose: () => void;
  settings: { soundEnabled: boolean; vibrationEnabled: boolean };
}

const SIZE = 140;
const STROKE = 10;
const RADIUS = (SIZE - STROKE) / 2;
const CIRC = 2 * Math.PI * RADIUS;

export function RestTimerOverlay({ visible, onClose, settings }: Props) {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);

  const [remaining, setRemaining] = useState(restTimerService.getRemainingSeconds());
  const [total, setTotal] = useState(restTimerService.getTotalSeconds());
  const [exerciseName, setExerciseName] = useState(restTimerService.getExerciseName());
  const translateY = useRef(new Animated.Value(200)).current;
  const hasCompleted = useRef(false);

  useEffect(() => {
    if (visible) {
      hasCompleted.current = false;
      setRemaining(restTimerService.getRemainingSeconds());
      setTotal(restTimerService.getTotalSeconds());
      setExerciseName(restTimerService.getExerciseName());
      Animated.timing(translateY, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: 200,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, translateY]);

  useEffect(() => {
    if (!visible) return;
    const t = setInterval(() => {
      const r = restTimerService.getRemainingSeconds();
      setRemaining(r);
      setTotal(restTimerService.getTotalSeconds());
      if (r === 0 && !hasCompleted.current) {
        hasCompleted.current = true;
        restTimerService.triggerCompletionFeedback({
          enabled: true,
          autoStart: true,
          perExerciseOverride: true,
          defaultSeconds: 90,
          soundEnabled: settings.soundEnabled,
          vibrationEnabled: settings.vibrationEnabled,
        });
        setTimeout(() => onClose(), 3000);
      }
    }, 200);
    return () => clearInterval(t);
  }, [visible, onClose, settings]);

  if (!visible) return null;

  const progress = total > 0 ? remaining / total : 0;
  const dashOffset = CIRC * (1 - progress);

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: colors.surface, transform: [{ translateY }] },
        shadow.lg,
      ]}
      pointerEvents="box-none"
    >
      <View style={styles.content}>
        <View style={styles.ringWrap}>
          <Svg width={SIZE} height={SIZE}>
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={colors.surfaceSecondary}
              strokeWidth={STROKE}
              fill="transparent"
            />
            <Circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              stroke={remaining === 0 ? colors.success : colors.primary}
              strokeWidth={STROKE}
              fill="transparent"
              strokeDasharray={`${CIRC} ${CIRC}`}
              strokeDashoffset={dashOffset}
              strokeLinecap="round"
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            />
          </Svg>
          <View style={styles.ringCenter}>
            <Text style={[styles.time, { color: colors.textPrimary }]}>
              {formatTimerDisplay(remaining)}
            </Text>
            {exerciseName && (
              <Text style={[styles.exercise, { color: colors.textSecondary }]} numberOfLines={1}>
                {exerciseName}
              </Text>
            )}
          </View>
        </View>

        <View style={styles.actions}>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => restTimerService.extendBy(-15)}
          >
            <Text style={[styles.btnText, { color: colors.textPrimary }]}>-15秒</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.surfaceSecondary }]}
            onPress={() => restTimerService.extendBy(15)}
          >
            <Text style={[styles.btnText, { color: colors.textPrimary }]}>+15秒</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.error + '15' }]}
            onPress={async () => {
              await restTimerService.cancel();
              onClose();
            }}
          >
            <Text style={[styles.btnText, { color: colors.error }]}>スキップ</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
    paddingHorizontal: spacing.lg,
    zIndex: 9000,
  },
  content: { alignItems: 'center', gap: spacing.lg },
  ringWrap: {
    width: SIZE,
    height: SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringCenter: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  time: { ...typography.numberLarge, fontSize: 36 },
  exercise: { ...typography.bodySmall, marginTop: spacing.xs, maxWidth: SIZE - 20 },
  actions: { flexDirection: 'row', gap: spacing.sm, width: '100%' },
  btn: {
    flex: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
    borderRadius: 8,
  },
  btnText: { ...typography.labelLarge },
});
