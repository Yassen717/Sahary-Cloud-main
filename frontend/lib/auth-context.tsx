'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { apiClient } from './api';
import { getUserFromToken, isTokenExpired } from './jwt';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string, redirectTo?: string) => Promise<void>;
  register: (userData: any) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    // Check if user is already logged in and validate token
    const token = localStorage.getItem('token');
    if (token) {
      validateToken(token);
    } else {
      setLoading(false);
    }

    // Set up interval to check token expiration every minute
    const interval = setInterval(() => {
      const currentToken = localStorage.getItem('token');
      if (currentToken && isTokenExpired(currentToken)) {
        handleAutoLogout();
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, []);

  const validateToken = async (token: string) => {
    try {
      // Check if token is expired
      if (isTokenExpired(token)) {
        handleAutoLogout();
        return;
      }

      // Get user info from token
      const userInfo = getUserFromToken(token);
      if (userInfo) {
        setUser(userInfo);
      } else {
        apiClient.clearToken();
      }
      
      setLoading(false);
    } catch (error) {
      // Token is invalid, clear it
      apiClient.clearToken();
      setUser(null);
      setLoading(false);
    }
  };

  const handleAutoLogout = () => {
    apiClient.clearToken();
    setUser(null);
    router.push('/login?expired=true');
  };

  const login = async (email: string, password: string, redirectTo?: string) => {
    const response = await apiClient.login(email, password);
    setUser(response.user);
    
    // Redirect to the original page or dashboard
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.push('/dashboard');
    }
  };

  const register = async (userData: any) => {
    const response = await apiClient.register(userData);
    if (response.token) {
      setUser(response.user);
      router.push('/dashboard');
    }
  };

  const logout = async () => {
    await apiClient.logout();
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        login,
        register,
        logout,
        isAuthenticated: !!user,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
