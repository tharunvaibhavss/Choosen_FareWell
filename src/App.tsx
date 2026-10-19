import React, { useState, useEffect } from 'react';
import { Header } from './components/common/Header';
import { LoginPage } from './components/auth/LoginPage';
import { QuestionnairePage } from './components/questionnaire/QuestionnairePage';
import { AdminDashboard } from './components/admin/AdminDashboard';
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

  // If authenticated:
  return (
    <div className="min-h-screen lg:h-screen lg:overflow-hidden flex flex-col bg-[#fcfaf6]">
      {/* Top Header */}
      <Header
        user={currentUser}
        onLogout={handleLogout}
        isSupabaseLive={isSupabaseConfigured}
      />

      {/* Role-based routing */}
      <div className="flex-1 min-h-0 flex flex-col overflow-y-auto lg:overflow-hidden">
        {currentUser.profile.role === 'admin' ? (
          <AdminDashboard />
        ) : (
          <QuestionnairePage user={currentUser} />
        )}
      </div>
    </div>
  );
};

export default App;
