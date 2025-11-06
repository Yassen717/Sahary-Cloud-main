/**
 * Safe localStorage wrapper that works in both SSR and client environments
 */

// Create a safe storage interface
interface Storage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

// Server-side mock storage (does nothing)
const mockStorage: Storage = {
  getItem: () => null,
  setItem: () => {},
  removeItem: () => {},
};

// Get the appropriate storage based on environment
export const safeLocalStorage: Storage = 
  typeof window !== 'undefined' && window.localStorage
    ? window.localStorage
    : mockStorage;

// Helper functions
export const getStorageItem = (key: string): string | null => {
  try {
    return safeLocalStorage.getItem(key);
  } catch (error) {
    console.warn('Failed to get item from storage:', error);
    return null;
  }
};

export const setStorageItem = (key: string, value: string): void => {
  try {
    safeLocalStorage.setItem(key, value);
  } catch (error) {
    console.warn('Failed to set item in storage:', error);
  }
};

export const removeStorageItem = (key: string): void => {
  try {
    safeLocalStorage.removeItem(key);
  } catch (error) {
    console.warn('Failed to remove item from storage:', error);
  }
};
