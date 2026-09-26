import { cache, withCache } from "./cache";
import { rateLimiter, logSecurityEvent, getCsrfToken } from "./security";
import type { components } from "./api-types.generated";

export type ApiRegisterRequest = components["schemas"]["RegisterRequest"];
export type ApiCreateVmRequest = Partial<
  components["schemas"]["CreateVMRequest"]
> & {
  name: string;
  os?: string;
  cpu?: number;
  ram?: number;
  storage?: number;
};
export type ApiUpdateProfileRequest = Partial<
  Pick<components["schemas"]["User"], "firstName" | "lastName" | "phone">
> & {
  avatar?: string;
};

const API_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000/api/v1";

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  // Prevents multiple simultaneous refresh calls when several requests 401 at once
  private isRefreshing = false;
  private pendingRefreshPromise: Promise<boolean> | null = null;

  constructor() {
    this.baseURL = API_URL;
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== "undefined") {
      sessionStorage.setItem("accessToken", token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("accessToken");
    }
  }

  getToken(): string | null {
    return (
      this.token ??
      (typeof window !== "undefined"
        ? sessionStorage.getItem("accessToken")
        : null)
    );
  }

  /**
   * Attempt to refresh the access token using the HttpOnly refreshToken cookie.
   * Deduplicated: concurrent calls share the same in-flight promise.
   * @returns true if the new token cookie was set successfully, false otherwise.
   */
  private async tryRefreshToken(): Promise<boolean> {
    if (this.isRefreshing && this.pendingRefreshPromise) {
      return this.pendingRefreshPromise;
    }

    this.isRefreshing = true;
    this.pendingRefreshPromise = (async () => {
      try {
        const res = await fetch(`${this.baseURL}/auth/refresh`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });
        if (res.ok) {
          // Capture the refreshed access token so subsequent requests send it
          // as a Bearer header (the HttpOnly cookie is also rotated).
          // Handles both { data: { tokens: { accessToken } } } and the
          // legacy { data: { accessToken } } response shape.
          const body = await res.json().catch(() => null);
          const token =
            body?.data?.tokens?.accessToken ?? body?.data?.accessToken ?? null;
          if (token) {
            this.setToken(token);
          }
          return true;
        }
        // Refresh was rejected (e.g. 401) — drop any stale access token
        this.clearToken();
        return false;
      } catch {
        return false;
      } finally {
        this.isRefreshing = false;
        this.pendingRefreshPromise = null;
      }
    })();

    return this.pendingRefreshPromise;
  }

  private async request(
    endpoint: string,
    options: RequestInit = {},
  ): Promise<any> {
    // Rate limiting check
    const token = this.getToken();
    const rateLimitKey = `${endpoint}-${token || "anonymous"}`;
    if (!rateLimiter.canMakeRequest(rateLimitKey)) {
      logSecurityEvent({
        type: "RATE_LIMIT_EXCEEDED",
        severity: "medium",
        details: `Rate limit exceeded for endpoint: ${endpoint}`,
      });
      throw new Error("Too many requests. Please try again later.");
    }

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      ...options.headers,
    };

    if (token) {
      (headers as Record<string, string>)["Authorization"] =
        `Bearer ${token}`;
    }

    // Add CSRF token for state-changing requests
    if (["POST", "PUT", "DELETE", "PATCH"].includes(options.method || "GET")) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        (headers as Record<string, string>)["X-CSRF-Token"] = csrfToken;
      }
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      credentials: "include" as RequestCredentials,
      headers,
    });

    if (!response.ok) {
      // On 401, attempt a silent token refresh and replay the request once.
      // Skip refresh for auth endpoints themselves to avoid infinite loops.
      const isAuthEndpoint =
        endpoint.includes("/auth/login") ||
        endpoint.includes("/auth/refresh") ||
        endpoint.includes("/auth/register");

      if (response.status === 401 && !isAuthEndpoint) {
        const refreshed = await this.tryRefreshToken();
        if (refreshed) {
          // New token cookie is now set — replay the original request
          return this.request(endpoint, options);
        }
        // Refresh failed — fall through to throw so auth-context can log the user out
      }

      const error = await response
        .json()
        .catch(() => ({ message: "Request failed" }));

      // Log security-related errors
      if (response.status === 401 || response.status === 403) {
        logSecurityEvent({
          type: "AUTH_ERROR",
          severity: "medium",
          details: `${response.status} error on ${endpoint}`,
        });
      }

      throw new Error(this.extractErrorMessage(error, response.status));
    }

    return response.json();
  }

  /**
   * Normalize the backend's various error body shapes into a readable message:
   * - { success:false, error:'string', message:'...' }           (controller catches)
   * - { success:false, error:'Validation failed', details:[...] } (zod middleware)
   * - { success:false, error:{ message:'...', statusCode,... } }  (errorHandler middleware)
   */
  private extractErrorMessage(error: any, status: number): string {
    const detailsMessage =
      Array.isArray(error?.details) && error.details.length > 0
        ? error.details
            .map((d: any) =>
              d?.field ? `${d.field}: ${d?.message}` : d?.message,
            )
            .filter(Boolean)
            .join("; ")
        : null;

    return (
      error?.message ??
      error?.error?.message ??
      (detailsMessage || null) ??
      (typeof error?.error === "string" ? error.error : null) ??
      `HTTP ${status}`
    );
  }

  // Auth methods
  async login(email: string, password: string) {
    const response = await this.request("/auth/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });

    // Persist the access token so it is sent as a Bearer header on
    // subsequent requests (the HttpOnly cookie remains primary).
    const token = response?.data?.tokens?.accessToken;
    if (token) {
      this.setToken(token);
    }

    return response;
  }

  async register(userData: ApiRegisterRequest) {
    const response = await this.request("/auth/register", {
      method: "POST",
      body: JSON.stringify(userData),
    });

    // Persist the access token so it is sent as a Bearer header on
    // subsequent requests (the HttpOnly cookie remains primary).
    const token = response?.data?.tokens?.accessToken;
    if (token) {
      this.setToken(token);
    }

    return response;
  }

  async logout() {
    try {
      await this.request("/auth/logout", { method: "POST" });
    } catch {
      // Network/server failure — local auth state is still cleared below.
    } finally {
      this.clearToken();
    }
  }

  async getMe() {
    return this.request("/auth/profile");
  }

  async checkAuth() {
    return this.request("/auth/check");
  }

  async updateProfile(userData: ApiUpdateProfileRequest) {
    return this.request("/auth/profile", {
      method: "PUT",
      body: JSON.stringify(userData),
    });
  }

  async changePassword(
    currentPassword: string,
    newPassword: string,
    confirmPassword: string,
  ) {
    return this.request("/auth/change-password", {
      method: "POST",
      body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
    });
  }

  async verifyEmail(token: string) {
    return this.request("/auth/verify-email", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async resendVerification(email: string) {
    return this.request("/auth/resend-verification", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async forgotPassword(email: string) {
    return this.request("/auth/forgot-password", {
      method: "POST",
      body: JSON.stringify({ email }),
    });
  }

  async resetPassword(
    token: string,
    password: string,
    confirmPassword: string,
  ) {
    return this.request("/auth/reset-password", {
      method: "POST",
      body: JSON.stringify({ token, password, confirmPassword }),
    });
  }

  async validateToken(token: string) {
    return this.request("/auth/validate-token", {
      method: "POST",
      body: JSON.stringify({ token }),
    });
  }

  async getSessions() {
    return this.request("/auth/sessions");
  }

  async revokeAllSessions() {
    return this.request("/auth/sessions", { method: "DELETE" });
  }

  async revokeSession(id: string) {
    return this.request(`/auth/sessions/${id}`, { method: "DELETE" });
  }

  async deactivateAccount(password: string, reason?: string) {
    return this.request("/auth/deactivate", {
      method: "POST",
      body: JSON.stringify({
        password,
        ...(reason ? { reason } : {}),
      }),
    });
  }

  async reactivateAccount(email: string, token: string) {
    return this.request("/auth/reactivate", {
      method: "POST",
      body: JSON.stringify({ email, token }),
    });
  }

  // VM methods
  async getVMs() {
    return withCache(
      () => this.request("/vms"),
      () => "vms:list",
      { ttl: 2 * 60 * 1000, staleWhileRevalidate: true }, // 2 minutes, with stale-while-revalidate
    )();
  }

  async getVM(id: string) {
    return this.request(`/vms/${id}`);
  }

  async createVM(vmData: ApiCreateVmRequest) {
    const result = await this.request("/vms", {
      method: "POST",
      body: JSON.stringify(vmData),
    });
    // Invalidate VMs cache after creation
    cache.invalidate("vms:list");
    return result;
  }

  async updateVM(id: string, vmData: any) {
    return this.request(`/vms/${id}`, {
      method: "PUT",
      body: JSON.stringify(vmData),
    });
  }

  async deleteVM(id: string) {
    const result = await this.request(`/vms/${id}`, {
      method: "DELETE",
    });
    // Invalidate VMs cache after deletion
    cache.invalidate("vms:list");
    return result;
  }

  async startVM(id: string) {
    return this.request(`/vms/${id}/start`, { method: "POST" });
  }

  async stopVM(id: string) {
    return this.request(`/vms/${id}/stop`, { method: "POST" });
  }

  async restartVM(id: string) {
    return this.request(`/vms/${id}/restart`, { method: "POST" });
  }

  // Solar methods
  async getSolarStatus() {
    return withCache(
      () => this.request("/solar/status"),
      () => "solar:status",
      { ttl: 1 * 60 * 1000, staleWhileRevalidate: true }, // 1 minute, with stale-while-revalidate
    )();
  }

  async getSolarProduction() {
    return withCache(
      () => this.request("/solar/production"),
      () => "solar:production",
      { ttl: 5 * 60 * 1000 }, // 5 minutes
    )();
  }

  async getEnvironmentalImpact() {
    return this.request("/solar/environmental-impact");
  }

  // Billing methods
  async getInvoices() {
    return this.request("/billing/invoices");
  }

  async getUsage() {
    return withCache(
      () => this.request("/billing/usage"),
      () => "billing:usage",
      { ttl: 5 * 60 * 1000 }, // 5 minutes
    )();
  }

  async payInvoice(id: string) {
    return this.request(`/payments/intent/${id}`, { method: "POST" });
  }

  // Admin methods
  async getUsers() {
    return this.request("/admin/users");
  }

  async getStats() {
    return this.request("/admin/dashboard/stats");
  }

  async updateUserStatus(id: string, status: string) {
    return this.request(`/admin/users/${id}/status`, {
      method: "PUT",
      body: JSON.stringify({ isActive: status === "active", reason: status }),
    });
  }

  // Hosting methods
  async getHostingPlans() {
    return this.request("/hosting/plans");
  }

  async getHostingAccount() {
    return this.request("/hosting/accounts/me");
  }

  async createHostingAccount(planId: string, domain?: string) {
    return this.request("/hosting/accounts", {
      method: "POST",
      body: JSON.stringify({ planId, ...(domain ? { domain } : {}) }),
    });
  }

  async terminateHostingAccount(id: string) {
    return this.request(`/hosting/accounts/${id}`, { method: "DELETE" });
  }

  async getHostingDomains() {
    return this.request("/hosting/domains");
  }

  async addHostingDomain(domain: string) {
    return this.request("/hosting/domains", {
      method: "POST",
      body: JSON.stringify({ domain }),
    });
  }

  async verifyHostingDomain(id: string) {
    return this.request(`/hosting/domains/${id}/verify`, { method: "POST" });
  }

  async removeHostingDomain(id: string) {
    return this.request(`/hosting/domains/${id}`, { method: "DELETE" });
  }
}

// Create singleton instance only on client side
let apiClientInstance: ApiClient | null = null;

export const apiClient =
  typeof window !== "undefined"
    ? apiClientInstance || (apiClientInstance = new ApiClient())
    : new ApiClient(); // Fallback for SSR (won't have token)
