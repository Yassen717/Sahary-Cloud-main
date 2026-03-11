import { getStorageItem, setStorageItem, removeStorageItem } from './storage';
import { cache, withCache } from './cache';
import { rateLimiter, logSecurityEvent, getCsrfToken } from './security';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;
  private tokenInitialized: boolean = false;

  constructor() {
    this.baseURL = API_URL;
  }

  private initToken() {
    if (!this.tokenInitialized) {
      this.token = getStorageItem('token');
      this.tokenInitialized = true;
    }
  }

  setToken(token: string) {
    this.token = token;
    setStorageItem('token', token);
    // Also set as cookie for middleware access
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.cookie = `token=${token}; path=/; max-age=${60 * 60 * 24 * 7}`; // 7 days
    }
  }

  clearToken() {
    this.token = null;
    removeStorageItem('token');
    // Clear cookie
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      document.cookie = 'token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
    // Initialize token on first request
    this.initToken();

    // Rate limiting check
    const rateLimitKey = `${endpoint}-${this.token || 'anonymous'}`;
    if (!rateLimiter.canMakeRequest(rateLimitKey)) {
      logSecurityEvent({
        type: 'RATE_LIMIT_EXCEEDED',
        severity: 'medium',
        details: `Rate limit exceeded for endpoint: ${endpoint}`,
      });
      throw new Error('Too many requests. Please try again later.');
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${this.token}`;
    }

    // Add CSRF token for state-changing requests
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(options.method || 'GET')) {
      const csrfToken = getCsrfToken();
      if (csrfToken) {
        (headers as Record<string, string>)['X-CSRF-Token'] = csrfToken;
      }
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      
      // Log security-related errors
      if (response.status === 401 || response.status === 403) {
        logSecurityEvent({
          type: 'AUTH_ERROR',
          severity: 'medium',
          details: `${response.status} error on ${endpoint}`,
        });
      }
      
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth methods
  async login(email: string, password: string) {
    const response = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.data?.tokens?.accessToken) {
      this.setToken(response.data.tokens.accessToken);
    }

    return response;
  }

  async register(userData: any) {
    const response = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    if (response.data?.tokens?.accessToken) {
      this.setToken(response.data.tokens.accessToken);
    }

    return response;
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.clearToken();
  }

  async getMe() {
    return this.request('/auth/profile');
  }

  async updateProfile(userData: any) {
    return this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(userData),
    });
  }

  async changePassword(oldPassword: string, newPassword: string) {
    return this.request('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword }),
    });
  }

  // VM methods
  async getVMs() {
    return withCache(
      () => this.request('/vms'),
      () => 'vms:list',
      { ttl: 2 * 60 * 1000, staleWhileRevalidate: true } // 2 minutes, with stale-while-revalidate
    )();
  }

  async getVM(id: string) {
    return this.request(`/vms/${id}`);
  }

  async createVM(vmData: any) {
    const result = await this.request('/vms', {
      method: 'POST',
      body: JSON.stringify(vmData),
    });
    // Invalidate VMs cache after creation
    cache.invalidate('vms:list');
    return result;
  }

  async updateVM(id: string, vmData: any) {
    return this.request(`/vms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(vmData),
    });
  }

  async deleteVM(id: string) {
    const result = await this.request(`/vms/${id}`, {
      method: 'DELETE',
    });
    // Invalidate VMs cache after deletion
    cache.invalidate('vms:list');
    return result;
  }

  async startVM(id: string) {
    return this.request(`/vms/${id}/start`, { method: 'POST' });
  }

  async stopVM(id: string) {
    return this.request(`/vms/${id}/stop`, { method: 'POST' });
  }

  async restartVM(id: string) {
    return this.request(`/vms/${id}/restart`, { method: 'POST' });
  }

  // Solar methods
  async getSolarStatus() {
    return withCache(
      () => this.request('/solar/status'),
      () => 'solar:status',
      { ttl: 1 * 60 * 1000, staleWhileRevalidate: true } // 1 minute, with stale-while-revalidate
    )();
  }

  async getSolarProduction() {
    return withCache(
      () => this.request('/solar/production'),
      () => 'solar:production',
      { ttl: 5 * 60 * 1000 } // 5 minutes
    )();
  }

  async getEnvironmentalImpact() {
    return this.request('/solar/environmental-impact');
  }

  // Billing methods
  async getInvoices() {
    return this.request('/billing/invoices');
  }

  async getUsage() {
    return withCache(
      () => this.request('/billing/usage'),
      () => 'billing:usage',
      { ttl: 5 * 60 * 1000 } // 5 minutes
    )();
  }

  async payInvoice(id: string) {
    return this.request(`/billing/pay/${id}`, { method: 'POST' });
  }

  // Admin methods
  async getUsers() {
    return this.request('/admin/users');
  }

  async getStats() {
    return this.request('/admin/stats');
  }

  async updateUserStatus(id: string, status: string) {
    return this.request(`/admin/users/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status }),
    });
  }
}

// Create singleton instance only on client side
let apiClientInstance: ApiClient | null = null;

export const apiClient = typeof window !== 'undefined'
  ? (apiClientInstance || (apiClientInstance = new ApiClient()))
  : new ApiClient(); // Fallback for SSR (won't have token)
