// Is the device online? Web: navigator.onLine + its events. Native has no
// network module in the app, so it trusts the last load (a lesson shown from
// the device copy means the network just failed).
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';

const web = Platform.OS === 'web' && typeof navigator !== 'undefined';

export function useOnline(fromCache: boolean): boolean {
  const [online, setOnline] = useState(web ? navigator.onLine : true);
  useEffect(() => {
    if (!web) return;
    const up = () => setOnline(true);
    const down = () => setOnline(false);
    window.addEventListener('online', up);
    window.addEventListener('offline', down);
    return () => {
      window.removeEventListener('online', up);
      window.removeEventListener('offline', down);
    };
  }, []);
  return web ? online : !fromCache;
}
