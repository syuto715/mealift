import * as Sharing from 'expo-sharing';

type ViewShotModule = {
  captureRef: (node: unknown, options: { format?: string; quality?: number; result?: string }) => Promise<string>;
};

async function loadViewShot(): Promise<ViewShotModule | null> {
  try {
    // Dynamic import so the app still boots when the module isn't linked
    // (Expo Go without prebuild). When installed, the capture actually runs.
    const mod = await import('react-native-view-shot');
    return mod as unknown as ViewShotModule;
  } catch {
    return null;
  }
}

export async function captureAndShare(
  viewRef: { current: unknown },
  options: { filename: string; includeBranding?: boolean }
): Promise<void> {
  if (!viewRef.current) {
    throw new Error('No view to capture');
  }
  const vs = await loadViewShot();
  if (!vs) {
    throw new Error('react-native-view-shot not installed');
  }
  const uri = await vs.captureRef(viewRef.current, {
    format: 'png',
    quality: 1,
    result: 'tmpfile',
  });

  const available = await Sharing.isAvailableAsync();
  if (!available) {
    throw new Error('Sharing not available on this platform');
  }
  await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'シェア' });
}

// Helper to blur a weight number for privacy (default behavior)
export function obfuscateWeight(kg: number): string {
  return `約${Math.round(kg / 5) * 5}kg`;
}
