'use client';

import { useState } from 'react';
import { apiClient } from '@/lib/api';

export default function TestAPIPage() {
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const testEndpoint = async (testFn: () => Promise<any>, name: string) => {
    setLoading(true);
    setError('');
    setResult(null);

    try {
      const data = await testFn();
      setResult({ success: true, name, data });
    } catch (err: any) {
      setError(err.message || 'حدث خطأ');
      setResult({ success: false, name, error: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>اختبار اتصال Backend API</h1>
      
      <div style={{ marginTop: '20px' }}>
        <h2>اختبارات متاحة:</h2>
        
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' }}>
          <button 
            onClick={() => testEndpoint(
              () => fetch('http://localhost:3000/health').then(r => r.json()),
              'Health Check'
            )}
            disabled={loading}
            style={{ padding: '10px', cursor: 'pointer' }}
          >
            اختبار Health Check
          </button>

          <button 
            onClick={() => testEndpoint(
              () => apiClient.getSolarStatus(),
              'Solar Status'
            )}
            disabled={loading}
            style={{ padding: '10px', cursor: 'pointer' }}
          >
            اختبار Solar Status
          </button>

          <button 
            onClick={() => testEndpoint(
              () => apiClient.getSolarProduction(),
              'Solar Production'
            )}
            disabled={loading}
            style={{ padding: '10px', cursor: 'pointer' }}
          >
            اختبار Solar Production
          </button>

          <button 
            onClick={() => testEndpoint(
              () => apiClient.getVMs(),
              'Get VMs'
            )}
            disabled={loading}
            style={{ padding: '10px', cursor: 'pointer' }}
          >
            اختبار Get VMs (يتطلب تسجيل دخول)
          </button>
        </div>
      </div>

      {loading && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#f0f0f0' }}>
          جاري التحميل...
        </div>
      )}

      {error && (
        <div style={{ marginTop: '20px', padding: '10px', background: '#ffebee', color: '#c62828' }}>
          <strong>خطأ:</strong> {error}
        </div>
      )}

      {result && (
        <div style={{ marginTop: '20px' }}>
          <h3>النتيجة:</h3>
          <div style={{ 
            padding: '10px', 
            background: result.success ? '#e8f5e9' : '#ffebee',
            borderRadius: '4px'
          }}>
            <p><strong>الاختبار:</strong> {result.name}</p>
            <p><strong>الحالة:</strong> {result.success ? '✅ نجح' : '❌ فشل'}</p>
            <pre style={{ 
              marginTop: '10px', 
              padding: '10px', 
              background: '#f5f5f5',
              overflow: 'auto',
              maxHeight: '400px'
            }}>
              {JSON.stringify(result.data || result.error, null, 2)}
            </pre>
          </div>
        </div>
      )}

      <div style={{ marginTop: '40px', padding: '20px', background: '#f5f5f5', borderRadius: '4px' }}>
        <h3>معلومات الاتصال:</h3>
        <p><strong>Backend URL:</strong> {process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:3000'}</p>
        <p><strong>API URL:</strong> {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1'}</p>
        
        <h4 style={{ marginTop: '20px' }}>خطوات التشغيل:</h4>
        <ol>
          <li>تأكد من تشغيل Backend على المنفذ 3000</li>
          <li>تأكد من تشغيل قاعدة البيانات</li>
          <li>اضغط على أحد الأزرار أعلاه لاختبار الاتصال</li>
        </ol>
      </div>
    </div>
  );
}
