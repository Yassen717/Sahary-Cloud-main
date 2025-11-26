'use client';

import { useEffect, useState } from 'react';

export default function DebugPage() {
  const [info, setInfo] = useState<any>({});

  useEffect(() => {
    setInfo({
      hasWindow: typeof window !== 'undefined',
      hasLocalStorage: typeof localStorage !== 'undefined',
      localStorageType: typeof localStorage,
      canGetItem: typeof localStorage?.getItem === 'function',
    });
  }, []);

  return (
    <div className="container mx-auto p-6">
      <h1 className="text-3xl font-bold mb-6">Debug Info</h1>
      <pre className="bg-gray-100 dark:bg-gray-800 p-4 rounded">
        {JSON.stringify(info, null, 2)}
      </pre>
    </div>
  );
}
