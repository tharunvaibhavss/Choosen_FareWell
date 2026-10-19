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
        let userFacingError = authErr.message;
        if (authErr.message.includes('Invalid login credentials')) {
          userFacingError = 'Invalid login credentials. Please check your password.';
        } else if (authErr.message.toLowerCase().includes('banned')) {
          userFacingError = 'Your account has been deactivated. Please contact the administrator.';
        }
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
          email: profile.email,
          role: profile.role,
          is_active: profile.is_active,
          created_at: profile.created_at,
          must_change_password: profile.role === 'admin' ? false : (profile.must_change_password ?? true),
          password_changed_at: profile.password_changed_at || null,
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

  static async changePassword(
    newPassword: string,
    currentPassword?: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!isSupabaseConfigured || !supabase) {
      return { success: false, error: 'Database connection is not configured.' };
    }

    try {
      // 1. Check current session
      const { data: sessionData } = await supabase.auth.getSession();
      const currentUser = sessionData.session?.user;
      if (!currentUser || !currentUser.email) {
        return { success: false, error: 'You are not currently authenticated. Please sign in again.' };
      }

      // 2. Validate new password length
      const trimmed = newPassword.trim();
      if (!trimmed || trimmed.length < 6) {
        return { success: false, error: 'New password must be at least 6 characters long.' };
      }

      // 3. If current password was provided, verify it first against Supabase Auth
      if (currentPassword && currentPassword.trim()) {
        const { error: verifyErr } = await supabase.auth.signInWithPassword({
          email: currentUser.email,
          password: currentPassword,
        });

        if (verifyErr) {
          return {
            success: false,
            error: 'Current or initial password is incorrect. Please re-check and try again.',
          };
        }
      }

      // 4. Update password via Supabase Auth client for currently authenticated user
      const { data: updateData, error: updateErr } = await supabase.auth.updateUser({
        password: trimmed,
      });

      if (updateErr) {
        return { success: false, error: updateErr.message };
      }

      if (!updateData.user) {
        return { success: false, error: 'Supabase Auth did not return the updated user.' };
      }

      // 5. Complete password change status in profiles via secure server-side RPC
      const { data: rpcData, error: rpcErr } = await supabase.rpc('complete_student_password_change');
      if (rpcErr || (rpcData && !rpcData.success)) {
        const msg = rpcErr?.message || rpcData?.error || 'Failed to record password change status.';
        console.error('[Auth] complete_student_password_change error:', msg);
        return { success: false, error: msg };
      }

      // 6. Refresh cached session
      await AuthService.getCurrentUser();

      return { success: true };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update password.';
      console.error('[Auth] changePassword exception:', msg);
      return { success: false, error: msg };
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
            profile: {
              ...profile,
              must_change_password: profile.role === 'admin' ? false : (profile.must_change_password ?? true),
              password_changed_at: profile.password_changed_at || null,
            },
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
