# تصميم منصة Sahary Cloud

## نظرة عامة

منصة Sahary Cloud هي نظام متكامل لإدارة الخوادم الافتراضية والاستضافة باستخدام الطاقة الشمسية. يتكون النظام من واجهة أمامية بـ Next.js وواجهة خلفية بـ Node.js/Express مع قاعدة بيانات PostgreSQL.

## البنية المعمارية

### البنية العامة

```mermaid
graph TB
    Client[المتصفح/العميل] --> LB[NGINX Load Balancer]
    LB --> Frontend[Next.js Frontend]
    LB --> Backend[Node.js/Express API]
    
    Backend --> DB[(PostgreSQL)]
    Backend --> Redis[(Redis Cache/Sessions)]
    Backend --> Docker[Docker Containers]
    
    Backend --> Solar[Solar Energy Monitor]
    Backend --> VM[VM Management Service]
    
    subgraph "خدمات خارجية"
        Payment[Payment Gateway]
        Email[Email Service]
        Monitoring[System Monitoring]
    end
    
    Backend --> Payment
    Backend --> Email
    Backend --> Monitoring
```

### بنية الواجهة الخلفية

```
/backend
┣ /src
┃ ┣ /controllers     → منطق الـ APIs
┃ ┃ ┣ authController.js
┃ ┃ ┣ vmController.js
┃ ┃ ┣ billingController.js
┃ ┃ ┣ adminController.js
┃ ┃ ┗ solarController.js
┃ ┣ /services        → منطق الأعمال
┃ ┃ ┣ authService.js
┃ ┃ ┣ vmService.js
┃ ┃ ┣ billingService.js
┃ ┃ ┣ solarService.js
┃ ┃ ┗ emailService.js
┃ ┣ /models          → نماذج البيانات (Prisma)
┃ ┃ ┗ schema.prisma
┃ ┣ /routes          → تعريف المسارات
┃ ┃ ┣ auth.js
┃ ┃ ┣ vms.js
┃ ┃ ┣ billing.js
┃ ┃ ┣ admin.js
┃ ┃ ┗ solar.js
┃ ┣ /middlewares     → الوسطاء
┃ ┃ ┣ auth.js
┃ ┃ ┣ validation.js
┃ ┃ ┣ rateLimit.js
┃ ┃ ┗ errorHandler.js
┃ ┣ /utils           → الأدوات المساعدة
┃ ┃ ┣ jwt.js
┃ ┃ ┣ encryption.js
┃ ┃ ┗ logger.js
┃ ┗ index.js         → نقطة البداية
┣ /prisma
┃ ┗ schema.prisma
┣ docker-compose.yml
┣ Dockerfile
┗ package.json
```

## المكونات والواجهات

### 1. خدمة المصادقة (Auth Service)

**الواجهات:**
- `POST /api/auth/register` - تسجيل مستخدم جديد
- `POST /api/auth/login` - تسجيل الدخول
- `POST /api/auth/logout` - تسجيل الخروج
- `POST /api/auth/refresh` - تجديد الـ token
- `POST /api/auth/verify-email` - تفعيل البريد الإلكتروني
- `POST /api/auth/forgot-password` - نسيان كلمة المرور

**المكونات:**
- JWT Token Management
- Password Hashing (bcrypt)
- Email Verification
- Session Management (Redis)

### 2. خدمة إدارة الخوادم (VM Service)

**الواجهات:**
- `GET /api/vms` - قائمة الخوادم
- `POST /api/vms` - إنشاء خادم جديد
- `GET /api/vms/:id` - تفاصيل خادم
- `PUT /api/vms/:id` - تحديث خادم
- `DELETE /api/vms/:id` - حذف خادم
- `POST /api/vms/:id/start` - تشغيل خادم
- `POST /api/vms/:id/stop` - إيقاف خادم
- `POST /api/vms/:id/restart` - إعادة تشغيل خادم

**المكونات:**
- Docker Container Management
- Resource Allocation
- VM Status Monitoring
- Backup Management

### 3. خدمة الفواتير (Billing Service)

**الواجهات:**
- `GET /api/billing/invoices` - قائمة الفواتير
- `GET /api/billing/invoices/:id` - تفاصيل فاتورة
- `POST /api/billing/pay/:id` - دفع فاتورة
- `GET /api/billing/usage` - استهلاك الموارد
- `GET /api/billing/pricing` - أسعار الخدمات

**المكونات:**
- Usage Tracking
- Invoice Generation
- Payment Processing
- Pricing Calculator

### 4. خدمة الإدارة (Admin Service)

**الواجهات:**
- `GET /api/admin/users` - قائمة المستخدمين
- `GET /api/admin/stats` - إحصائيات المنصة
- `PUT /api/admin/users/:id/status` - تغيير حالة مستخدم
- `GET /api/admin/resources` - مراقبة الموارد
- `GET /api/admin/logs` - سجلات النظام

### 5. خدمة الطاقة الشمسية (Solar Service)

**الواجهات:**
- `GET /api/solar/status` - حالة الطاقة الشمسية
- `GET /api/solar/production` - إنتاج الطاقة
- `GET /api/solar/consumption` - استهلاك الطاقة
- `GET /api/solar/environmental-impact` - التأثير البيئي

## نماذج البيانات

### مخطط قاعدة البيانات

```prisma
// User Model
model User {
  id          String   @id @default(cuid())
  email       String   @unique
  password    String
  firstName   String
  lastName    String
  role        Role     @default(USER)
  isActive    Boolean  @default(true)
  isVerified  Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  
  // Relations
  vms         VirtualMachine[]
  invoices    Invoice[]
  sessions    Session[]
}

// Virtual Machine Model
model VirtualMachine {
  id          String    @id @default(cuid())
  name        String
  status      VMStatus  @default(STOPPED)
  cpu         Int       // CPU cores
  ram         Int       // RAM in MB
  storage     Int       // Storage in GB
  ipAddress   String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt
  
  // Relations
  userId      String
  user        User      @relation(fields: [userId], references: [id])
  usageRecords UsageRecord[]
}

// Billing Models
model Invoice {
  id          String        @id @default(cuid())
  amount      Decimal
  status      InvoiceStatus @default(PENDING)
  dueDate     DateTime
  paidAt      DateTime?
  createdAt   DateTime      @default(now())
  
  // Relations
  userId      String
  user        User          @relation(fields: [userId], references: [id])
  items       InvoiceItem[]
}

model UsageRecord {
  id          String   @id @default(cuid())
  vmId        String
  cpu         Float    // CPU usage percentage
  ram         Float    // RAM usage in MB
  storage     Float    // Storage usage in GB
  duration    Int      // Duration in minutes
  timestamp   DateTime @default(now())
  
  // Relations
  vm          VirtualMachine @relation(fields: [vmId], references: [id])
}

// Solar Energy Model
model SolarData {
  id          String   @id @default(cuid())
  production  Float    // kWh produced
  consumption Float    // kWh consumed
  efficiency  Float    // Efficiency percentage
  timestamp   DateTime @default(now())
}

// Enums
enum Role {
  USER
  ADMIN
  SUPER_ADMIN
}

enum VMStatus {
  RUNNING
  STOPPED
  STARTING
  STOPPING
  ERROR
}

enum InvoiceStatus {
  PENDING
  PAID
  OVERDUE
  CANCELLED
}
```

## معالجة الأخطاء

### استراتيجية معالجة الأخطاء

1. **أخطاء التحقق (Validation Errors)**
   - كود الخطأ: 400
   - رسائل واضحة ومحددة
   - تفاصيل الحقول المطلوبة

2. **أخطاء المصادقة (Authentication Errors)**
   - كود الخطأ: 401
   - إعادة توجيه لصفحة تسجيل الدخول
   - رسائل أمان مناسبة

3. **أخطاء التفويض (Authorization Errors)**
   - كود الخطأ: 403
   - رسائل واضحة عن الصلاحيات المطلوبة

4. **أخطاء الموارد (Resource Errors)**
   - كود الخطأ: 404
   - رسائل مفيدة للمستخدم

5. **أخطاء الخادم (Server Errors)**
   - كود الخطأ: 500
   - تسجيل مفصل للأخطاء
   - معرف فريد لتتبع الخطأ

### مثال على معالج الأخطاء

```javascript
const errorHandler = (err, req, res, next) => {
  let error = { ...err };
  error.message = err.message;

  // Log error
  logger.error(err);

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    const message = 'Resource not found';
    error = new ErrorResponse(message, 404);
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    const message = 'Duplicate field value entered';
    error = new ErrorResponse(message, 400);
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    const message = Object.values(err.errors).map(val => val.message);
    error = new ErrorResponse(message, 400);
  }

  res.status(error.statusCode || 500).json({
    success: false,
    error: error.message || 'Server Error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
```

## استراتيجية الاختبار

### 1. اختبارات الوحدة (Unit Tests)

- اختبار كل service بشكل منفصل
- اختبار المصادقة والتفويض
- اختبار منطق الفواتير
- اختبار إدارة الخوادم

### 2. اختبارات التكامل (Integration Tests)

- اختبار APIs مع قاعدة البيانات
- اختبار تدفق المصادقة الكامل
- اختبار عمليات الدفع
- اختبار إنشاء وإدارة الخوادم

### 3. اختبارات النهاية إلى النهاية (E2E Tests)

- اختبار رحلة المستخدم الكاملة
- اختبار لوحة تحكم المسؤولين
- اختبار عمليات الدفع الكاملة
- اختبار إدارة الخوادم من الواجهة

### أدوات الاختبار

- **Jest** - اختبارات الوحدة والتكامل
- **Supertest** - اختبار APIs
- **Cypress** - اختبارات E2E للواجهة الأمامية
- **Docker** - بيئة اختبار معزولة

### مثال على اختبار وحدة

```javascript
describe('Auth Service', () => {
  describe('register', () => {
    it('should create a new user with valid data', async () => {
      const userData = {
        email: 'test@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe'
      };

      const user = await authService.register(userData);
      
      expect(user).toBeDefined();
      expect(user.email).toBe(userData.email);
      expect(user.password).not.toBe(userData.password); // Should be hashed
    });

    it('should throw error for duplicate email', async () => {
      const userData = {
        email: 'existing@example.com',
        password: 'password123',
        firstName: 'John',
        lastName: 'Doe'
      };

      await expect(authService.register(userData))
        .rejects
        .toThrow('Email already exists');
    });
  });
});
```

## الأمان والحماية

### 1. مصادقة وتفويض

- JWT tokens مع انتهاء صلاحية
- Refresh tokens للجلسات الطويلة
- Role-based access control (RBAC)
- Rate limiting للـ APIs

### 2. حماية البيانات

- تشفير كلمات المرور (bcrypt)
- تشفير البيانات الحساسة
- HTTPS إجباري
- تنظيف المدخلات (Input sanitization)

### 3. حماية الـ APIs

- CORS configuration
- Helmet.js للحماية من الهجمات الشائعة
- Request validation
- API rate limiting

### 4. مراقبة الأمان

- تسجيل محاولات تسجيل الدخول الفاشلة
- مراقبة الأنشطة المشبوهة
- تنبيهات الأمان
- Audit logs

## الأداء والتحسين

### 1. تحسين قاعدة البيانات

- فهرسة الحقول المهمة
- Connection pooling
- Query optimization
- Database caching

### 2. تحسين الـ APIs

- Response caching (Redis)
- Pagination للقوائم الطويلة
- Compression (gzip)
- CDN للملفات الثابتة

### 3. مراقبة الأداء

- Application monitoring
- Database performance monitoring
- API response time tracking
- Resource usage monitoring

## النشر والبنية التحتية

### Docker Configuration

```yaml
version: '3.8'
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://user:pass@db:5432/sahary
      - REDIS_URL=redis://redis:6379
    depends_on:
      - db
      - redis

  db:
    image: postgres:13
    environment:
      - POSTGRES_DB=sahary
      - POSTGRES_USER=user
      - POSTGRES_PASSWORD=pass
    volumes:
      - postgres_data:/var/lib/postgresql/data

  redis:
    image: redis:6-alpine
    volumes:
      - redis_data:/data

  nginx:
    image: nginx:alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf
    depends_on:
      - app

volumes:
  postgres_data:
  redis_data:
```

### متغيرات البيئة

```env
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/sahary
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRE=30d
JWT_REFRESH_EXPIRE=7d

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Payment
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Solar API
SOLAR_API_URL=http://solar-monitor:8080
SOLAR_API_KEY=your-solar-api-key
```