import React, { useState } from 'react';
import { 
  GraduationCap, 
  Lock, 
  User, 
  Eye, 
  EyeOff, 
  ArrowRight, 
  AlertCircle
} from 'lucide-react';
import { AuthService } from '../../services/authService';
import { BotanicalFlower, TapeStrip, PaperFlourish } from '../common/ScrapbookDecorations';
import type { AuthUser } from '../../types/auth';

interface LoginPageProps {
  onLoginSuccess: (user: AuthUser) => void;
  isSupabaseLive?: boolean;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, isSupabaseLive }) => {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      console.log(`[LoginPage] Submitting authentication request for identifier: '${identifier.trim()}'`);
      const { user, error: loginError } = await AuthService.login({
        identifier,
        password,
      });

      if (loginError || !user) {
        console.warn('[LoginPage] Authentication failed:', loginError);
        setError(loginError || 'Authentication failed. Please check your credentials.');
      } else {
        console.log(`[LoginPage] Authentication successful for '${user.profile.full_name}' (${user.profile.role}).`);
        onLoginSuccess(user);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Login failed';
      console.error('[LoginPage] Unexpected exception:', msg);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden">
      {/* Background Vintage Flourishes */}
      <BotanicalFlower className="absolute top-12 left-12 w-24 h-24 opacity-25 pointer-events-none hidden sm:block" />
      <BotanicalFlower className="absolute bottom-12 right-12 w-28 h-28 opacity-25 pointer-events-none hidden sm:block" />

      {/* Main Login Scrapbook Card */}
      <div className="relative w-full max-w-md scrapbook-card-warm p-6 sm:p-9 bg-[#fffdfa] border border-[#ebdccb] shadow-2xl overflow-hidden">
        {/* Washi Tapes at top */}
        <TapeStrip type="rose" className="absolute -top-2 left-10 rotate-3" />
        <TapeStrip type="gold" className="absolute -top-2 right-10 -rotate-2" />

        {/* Header Branding */}
        <div className="text-center mt-3">
          <div className="w-14 h-14 rounded-2xl bg-[#581c3f] text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-[#581c3f]/25">
            <GraduationCap className="w-8 h-8" />
          </div>

          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#faeff2] text-[#581c3f] border border-[#eed5da]">
            Academic Year 2025 – 2027
          </span>

          <h1 className="font-serif text-3xl sm:text-4xl font-bold text-[#4a1525] mt-3 tracking-tight">
            MCA Memories
          </h1>

          <p className="font-serif italic text-sm text-[#8a4f7d] mt-1">
            “Two Years. Sixty Stories. A Lifetime of Memories.”
          </p>

          <PaperFlourish />
        </div>

        {/* Configuration Notice */}
        {isSupabaseLive === false && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs my-4 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">
              Supabase connection is not configured. Please check your environment variables in .env.local.
            </span>
          </div>
        )}

        {/* Error Notice */}
        {error && (
          <div className="flex items-start gap-2.5 p-3 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs my-4 animate-in fade-in">
            <AlertCircle className="w-4 h-4 text-red-600 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{error}</span>
          </div>
        )}

        {/* Login Form */}
        <form onSubmit={handleSubmit} className="space-y-4 mt-5">
          {/* Login ID */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#695d54] mb-1.5">
              Login ID
            </label>
            <div className="relative">
              <User className="w-4 h-4 text-[#8a7b70] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                required
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder="Enter your Login ID"
                className="w-full pl-10 pr-3.5 py-2.5 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] placeholder:text-[#ab9c91] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 focus:border-[#581c3f] shadow-xs"
              />
            </div>
            <span className="text-[11px] text-[#8c7e73] mt-1 block">
              Students and administrators should enter their assigned Login ID.
            </span>
          </div>

          {/* Password with Show/Hide Toggle */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-[#695d54] mb-1.5">
              Password
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-[#8a7b70] absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type={showPassword ? 'text' : 'password'}
                required
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full pl-10 pr-11 py-2.5 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] placeholder:text-[#ab9c91] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 focus:border-[#581c3f] shadow-xs"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b70] hover:text-[#581c3f] p-1 rounded-md transition-colors cursor-pointer"
                title={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-bold text-sm bg-[#581c3f] hover:bg-[#43132f] text-white shadow-md shadow-[#581c3f]/25 transition-all cursor-pointer active:scale-95 disabled:opacity-50 mt-2"
          >
            {loading ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Signing In...</span>
              </>
            ) : (
              <>
                <span>Sign In to Questionnaire</span>
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        {/* Production Credentials Note */}
        <div className="mt-6 pt-4 border-t border-[#eeddc8] text-center">
          <p className="text-[11px] text-[#8a7b70] leading-relaxed">
            Please sign in using your official MCA roll number or administrator credentials.
          </p>
        </div>
      </div>
    </div>
  );
};
