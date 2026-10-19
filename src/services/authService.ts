import { supabase, isSupabaseConfigured } from './supabase';
import type { AuthUser, LoginParams } from '../types/auth';

const SESSION_STORAGE_KEY = 'mca_auth_session';

export class AuthService {
  static normalizeToEmail(identifier: string): string {
    const clean = identifier.trim().toLowerCase();
    if (clean.includes('@')) {
      return clean;
    }
    if (clean === 'admin' || clean === 'admin01') {
      return 'admin@mca2527.college';
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
      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authErr) {
        return { user: null, error: authErr.message };
      }

      if (!authData.user) {
        return { user: null, error: 'User authentication failed.' };
      }

      // Fetch verified profile from profiles table (Server-side trusted source)
      const { data: profile, error: profileErr } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', authData.user.id)
        .single();

      if (profileErr || !profile) {
        return { user: null, error: 'Could not load your student profile. Please contact the administrator.' };
      }

      if (profile.is_active === false) {
        await supabase.auth.signOut();
        return { user: null, error: 'Your account has been deactivated. Please contact the administrator.' };
      }

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
