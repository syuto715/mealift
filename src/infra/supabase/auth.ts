import * as Linking from 'expo-linking';
import { supabase, isSupabaseConfigured } from './client';

// Where Supabase should send the user after they tap the email-confirmation
// link. `Linking.createURL` resolves to the app's custom scheme in standalone
// builds (`mealift://auth/callback`) and to the dev URL in Expo Go
// (`exp://…/--/auth/callback`), so the same code path works in both.
//
// IMPORTANT: this URL must also be allow-listed under
// Supabase → Authentication → URL Configuration → Redirect URLs.
// See docs/supabase-setup.md.
export function authRedirectUrl(): string {
  return Linking.createURL('auth/callback');
}

export async function signUp(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: authRedirectUrl() },
  });
}

// Called by the auth/callback route when the app is opened via the
// confirmation link. Supabase JS handles both PKCE (`?code=…`) and the
// legacy hash flow internally — we just hand it the URL.
export async function exchangeAuthCallback(url: string) {
  if (!supabase) throw new Error('Supabase is not configured');
  const code = new URL(url).searchParams.get('code');
  if (!code) throw new Error('Missing auth code in callback URL');
  return supabase.auth.exchangeCodeForSession(code);
}

export async function signIn(email: string, password: string) {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase.auth.signInWithPassword({ email, password });
}

// Apple Sign In via OIDC ID-token flow.
//
// Apple gives the client a JWT identity token. Supabase's Auth API
// accepts that token along with the *raw* (un-hashed) nonce — Supabase
// verifies that SHA256(rawNonce) matches the `nonce` claim Apple
// embedded in the JWT. The hashing happens at the call site so this
// function takes both pre-hashed inputs.
//
// Returns the same `{ data, error }` shape Supabase JS gives us.
// Caller (authStore.loginWithApple) maps that into the
// {error?: string} contract the screens use.
export async function signInWithApple(
  identityToken: string,
  rawNonce: string,
) {
  if (!supabase) throw new Error('Supabase is not configured');
  return supabase.auth.signInWithIdToken({
    provider: 'apple',
    token: identityToken,
    nonce: rawNonce,
  });
}

export async function signOut() {
  if (!supabase) return;
  return supabase.auth.signOut();
}

export async function getSession() {
  if (!supabase) return { data: { session: null }, error: null };
  return supabase.auth.getSession();
}

export function onAuthStateChange(callback: (event: string, session: unknown) => void) {
  if (!supabase) return { data: { subscription: { unsubscribe: () => {} } } };
  return supabase.auth.onAuthStateChange(callback);
}

export { isSupabaseConfigured };
