# دليل البدء السريع - Sahary Cloud

## تشغيل المشروع بالكامل

### 1. تشغيل Backend

```bash
# في terminal جديد
cd backend

# تثبيت المكتبات (أول مرة فقط)
npm install

# تشغيل قاعدة البيانات
npm run db:start

# إعداد قاعدة البيانات (أول مرة فقط)
npm run prisma:migrate
npm run prisma:generate

# تشغيل Backend
npm run dev
```

✅ Backend يعمل على: http://localhost:3000

### 2. تشغيل Frontend

```bash
# في terminal جديد
cd frontend

# تثبيت المكتبات (أول مرة فقط)
npm install

# تشغيل Frontend
npm run dev
```

✅ Frontend يعمل على: http://localhost:3001

### 3. اختبار الاتصال

افتح المتصفح على:
- صفحة الاختبار: http://localhost:3001/test-api
- Backend Health: http://localhost:3000/health

---

## الملفات المهمة

- `Merge.md` - دليل شامل لربط Backend مع Frontend
- `frontend/lib/api.ts` - API Client للاتصال بالـ Backend
- `frontend/.env.local` - إعدادات البيئة للـ Frontend
- `frontend/app/test-api/page.tsx` - صفحة اختبار الاتصال

---

## حل المشاكل

### Backend لا يعمل
```bash
# تحقق من المنفذ 3000
lsof -i :3000

# أوقف أي عملية تستخدم المنفذ
kill -9 <PID>
```

### قاعدة البيانات لا تعمل
```bash
cd backend
npm run db:start
npm run db:logs
```

### مشكلة CORS
تأكد من أن `.env` في Backend يحتوي على:
```
CORS_ORIGIN=http://localhost:3001
```

---

للمزيد من التفاصيل، راجع ملف `Merge.md`
