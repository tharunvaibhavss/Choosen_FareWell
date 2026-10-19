import { supabase, isSupabaseConfigured } from './supabase';
import type { AuthUser, LoginParams } from '../types/auth';

const SESSION_STORAGE_KEY = 'mca_auth_session';

export class AuthService {
  static normalizeToEmail(identifier: string): string {
    const clean = identifier.trim().toLowerCase();
    if (clean.includes('@')) {
      return clean;
    }
    if (clean === 'admin' || clean === 'admin01' || clean === 'administrator') {
      return 'admin@mcafarewell';
    }
    // Student roll number e.g. mca2501 -> mca2501@mca2527.college
    return `${clean}@mca2527.college`;
  }

  static async login(params: LoginParams): Promise<{ user: AuthUser | null; error: string | null }> {
    const { identifier, password } = params;
    const cleanId = identifier.trim();

    if (!cleanId) {
      return { user: null, error: 'Please enter your Roll Number or Admin ID.' };
    }
    if (!password) {
      return { user: null, error: 'Please enter your password.' };
    }

    if (!isSupabaseConfigured || !supabase) {
      return { 
        user: null, 
        error: 'Supabase database is not configured. Please verify your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in .env.local.' 
      };
    }

    try {
      const email = this.normalizeToEmail(cleanId);
      console.log(`[Auth Stage 1] Identifier '${cleanId}' resolved to email '${email}'. Attempting sign-in...`);

      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authErr) {
        console.warn(`[Auth Stage 2] Supabase Auth sign-in rejected for '${email}':`, authErr.message);
        return { user: null, error: authErr.message };
      }

      if (!authData.user) {
        console.warn(`[Auth Stage 2] Supabase Auth sign-in returned no user record for '${email}'.`);
        return { user: null, error: 'User authentication failed.' };
      }

      console.log(`[Auth Stage 3] Supabase Auth succeeded (UID: ${authData.user.id}). Fetching profile from database...`);

      // Fetch verified profile from profiles table (Server-side trusted source)
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileErr || !profile) {
        console.warn(`[Auth Stage 3] Profile fetch failed for UID ${authData.user.id}:`, profileErr?.message);
        return { user: null, error: 'Could not load your student profile. Please contact the administrator.' };
      }

      if (profile.is_active === false) {
        console.warn(`[Auth Stage 4] Profile is deactivated for UID ${authData.user.id}. Signing out.`);
        await supabase.auth.signOut();
        return { user: null, error: 'Your account has been deactivated. Please contact the administrator.' };
      }

      console.log(`[Auth Stage 5] Successfully verified profile for '${profile.roll_number}' (Role: ${profile.role}). Establishing session.`);

      const authUser: AuthUser = {
        id: authData.user.id,
        email: authData.user.email,
        profile: {
          id: profile.id,
          roll_number: profile.roll_number,
          full_name: profile.full_name,
          role: profile.role,
          created_at: profile.created_at,
        },
      };

      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authUser));
      return { user: authUser, error: null };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Login failed';
      console.error('[Auth] Unexpected login exception:', message);
      return { user: null, error: message };
    }
  }

  static async logout(): Promise<void> {
    if (isSupabaseConfigured && supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // continue
      }
    }
    localStorage.removeItem(SESSION_STORAGE_KEY);
  }

  static async getCurrentUser(): Promise<AuthUser | null> {
    if (!isSupabaseConfigured || !supabase) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (sessionData.session?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', sessionData.session.user.id)
          .single();

        if (profile && profile.is_active !== false) {
          const user: AuthUser = {
            id: sessionData.session.user.id,
            email: sessionData.session.user.email,
            profile,
          };
          localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
          return user;
        }
      }
    } catch {
      // Session verification error
    }

    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}
