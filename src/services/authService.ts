import { supabase, isSupabaseConfigured } from './supabase';
import { MockStorageService } from './mockStorage';
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
    // If it's a student roll number like mca2501
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

    // 1. If Supabase is configured, authenticate via Supabase Auth
    if (isSupabaseConfigured && supabase) {
      try {
        const email = this.normalizeToEmail(cleanId);
        const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authErr) {
          // If Supabase authentication fails, return the error
          return { user: null, error: authErr.message };
        }

        if (!authData.user) {
          return { user: null, error: 'User authentication failed.' };
        }

        // Fetch verified role from profiles table (Server-side trusted source)
        const { data: profile, error: profileErr } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', authData.user.id)
          .single();

        if (profileErr || !profile) {
          return { user: null, error: 'Could not load your student profile. Contact the administrator.' };
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

    // 2. Local fallback / demo mode (Supports all 60 students + 1 admin)
    const profile = MockStorageService.getProfileByRollNumber(cleanId);
    if (!profile) {
      return {
        user: null,
        error: `Account with identifier "${cleanId}" not found. For students, enter your roll number (e.g. MCA2501 to MCA2560). For admin, enter "admin".`,
      };
    }

    // In local demo mode, any password >= 4 characters is accepted (or default 'mca2025' / 'Admin@MCA2025!')
    if (password.length < 4) {
      return { user: null, error: 'Password must be at least 4 characters.' };
    }

    const authUser: AuthUser = {
      id: profile.id,
      email: `${profile.roll_number.toLowerCase()}@mca2527.college`,
      profile,
    };

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authUser));
    return { user: authUser, error: null };
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
    // Check Supabase session first if connected
    if (isSupabaseConfigured && supabase) {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session?.user) {
          const { data: profile } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', sessionData.session.user.id)
            .single();

          if (profile) {
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
        // fallback to cached session
      }
    }

    const saved = localStorage.getItem(SESSION_STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    return null;
  }
}
