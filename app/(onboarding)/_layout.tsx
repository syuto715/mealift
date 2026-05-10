import React from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useSegments, router } from 'expo-router';
import { getColors } from '../../src/theme/tokens';
import { ProgressHeader } from '../../src/components/onboarding/ProgressHeader';
import {
  getRouteByName,
  getStepForRoute,
  getTotalStepsForPlatform,
} from '../../src/domain/onboardingSteps';

// v1.3.0 / Onboarding v2 / Phase A-6 — onboarding stack with the
// shared ProgressHeader injected above the route content.
//
// useSegments() returns the path segments for the active route;
// the last segment is the route file name (e.g. 'welcome',
// 'goal-summary'). We look it up in ONBOARDING_ROUTES to derive
// step number + showBack flag. Routes outside the table fall
// back to step=1 / showBack=true.

export default function OnboardingLayout() {
  const scheme = useColorScheme() ?? 'light';
  const colors = getColors(scheme);
  const segments = useSegments();
  const currentRoute = segments[segments.length - 1] ?? '';
  const route = getRouteByName(currentRoute);
  const step = getStepForRoute(currentRoute) ?? 1;
  const totalSteps = getTotalStepsForPlatform();
  const showBack = route?.showBack ?? true;

  return (
    <SafeAreaView
      style={[styles.safe, { backgroundColor: colors.background }]}
      edges={['top']}
    >
      <ProgressHeader
        currentStep={step}
        totalSteps={totalSteps}
        showBack={showBack}
        onBack={() => router.back()}
      />
      <View style={styles.content}>
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
            animation: 'slide_from_right',
          }}
        />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  content: { flex: 1 },
});
