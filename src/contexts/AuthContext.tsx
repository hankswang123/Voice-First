import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import * as authApi from '../utils/authApi';
import { setAuthToken } from '../utils/chatHistoryApi';

interface User {
  id: string;
  email: string;
  displayName: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  accessToken: string | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, displayName?: string) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [refreshToken, setRefreshToken] = useState<string | null>(() => localStorage.getItem('refreshToken'));
  const [isLoading, setIsLoading] = useState(true);

  // Sync access token with chatHistoryApi
  useEffect(() => { setAuthToken(accessToken); }, [accessToken]);

  // Auto-refresh token on mount
  useEffect(() => {
    if (!refreshToken) { setIsLoading(false); return; }

    authApi.refresh(refreshToken)
      .then(data => {
        setAccessToken(data.accessToken!);
        setRefreshToken(data.refreshToken!);
        localStorage.setItem('refreshToken', data.refreshToken!);
        return authApi.getMe(data.accessToken!);
      })
      .then(data => setUser(data.user))
      .catch(() => { localStorage.removeItem('refreshToken'); setRefreshToken(null); })
      .finally(() => setIsLoading(false));
  }, []);

  // Refresh before expiry (14 min)
  useEffect(() => {
    if (!accessToken || !refreshToken) return;
    const timer = setTimeout(async () => {
      try {
        const data = await authApi.refresh(refreshToken);
        setAccessToken(data.accessToken);
        setRefreshToken(data.refreshToken);
        localStorage.setItem('refreshToken', data.refreshToken!);
      } catch { logout(); }
    }, 14 * 60 * 1000);
    return () => clearTimeout(timer);
  }, [accessToken, refreshToken]);

  const login = useCallback(async (email: string, password: string) => {
    const data = await authApi.login(email, password);
    setAccessToken(data.accessToken!);
    setRefreshToken(data.refreshToken!);
    localStorage.setItem('refreshToken', data.refreshToken!);
    setUser(data.user!);
  }, []);

  const register = useCallback(async (email: string, password: string, displayName?: string) => {
    await authApi.register(email, password, displayName);
  }, []);

  const logout = useCallback(async () => {
    if (accessToken) { try { await authApi.logout(accessToken); } catch {} }
    setAccessToken(null);
    setRefreshToken(null);
    setUser(null);
    localStorage.removeItem('refreshToken');
  }, [accessToken]);

  return (
    <AuthContext.Provider value={{ user, accessToken, isLoading, login, register, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
