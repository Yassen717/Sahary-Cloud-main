/**
 * Client-side cache utility for API responses
 * Implements in-memory caching with TTL and stale-while-revalidate pattern
 */

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

interface CacheOptions {
    ttl?: number; // Time to live in milliseconds (default: 5 minutes)
    staleWhileRevalidate?: boolean; // Return stale data while fetching fresh data
}

class Cache {
    private cache: Map<string, CacheEntry<any>> = new Map();
    private readonly DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

    /**
     * Get data from cache
     * @param key Cache key
     * @returns Cached data or null if not found or expired
     */
    get<T>(key: string): T | null {
        const entry = this.cache.get(key);

        if (!entry) {
            return null;
        }

        const now = Date.now();
        const isExpired = now - entry.timestamp > entry.ttl;

        if (isExpired) {
            this.cache.delete(key);
            return null;
        }

        return entry.data as T;
    }

    /**
     * Get data from cache, including stale data
     * @param key Cache key
     * @returns Object with data and isStale flag
     */
    getWithStale<T>(key: string): { data: T | null; isStale: boolean } {
        const entry = this.cache.get(key);

        if (!entry) {
            return { data: null, isStale: false };
        }

        const now = Date.now();
        const isExpired = now - entry.timestamp > entry.ttl;

        return {
            data: entry.data as T,
            isStale: isExpired
        };
    }

    /**
     * Set data in cache
     * @param key Cache key
     * @param data Data to cache
     * @param options Cache options
     */
    set<T>(key: string, data: T, options?: CacheOptions): void {
        const ttl = options?.ttl || this.DEFAULT_TTL;

        this.cache.set(key, {
            data,
            timestamp: Date.now(),
            ttl
        });
    }

    /**
     * Invalidate (delete) a cache entry
     * @param key Cache key
     */
    invalidate(key: string): void {
        this.cache.delete(key);
    }

    /**
     * Invalidate all cache entries matching a pattern
     * @param pattern Regular expression pattern to match keys
     */
    invalidatePattern(pattern: RegExp): void {
        const keys = Array.from(this.cache.keys());
        for (const key of keys) {
            if (pattern.test(key)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Clear all cache entries
     */
    clear(): void {
        this.cache.clear();
    }

    /**
     * Get cache size
     */
    size(): number {
        return this.cache.size;
    }

    /**
     * Clean up expired entries
     */
    cleanup(): void {
        const now = Date.now();
        const entries = Array.from(this.cache.entries());
        for (const [key, entry] of entries) {
            if (now - entry.timestamp > entry.ttl) {
                this.cache.delete(key);
            }
        }
    }
}

// Singleton instance
export const cache = new Cache();

// Cleanup expired entries every 5 minutes
if (typeof window !== 'undefined') {
    setInterval(() => {
        cache.cleanup();
    }, 5 * 60 * 1000);
}

/**
 * Higher-order function to add caching to async functions
 * @param fn Async function to wrap
 * @param getCacheKey Function to generate cache key from arguments
 * @param options Cache options
 */
export function withCache<TArgs extends any[], TReturn>(
    fn: (...args: TArgs) => Promise<TReturn>,
    getCacheKey: (...args: TArgs) => string,
    options?: CacheOptions
) {
    return async (...args: TArgs): Promise<TReturn> => {
        const key = getCacheKey(...args);

        if (options?.staleWhileRevalidate) {
            const { data, isStale } = cache.getWithStale<TReturn>(key);

            if (data && !isStale) {
                return data;
            }

            // Return stale data while fetching fresh data in background
            if (data && isStale) {
                // Fetch fresh data in background
                fn(...args).then(freshData => {
                    cache.set(key, freshData, options);
                }).catch(console.error);

                return data;
            }
        } else {
            const cachedData = cache.get<TReturn>(key);
            if (cachedData !== null) {
                return cachedData;
            }
        }

        // Fetch fresh data
        const freshData = await fn(...args);
        cache.set(key, freshData, options);
        return freshData;
    };
}
