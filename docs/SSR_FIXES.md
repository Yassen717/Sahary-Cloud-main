# SSR Fixes for Sahary Cloud Frontend

## Issues Fixed

### 1. localStorage SSR Error
**Problem:** `localStorage.getItem is not a function` error during server-side rendering

**Solutions Applied:**
- Added `typeof window` checks in `auth-context.tsx`
- Made token initialization lazy in `api.ts` (only loads on first request)
- Created singleton pattern for apiClient that checks for window
- Added mounted state in Header component to prevent hydration mismatches

### 2. AuthProvider Missing
**Problem:** `useAuth must be used within an AuthProvider` error

**Solution:** Added `<AuthProvider>` wrapper in `app/layout.tsx`

### 3. Port Conflict
**Problem:** Frontend and backend both trying to use port 3000

**Solution:** Updated `package.json` to run frontend on port 3001

## Files Modified

1. **frontend/lib/api.ts**
   - Added `tokenInitialized` flag
   - Created `initToken()` method for lazy initialization
   - Changed apiClient export to use singleton pattern with SSR check

2. **frontend/lib/auth-context.tsx**
   - Added `typeof window === 'undefined'` check in useEffect
   - Early return for SSR to prevent localStorage access

3. **frontend/components/Header.tsx**
   - Added `mounted` state
   - Show default UI during SSR, then switch to authenticated UI after mount

4. **frontend/app/layout.tsx**
   - Wrapped app with `<AuthProvider>`

5. **frontend/package.json**
   - Changed dev script to use port 3001: `next dev -p 3001`

## How to Run

```bash
# Clear cache
rm -rf .next

# Run frontend (will use port 3001)
npm run dev
```

## Testing

Visit these URLs to test:
- Homepage: http://localhost:3001
- Debug page: http://localhost:3001/debug
- Login: http://localhost:3001/login
- Dashboard: http://localhost:3001/dashboard (requires auth)

## Backend Setup

Make sure backend is running on port 3000:
```bash
cd backend
npm run dev
```

Backend should be accessible at: http://localhost:3000

## Environment Variables

`.env.local` should have:
```
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
NEXT_PUBLIC_BACKEND_URL=http://localhost:3000
```

## Key Concepts

### SSR-Safe Patterns

1. **Check for window before accessing browser APIs:**
```typescript
if (typeof window !== 'undefined') {
  localStorage.getItem('token');
}
```

2. **Use mounted state for hydration-sensitive components:**
```typescript
const [mounted, setMounted] = useState(false);
useEffect(() => setMounted(true), []);

if (!mounted) return <LoadingState />;
```

3. **Lazy initialization for browser-only features:**
```typescript
private initToken() {
  if (!this.tokenInitialized && typeof window !== 'undefined') {
    this.token = localStorage.getItem('token');
    this.tokenInitialized = true;
  }
}
```

4. **Singleton pattern with SSR fallback:**
```typescript
export const apiClient = typeof window !== 'undefined' 
  ? (instance || (instance = new ApiClient()))
  : new ApiClient();
```
