// OCR service — thin wrapper around the chosen OCR engine for the
// submission flow's nutrition-label capture. Engine: ML Kit (Google)
// via @react-native-ml-kit/text-recognition.
//
// Why ML Kit:
//   - Offline (no API costs, no network round-trip on every scan)
//   - iOS + Android support out of one module
//   - Japanese text recognition is built in (no language pack toggle)
//   - Compatible with expo-camera as the camera primitive (we capture
//     a still image with takePictureAsync, hand the URI to ML Kit;
//     no replacement of the camera library required)
//
// Native module note: this is a native dep that requires running
// `expo prebuild` to regenerate android/ios folders before the next
// EAS build. The project's native folders are CNG-managed so this
// is a build-cycle activity, not an everyday code change.
//
// Lazy-require pattern: jest doesn't have the native module bound,
// so importing it eagerly would crash test suites. Wrapping the
// require call inside the function keeps tests / non-camera paths
// free of the native binding.

export interface OcrResult {
  text: string;
}

export class OcrUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OcrUnavailableError';
  }
}

// Recognize Japanese / Latin text from an image file URI. Throws
// OcrUnavailableError if the native module isn't installed (e.g.
// running on a build that hasn't been prebuilt with the dep yet);
// the caller surfaces a fallback to manual input.
//
// We avoid a static `typeof import('@react-native-ml-kit/text-recognition')`
// type reference because tsc fails to resolve it on machines where
// the dep hasn't been npm-installed yet (e.g. CI before
// `npm ci`, or contributor laptops between rebases). The module's
// own types matter only at runtime; treating the require result as
// `unknown` and shaping it with a small interface keeps the code
// tsc-clean while still giving us a typed call site.
interface MlKitRecognizer {
  recognize: (
    uri: string,
  ) => Promise<{ text?: string; blocks?: Array<{ text?: string }> }>;
}

interface MlKitModule {
  default?: MlKitRecognizer;
  // CJS forms expose `recognize` directly on the module.
  recognize?: MlKitRecognizer['recognize'];
}

export async function recognizeText(uri: string): Promise<OcrResult> {
  let mod: MlKitModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    mod = require('@react-native-ml-kit/text-recognition') as MlKitModule;
  } catch {
    throw new OcrUnavailableError(
      'OCRサービスが利用できません。アプリを最新版に更新してください。',
    );
  }
  const recognizer: MlKitRecognizer | null = mod.default
    ? mod.default
    : mod.recognize
      ? { recognize: mod.recognize }
      : null;
  if (!recognizer) {
    throw new OcrUnavailableError(
      'OCRモジュールの形式が想定外です。アプリを最新版に更新してください。',
    );
  }
  const raw = await recognizer.recognize(uri);
  const text =
    raw.text ??
    (raw.blocks ?? []).map((b) => b.text ?? '').join('\n');
  return { text };
}
