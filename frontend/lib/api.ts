import { getStorageItem, setStorageItem, removeStorageItem } from './storage';

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

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const response = await fetch(`${this.baseURL}${endpoint}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth methods
  async login(email: string, password: string) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    if (data.token) {
      this.setToken(data.token);
    }
    return data;
  }

  async register(userData: any) {
    return this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  }

  async logout() {
    await this.request('/auth/logout', { method: 'POST' });
    this.clearToken();
  }

  async getMe() {
    return this.request('/auth/me');
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
    return this.request('/vms');
  }

  async getVM(id: string) {
    return this.request(`/vms/${id}`);
  }

  async createVM(vmData: any) {
    return this.request('/vms', {
      method: 'POST',
      body: JSON.stringify(vmData),
    });
  }

  async updateVM(id: string, vmData: any) {
    return this.request(`/vms/${id}`, {
      method: 'PUT',
      body: JSON.stringify(vmData),
    });
  }

  async deleteVM(id: string) {
    return this.request(`/vms/${id}`, {
      method: 'DELETE',
    });
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
    return this.request('/solar/status');
  }

  async getSolarProduction() {
    return this.request('/solar/production');
  }

  async getEnvironmentalImpact() {
    return this.request('/solar/environmental-impact');
  }

  // Billing methods
  async getInvoices() {
    return this.request('/billing/invoices');
  }

  async getUsage() {
    return this.request('/billing/usage');
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
