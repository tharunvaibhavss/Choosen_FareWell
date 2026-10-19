import React, { useState } from 'react';
import { 
  KeyRound, 
  Lock, 
  Eye, 
  EyeOff, 
  CheckCircle2, 
  AlertCircle, 
  ShieldCheck, 
  LogOut,
  ArrowRight
} from 'lucide-react';
import { AuthService } from '../../services/authService';
import { BotanicalFlower, TapeStrip, PaperFlourish } from '../common/ScrapbookDecorations';
import type { AuthUser } from '../../types/auth';

interface ForcePasswordChangePageProps {
  user: AuthUser;
  onPasswordChanged: () => void;
  onLogout: () => void;
}

export const ForcePasswordChangePage: React.FC<ForcePasswordChangePageProps> = ({
  user,
  onPasswordChanged,
  onLogout,
}) => {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Frontend validations
    const trimmedNew = newPassword.trim();
    const trimmedConfirm = confirmPassword.trim();

    if (!trimmedNew) {
      setError('Please enter your new password.');
      return;
    }

    if (trimmedNew.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (trimmedNew !== trimmedConfirm) {
      setError('New password and confirmation password do not match.');
      return;
    }

    if (currentPassword && currentPassword.trim() === trimmedNew) {
      setError('Your new password must be different from your initial/current password.');
      return;
    }

    setLoading(true);

    try {
      const res = await AuthService.changePassword(
        trimmedNew,
        currentPassword.trim() ? currentPassword.trim() : undefined
      );

      if (!res.success) {
        setError(res.error || 'Failed to update password. Please check your credentials.');
        setLoading(false);
        return;
      }

      setSuccess(true);
      // Give the user a brief visual celebration before entering dashboard
      setTimeout(() => {
        onPasswordChanged();
      }, 900);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
      setError(msg);
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-4 sm:p-6 relative overflow-hidden bg-[#fcfaf6]">
      {/* Background Vintage Flourishes */}
      <BotanicalFlower className="absolute top-12 left-12 w-24 h-24 opacity-25 pointer-events-none hidden sm:block" />
      <BotanicalFlower className="absolute bottom-12 right-12 w-28 h-28 opacity-25 pointer-events-none hidden sm:block" />

      {/* Main Card */}
      <div className="relative w-full max-w-lg scrapbook-card-warm p-6 sm:p-9 bg-[#fffdfa] border border-[#ebdccb] shadow-2xl overflow-hidden rounded-2xl">
        {/* Washi Tapes */}
        <TapeStrip type="rose" className="absolute -top-2 left-10 rotate-3" />
        <TapeStrip type="gold" className="absolute -top-2 right-10 -rotate-2" />

        {/* Header Branding */}
        <div className="text-center mt-3">
          <div className="w-14 h-14 rounded-2xl bg-[#581c3f] text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-[#581c3f]/25">
            <KeyRound className="w-8 h-8" />
          </div>

          <span className="text-xs font-semibold px-3 py-1 rounded-full bg-[#faeff2] text-[#581c3f] border border-[#eed5da]">
            Action Required • First Login Security
          </span>

          <h1 className="font-serif text-2xl sm:text-3xl font-bold text-[#4a1525] mt-3 tracking-tight">
            Create Your New Password
          </h1>

          <p className="text-xs sm:text-sm text-[#70645c] mt-2 max-w-sm mx-auto leading-relaxed">
            Welcome, <strong className="text-[#581c3f]">{user.profile.full_name}</strong> (<span className="font-mono">{user.profile.roll_number}</span>). Please set a secure private password to access your questionnaire.
          </p>

          <PaperFlourish />
        </div>

        {/* Success Alert */}
        {success && (
          <div className="flex items-center gap-2.5 p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm my-4 animate-in fade-in">
            <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
            <span className="font-medium">
              Password successfully updated! Opening your questionnaire...
            </span>
          </div>
        )}

        {/* Error Alert */}
        {error && !success && (
          <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-red-50 border border-red-200 text-red-900 text-xs sm:text-sm my-4 animate-in fade-in">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed font-medium">{error}</span>
          </div>
        )}

        {/* Form */}
        {!success && (
          <form onSubmit={handleSubmit} className="mt-5 space-y-4">
            {/* Current or Initial Password */}
            <div>
              <label 
                htmlFor="current-password-input"
                className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1"
              >
                Current / Initial Password
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8a7b70] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="current-password-input"
                  type={showCurrentPassword ? 'text' : 'password'}
                  placeholder="Enter the password you just logged in with"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  disabled={loading}
                  className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] placeholder:text-[#a39488] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 focus:border-[#581c3f] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b70] hover:text-[#581c3f] p-1 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showCurrentPassword ? 'Hide current password' : 'Show current password'}
                >
                  {showCurrentPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-[11px] text-[#8a7b70] mt-1">
                Enter your initial password for security verification.
              </p>
            </div>

            {/* New Password */}
            <div>
              <label 
                htmlFor="new-password-input"
                className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1"
              >
                New Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8a7b70] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="new-password-input"
                  type={showNewPassword ? 'text' : 'password'}
                  required
                  placeholder="At least 6 characters"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  disabled={loading}
                  className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] placeholder:text-[#a39488] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 focus:border-[#581c3f] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b70] hover:text-[#581c3f] p-1 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showNewPassword ? 'Hide new password' : 'Show new password'}
                >
                  {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Confirm New Password */}
            <div>
              <label 
                htmlFor="confirm-password-input"
                className="block text-xs font-bold text-[#695d54] uppercase tracking-wider mb-1"
              >
                Confirm New Password *
              </label>
              <div className="relative">
                <Lock className="w-4 h-4 text-[#8a7b70] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  id="confirm-password-input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  required
                  placeholder="Re-enter your new password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  className="w-full pl-9 pr-10 py-2.5 bg-white border border-[#ebdccb] rounded-xl text-xs sm:text-sm text-[#4a1525] placeholder:text-[#a39488] focus:outline-none focus:ring-2 focus:ring-[#581c3f]/20 focus:border-[#581c3f] transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#8a7b70] hover:text-[#581c3f] p-1 cursor-pointer"
                  tabIndex={-1}
                  aria-label={showConfirmPassword ? 'Hide confirmed password' : 'Show confirmed password'}
                >
                  {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Save New Password Button */}
            <button
              id="save-new-password-btn"
              type="submit"
              disabled={loading}
              className="w-full mt-2 py-3 px-4 rounded-xl font-serif text-sm font-bold text-white bg-[#581c3f] hover:bg-[#43132f] active:scale-[0.99] transition-all shadow-md shadow-[#581c3f]/25 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  <span>Saving New Password...</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-4 h-4" />
                  <span>Save New Password</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        )}

        {/* Footer with Sign Out */}
        <div className="mt-6 pt-4 border-t border-[#ebdccb] flex items-center justify-between text-xs text-[#8a7b70]">
          <span>Logged in as <strong>{user.profile.roll_number}</strong></span>
          <button
            type="button"
            onClick={onLogout}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-[#581c3f] hover:underline font-semibold cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>
    </div>
  );
};
