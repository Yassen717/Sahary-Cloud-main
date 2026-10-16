"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { apiClient, ApiError, type ApiRegisterRequest } from "./api";

interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  isVerified?: boolean;
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

export function isAdminRole(role?: string | null) {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}

/** Only allow same-origin relative paths as post-login redirect targets. */
export function getSafeRedirect(target?: string | null): string | null {
  if (!target || !target.startsWith("/") || target.startsWith("//") || target.startsWith("/\\")) {
    return null;
  }
  return target;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  const checkSession = async () => {
    try {
      const response = await apiClient.checkAuth();
      if (response?.data?.user) {
        setUser(response.data.user);
      } else {
        setUser(null);
      }
    } catch (error) {
      // Only an explicit 401/403 means logged out; 429 and network errors keep the known session
      if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
        setUser(null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- state is only set after the async session check resolves
    checkSession();
  }, []);

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
    router.push(getSafeRedirect(redirectTo) ?? "/dashboard");
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
