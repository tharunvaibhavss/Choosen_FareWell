import { supabase, isSupabaseConfigured } from './supabase';
import type { AuthUser, LoginParams } from '../types/auth';

const SESSION_STORAGE_KEY = 'mca_auth_session';

export class AuthService {
  static async resolveLoginEmail(identifier: string): Promise<string | null> {
    const clean = identifier.trim();
    if (!clean) return null;

    if (clean.includes('@')) {
      return clean.toLowerCase();
    }

    const lower = clean.toLowerCase();
    if (lower === 'admin' || lower === 'admin01' || lower === 'administrator') {
      return 'admin@mcafarewell';
    }

    if (!isSupabaseConfigured || !supabase) {
      return null;
    }

    try {
      const { data: canonicalEmail, error: rpcErr } = await supabase.rpc('get_login_email_for_roll', {
        p_roll_number: clean.toUpperCase(),
      });

      if (!rpcErr && canonicalEmail && typeof canonicalEmail === 'string') {
        return canonicalEmail.trim().toLowerCase();
      }
    } catch (err) {
      console.warn('[Auth] Error querying canonical email for roll number:', err);
    }

    return null;
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
      const email = await this.resolveLoginEmail(cleanId);
      if (!email) {
        return { 
          user: null, 
          error: `No active account found for '${cleanId}'. Please verify your Roll Number or Admin ID.` 
        };
      }

      console.log(`[Auth Stage 1] Identifier '${cleanId}' resolved to canonical email '${email}'. Attempting sign-in...`);

      const { data: authData, error: authErr } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authErr) {
        console.warn(`[Auth Stage 2] Supabase Auth sign-in rejected for '${email}':`, authErr.message);
        const userFacingError = authErr.message.includes('Invalid login credentials')
          ? 'Invalid login credentials. Please check your password.'
          : authErr.message;
        return { user: null, error: userFacingError };
      }

      if (!authData.user) {
        console.warn(`[Auth Stage 2] Supabase Auth sign-in returned no user record for '${email}'.`);
        return { user: null, error: 'User authentication failed.' };
      }

      console.log(`[Auth Stage 3] Supabase Auth succeeded. Fetching verified profile for UID ${authData.user.id}...`);

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

      // Stage 4.5: Ensure one-time submission reset for students on their first login after deployment
      if (profile.role === 'student') {
        console.log(`[Auth Stage 4.5] Checking one-time questionnaire reset for student '${profile.roll_number}'...`);
        const { data: resetResult, error: resetErr } = await supabase.rpc('execute_student_first_login_reset');

        if (resetErr || (resetResult && !resetResult.success)) {
          const detail = resetErr?.message || resetResult?.message || 'Failed to initialize questionnaire reset.';
          console.error('[Auth Stage 4.5] One-time reset failed:', detail);
          await supabase.auth.signOut();
          return {
            user: null,
            error: 'Unable to initialize your fresh questionnaire session. Please try signing in again.',
          };
        }

        console.log(`[Auth Stage 4.5] One-time reset status:`, resetResult?.status);
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

      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(authUser));
      }
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
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
  }

  static async getCurrentUser(): Promise<AuthUser | null> {
    if (!isSupabaseConfigured || !supabase) {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
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
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(user));
          }
          return user;
        }
      }
    } catch {
      // Session verification error
    }

    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(SESSION_STORAGE_KEY);
    }
    return null;
  }
}
