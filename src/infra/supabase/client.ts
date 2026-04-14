import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { APP_CONFIG } from '../../constants/config';
import 'react-native-url-polyfill/auto';

const supabaseUrl = APP_CONFIG.SUPABASE_URL;
const supabaseAnonKey = APP_CONFIG.SUPABASE_ANON_KEY;

export const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

// Create a real client only when credentials are configured.
// Otherwise, provide a null placeholder — callers must check isSupabaseConfigured first.
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    })
  : null;
