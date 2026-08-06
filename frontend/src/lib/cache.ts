// Lightweight in-memory, non-persistent cache for stale-while-revalidate.
// Screens read the last successful response synchronously for an instant paint,
// then refetch in the background. Cleared on logout / unrecoverable 401.
const store = new Map<string, unknown>();

export const cache = {
  get<T>(key: string): T | undefined {
    return store.get(key) as T | undefined;
  },
  set<T>(key: string, value: T): void {
    store.set(key, value);
  },
  del(...keys: string[]): void {
    keys.forEach((k) => store.delete(k));
  },
  clear(): void {
    store.clear();
  },
};

export const cacheKeys = {
  campaigns: "campaigns",
  contacts: "contacts",
  campaign: (id: string | number) => `campaign:${id}`,
  contact: (id: string | number) => `contact:${id}`,
  contactStats: (id: string | number) => `contactStats:${id}`,
};
