import React from 'react';
import { GraduationCap, LogOut, ShieldCheck, User } from 'lucide-react';
import type { AuthUser } from '../../types/auth';

interface HeaderProps {
  user: AuthUser;
  onLogout: () => void;
  isSupabaseLive?: boolean;
}

export const Header: React.FC<HeaderProps> = ({ user, onLogout, isSupabaseLive }) => {
  return (
    <header className="relative w-full bg-[#fdfcf9] border-b border-[#ebdccb] shadow-xs z-30">
      {/* Top vintage decorative tape strip */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-28 h-1.5 bg-[#d99ca5]/40 rounded-b-sm pointer-events-none" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-1.5 sm:py-2 flex items-center justify-between">
        {/* Logo and Academic Year (20-22px Title) */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-lg bg-[#581c3f] flex items-center justify-center text-white shadow-sm shadow-[#581c3f]/20">
            <GraduationCap className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-serif text-lg sm:text-[21px] font-bold tracking-tight text-[#4a1525]">
                MCA Memories
              </span>
              <span className="hidden sm:inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[#f2ebdf] text-[#581c3f] border border-[#e2d5c3]">
                2025 – 2027
              </span>
            </div>
            <p className="text-[11px] text-[#7d6f66] font-medium hidden sm:block leading-tight">
              Yearbook Questionnaire & Batch Keepsake
            </p>
          </div>
        </div>

        {/* User Status & Logout (13-14px Typography) */}
        <div className="flex items-center gap-2 sm:gap-3">
          {/* Connection status badge */}
          {isSupabaseLive ? (
            <span className="hidden md:inline-flex items-center gap-1.5 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full font-medium">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Supabase Live
            </span>
          ) : (
            <span className="hidden md:inline-flex items-center gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-medium" title="Supabase configuration required in .env.local">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Supabase Disconnected
            </span>
          )}

          {/* User Name & Role in Top-Right Header */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-[#faf5ed] border border-[#ebdccb] px-2.5 py-1 rounded-lg shadow-2xs">
            {user.profile.role === 'admin' ? (
              <ShieldCheck className="w-4 h-4 text-[#581c3f]" />
            ) : (
              <User className="w-4 h-4 text-[#7d6f66]" />
            )}
            <div className="text-left">
              <div className="text-xs sm:text-[13.5px] font-semibold text-[#4a1525] line-clamp-1">
                {user.profile.full_name}
              </div>
              <div className="text-[10px] text-[#7d6f66] font-mono leading-none">
                {user.profile.roll_number}
                {user.profile.role === 'admin' && ' • Admin'}
              </div>
            </div>
          </div>

          {/* Logout Button (13-14px) */}
          <button
            onClick={onLogout}
            className="flex items-center gap-1 px-2.5 py-1 text-xs sm:text-[13.5px] font-semibold text-[#581c3f] hover:text-white hover:bg-[#581c3f] bg-white border border-[#ebdccb] hover:border-[#581c3f] rounded-lg transition-all shadow-2xs cursor-pointer active:scale-95"
            title="Log out of account"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Logout</span>
          </button>
        </div>
      </div>
    </header>
  );
};
