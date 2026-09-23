const fallbackLocks = new Map<string, Promise<void>>();

export async function withBrowserLock<T>(name: string, operation: () => Promise<T>): Promise<T> {
  if (!navigator.locks) {
    // Serialize this tab's mutations even when cross-tab Web Locks are unavailable.
    const previous = fallbackLocks.get(name);
    let release!: () => void;
    const next = new Promise<void>((resolve) => (release = resolve));
    fallbackLocks.set(name, next);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (fallbackLocks.get(name) === next) fallbackLocks.delete(name);
    }
  }
  // Return errors as values across the native Web Locks / Zone.js promise boundary.
  const result = await navigator.locks.request(name, async () => {
    try {
      return { ok: true as const, value: await operation() };
    } catch (error) {
      return { ok: false as const, error };
    }
  });
  if (!result.ok) throw result.error;
  return result.value;
}
