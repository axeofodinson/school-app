import type { Destination } from '@school/core';
import type { Href } from 'expo-router';

/** Home route for each destination (null = still loading). */
export function homeFor(d: Destination): Href | null {
  switch (d) {
    case 'loading':
      return null;
    case 'signedOut':
      return '/login';
    case 'student':
      return '/learn';
    case 'teacher':
      return '/classes';
    case 'admin':
      return '/school';
    case 'profileError':
      return '/profile-error';
    case 'pending':
    case 'prep': // prompt 05 gives prep-only users their own Preparation surface
      return '/pending';
  }
}
