import { useCallback, useEffect, useState } from 'react';
import { Platform } from 'react-native';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { useAuthStore } from '../stores/authStore';

// Apple Sign In flow controller. Encapsulates:
//   - device-capability detection (iOS 13+ + native module present)
//   - nonce generation + SHA256 hashing for the OIDC PKCE-equivalent
//     replay-protection that Apple requires
//   - native sign-in sheet trigger
//   - hand-off to authStore.loginWithApple → Supabase signInWithIdToken
//
// Returns:
//   available — true on iOS 13+ with the native module bound
//   signingIn — true while the sheet is up or Supabase is exchanging
//   signIn()  — Promise<{ error?: string; cancelled?: boolean }>
//
// Cancellation by the user is NOT an error. The screen distinguishes
// between user-cancelled (no UI message) and real failure (toast).

interface UseAppleSignInResult {
  available: boolean;
  signingIn: boolean;
  signIn: () => Promise<{ error?: string; cancelled?: boolean }>;
}

// Random 32-character hex nonce used as the raw value. Hashed with SHA256
// before being passed to Apple. Supabase verifies SHA256(rawNonce) ===
// the JWT's nonce claim, so we must keep both around.
async function generateRawNonce(): Promise<string> {
  const bytes = await Crypto.getRandomBytesAsync(16);
  let s = '';
  for (let i = 0; i < bytes.length; i++) {
    s += bytes[i].toString(16).padStart(2, '0');
  }
  return s;
}

async function hashNonce(raw: string): Promise<string> {
  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    raw,
  );
}

export function useAppleSignIn(): UseAppleSignInResult {
  const [available, setAvailable] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const loginWithApple = useAuthStore((s) => s.loginWithApple);

  useEffect(() => {
    let cancelled = false;
    if (Platform.OS !== 'ios') {
      setAvailable(false);
      return;
    }
    AppleAuthentication.isAvailableAsync()
      .then((ok) => {
        if (!cancelled) setAvailable(ok);
      })
      .catch(() => {
        if (!cancelled) setAvailable(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const signIn = useCallback(async (): Promise<{
    error?: string;
    cancelled?: boolean;
  }> => {
    if (signingIn) return {};
    setSigningIn(true);
    try {
      const rawNonce = await generateRawNonce();
      const hashedNonce = await hashNonce(rawNonce);

      let credential: AppleAuthentication.AppleAuthenticationCredential;
      try {
        credential = await AppleAuthentication.signInAsync({
          requestedScopes: [
            AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
            AppleAuthentication.AppleAuthenticationScope.EMAIL,
          ],
          nonce: hashedNonce,
        });
      } catch (e) {
        // ERR_REQUEST_CANCELED is the user-tapped-Cancel case. The
        // SDK throws an Error whose `code` field is 'ERR_REQUEST_CANCELED'
        // (or, in some versions, the message contains "canceled").
        const err = e as { code?: string; message?: string };
        if (
          err?.code === 'ERR_REQUEST_CANCELED' ||
          /cancel/i.test(err?.message ?? '')
        ) {
          return { cancelled: true };
        }
        return {
          error:
            err?.message ?? 'Apple Sign In のサインインに失敗しました',
        };
      }

      const identityToken = credential.identityToken;
      if (!identityToken) {
        return {
          error:
            'Apple からトークンを取得できませんでした。再度お試しください。',
        };
      }

      const result = await loginWithApple(identityToken, rawNonce);
      return result;
    } finally {
      setSigningIn(false);
    }
  }, [signingIn, loginWithApple]);

  return { available, signingIn, signIn };
}
