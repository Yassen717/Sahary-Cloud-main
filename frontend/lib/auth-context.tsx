"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiClient, type ApiRegisterRequest } from "./api";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (
    email: string,
    password: string,
    redirectTo?: string,
  ) => Promise<void>;
  register: (userData: ApiRegisterRequest) => Promise<void>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    checkSession();
  }, []);

  const checkSession = async () => {
    try {
      const response = await apiClient.checkAuth();
      if (response?.data?.user) {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch {
      // 401 or network error — user is not logged in
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (
    email: string,
    password: string,
    redirectTo?: string,
  ) => {
    const response = await apiClient.login(email, password);
    // Set user immediately from the login response (avoids a window where
    // user is null); checkSession below confirms/refreshes it regardless.
    if (response?.data?.user) {
      setUser(response.data.user);
    }
    await checkSession();
    if (redirectTo) {
      router.push(redirectTo);
    } else {
      router.push("/dashboard");
    }
  };

  const register = async (userData: ApiRegisterRequest) => {
    const response = await apiClient.register(userData);
    if (response?.data?.user) {
      setUser(response.data.user);
    }
    await checkSession();
    router.push("/dashboard");
  };

  const logout = async () => {
    try {
      await apiClient.logout();
    } finally {
      // Always clear local state and navigate even if the backend call fails
      setUser(null);
      router.push("/login");
    }
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
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
