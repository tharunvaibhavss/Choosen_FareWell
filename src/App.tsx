import React, { useState, useEffect } from 'react';
import { Header } from './components/common/Header';
import { LoginPage } from './components/auth/LoginPage';
import { QuestionnairePage } from './components/questionnaire/QuestionnairePage';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { ForcePasswordChangePage } from './components/auth/ForcePasswordChangePage';
import { AuthService } from './services/authService';
import { isSupabaseConfigured } from './services/supabase';
import type { AuthUser } from './types/auth';

export const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function checkSession() {
      try {
        const user = await AuthService.getCurrentUser();
        setCurrentUser(user);
      } catch (err) {
        console.error('Session check error:', err);
      } finally {
        setLoading(false);
      }
    }
    checkSession();
  }, []);

  const handleLoginSuccess = (user: AuthUser) => {
    setCurrentUser(user);
  };

  const handleLogout = async () => {
    await AuthService.logout();
    setCurrentUser(null);
  };

  const handlePasswordChanged = async () => {
    try {
      const refreshedUser = await AuthService.getCurrentUser();
      if (refreshedUser) {
        setCurrentUser(refreshedUser);
      } else {
        setCurrentUser((prev) =>
          prev
            ? {
                ...prev,
                profile: {
                  ...prev.profile,
                  must_change_password: false,
                  password_changed_at: new Date().toISOString(),
                },
              }
            : null
        );
      }
    } catch (err) {
      console.error('Error refreshing user session after password change:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#fcfaf6] text-[#4a1525] gap-3">
        <div className="w-10 h-10 border-4 border-[#581c3f] border-t-transparent rounded-full animate-spin" />
        <p className="font-serif text-lg font-medium">Loading MCA Memories 2025–2027...</p>
      </div>
    );
  }

  // If not logged in, render the login page
  if (!currentUser) {
    return (
      <LoginPage
        onLoginSuccess={handleLoginSuccess}
        isSupabaseLive={isSupabaseConfigured}
      />
    );
  }

  const isAdmin = currentUser.profile.role === 'admin';
  const mustChangePassword = !isAdmin && (currentUser.profile.must_change_password ?? true);

  // If student must change their password on first login or after admin reset, block access to questionnaire
  if (mustChangePassword) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fcfaf6]">
        <Header
          user={currentUser}
          onLogout={handleLogout}
          isSupabaseLive={isSupabaseConfigured}
        />
        <div className="flex-1 flex flex-col items-center justify-center p-4">
          <ForcePasswordChangePage
            user={currentUser}
            onPasswordChanged={handlePasswordChanged}
            onLogout={handleLogout}
          />
        </div>
      </div>
    );
  }

  // If authenticated and password status is satisfied:
  return (
    <div className="min-h-screen flex flex-col bg-[#fcfaf6]">
      {/* Top Header */}
      <Header
        user={currentUser}
        onLogout={handleLogout}
        isSupabaseLive={isSupabaseConfigured}
      />

      {/* Role-based routing */}
      <div className="flex-1 flex flex-col w-full">
        {isAdmin ? (
          <AdminDashboard />
        ) : (
          <QuestionnairePage user={currentUser} />
        )}
      </div>
    </div>
  );
};

export default App;
