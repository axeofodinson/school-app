// Registers public/sw.js (the offline app shell, prompt 32) in production web
// builds. Dev servers skip it so a stale shell never hides a code change.
export function registerServiceWorker(): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (process.env.NODE_ENV !== 'production') return;
  const go = () =>
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => navigator.serviceWorker.ready)
      .then((reg) => {
        // Files this page loaded before the worker controlled it (bundles, lazy
        // chunks, fonts): the worker keeps copies for the next offline start.
        const urls = performance
          .getEntriesByType('resource')
          .map((e) => e.name)
          .filter((u) => u.startsWith(location.origin) && !u.includes('/sw.js'));
        reg.active?.postMessage({ type: 'cache-urls', urls });
      })
      .catch(() => undefined);
  if (document.readyState === 'complete') void go();
  else window.addEventListener('load', () => void go(), { once: true });
}
