# دليل ربط Backend مع Frontend

## نظرة عامة
هذا الدليل يوضح كيفية ربط الـ Backend (Express.js) مع الـ Frontend (Next.js) لمشروع Sahary Cloud.

---

## 1. إعداد Backend

### تشغيل Backend
```bash
cd backend

# تثبيت المكتبات
npm install

# إعداد قاعدة البيانات
npm run db:start
npm run prisma:migrate
npm run prisma:generate

# تشغيل السيرفر
npm run dev
```

السيرفر سيعمل على: `http://localhost:3000`

### التحقق من عمل Backend
```bash
curl http://localhost:3000/health
```

---

## 2. إعداد Frontend للاتصال بـ Backend

### إنشاء ملف Environment Variables للـ Frontend

أنشئ ملف `.env.local` في مجلد `frontend`:

```env
# Backend API Configuration
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000

# Optional: For server-side requests
API_URL=http://localhost:3000/api/v1
```

### إنشاء API Client للـ Frontend

أنشئ ملف `frontend/lib/api.ts`:

```typescript
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

export class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor() {
    this.baseURL = API_URL;
    // Get token from localStorage if available
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('token');
    }
  }

  setToken(token: string) {
    this.token = token;
    if (typeof window !== 'undefined') {
      localStorage.setItem('token', token);
    }
  }

  clearToken() {
    this.token = null;
    if (typeof window !== 'undefined') {
      localStorage.removeItem('token');
    }
  }

  private async request(endpoint: string, options: RequestInit = {}) {
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

  async startVM(id: string) {
    return this.request(`/vms/${id}/start`, { method: 'POST' });
  }

  async stopVM(id: string) {
    return this.request(`/vms/${id}/stop`, { method: 'POST' });
  }

  // Solar methods
  async getSolarStatus() {
    return this.request('/solar/status');
  }

  async getSolarProduction() {
    return this.request('/solar/production');
  }

  // Billing methods
  async getInvoices() {
    return this.request('/billing/invoices');
  }

  async getUsage() {
    return this.request('/billing/usage');
  }
}

export const apiClient = new ApiClient();
```

---

## 3. تحديث إعدادات CORS في Backend

تأكد من أن ملف `.env` في Backend يحتوي على:

```env
CORS_ORIGIN=http://localhost:3001
FRONTEND_URL=http://localhost:3001
```

---

## 4. تشغيل Frontend

```bash
cd frontend

# تثبيت المكتبات
npm install

# تشغيل السيرفر
npm run dev
```

السيرفر سيعمل على: `http://localhost:3001`

---

## 5. الصفحات المتكاملة مع Backend

تم إنشاء الصفحات التالية التي تتصل بالـ Backend:

### ✅ صفحة تسجيل الدخول
- المسار: `/login`
- الملف: `frontend/app/login/page.tsx`
- يتصل بـ: `POST /api/v1/auth/login`

### ✅ صفحة التسجيل
- المسار: `/register`
- الملف: `frontend/app/register/page.tsx`
- يتصل بـ: `POST /api/v1/auth/register`

### ✅ صفحة Dashboard
- المسار: `/dashboard`
- الملف: `frontend/app/dashboard/page.tsx`
- يتصل بـ:
  - `GET /api/v1/vms` - قائمة الأجهزة الافتراضية
  - `GET /api/v1/solar/status` - حالة الطاقة الشمسية
  - `GET /api/v1/billing/usage` - الاستخدام والفواتير

### ✅ صفحة اختبار API
- المسار: `/test-api`
- الملف: `frontend/app/test-api/page.tsx`
- لاختبار جميع endpoints

---

## 6. اختبار الاتصال

### اختبار من المتصفح Console

افتح Developer Tools في المتصفح واكتب:

```javascript
// Test health endpoint
fetch('http://localhost:3000/health')
  .then(r => r.json())
  .then(console.log);

// Test API endpoint
fetch('http://localhost:3000/api/v1/solar/status')
  .then(r => r.json())
  .then(console.log);
```

### اختبار باستخدام curl

```bash
# Health check
curl http://localhost:3000/health

# Test API endpoint
curl http://localhost:3000/api/v1/solar/status

# Test login
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"password123"}'
```

---

## 7. حل المشاكل الشائعة

### مشكلة CORS
إذا واجهت مشكلة CORS، تأكد من:
- تحديث `CORS_ORIGIN` في `.env` للـ Backend
- إعادة تشغيل Backend بعد تغيير `.env`

### مشكلة الاتصال
- تأكد من تشغيل Backend على المنفذ 3000
- تأكد من تشغيل Frontend على المنفذ 3001
- تحقق من Firewall settings

### مشكلة Authentication
- تأكد من حفظ Token في localStorage
- تحقق من صلاحية Token
- تأكد من إرسال Authorization header

---

## 8. البنية النهائية

```
project/
├── backend/
│   ├── .env                    # Backend environment variables
│   ├── src/
│   └── package.json
├── frontend/
│   ├── .env.local              # Frontend environment variables
│   ├── lib/
│   │   └── api.ts              # API client
│   ├── app/
│   └── package.json
└── Merge.md                    # هذا الملف
```

---

## 9. الخطوات التالية

1. ✅ إنشاء Context للـ Authentication في Frontend
2. ✅ إضافة Error Handling شامل
3. ✅ إنشاء Custom Hooks للـ API calls
4. ✅ إضافة Loading States
5. ✅ تطبيق Toast Notifications للنجاح والأخطاء
6. ✅ إضافة Middleware للحماية في Next.js

---

## 10. ملاحظات مهمة

- **لا تنسى** تشغيل قاعدة البيانات قبل Backend
- **تأكد** من تحديث `.env` بالقيم الصحيحة
- **استخدم** HTTPS في Production
- **احفظ** JWT tokens بشكل آمن
- **اختبر** جميع Endpoints قبل الانتقال للـ Production

---

## Resources

- Backend API Docs: `backend/docs/`
- Frontend Components: `frontend/components/`
- Prisma Schema: `backend/prisma/schema.prisma`

---

**تم إنشاء هذا الملف في:** 2025-11-05
**آخر تحديث:** 2025-11-05
