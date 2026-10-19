import type { Profile } from './database';

export interface AuthUser {
  id: string;
  email?: string;
  profile: Profile;
}

export interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  error: string | null;
}

export interface LoginParams {
  identifier: string; // Roll number e.g. MCA2501 or admin
  password: string;
}
