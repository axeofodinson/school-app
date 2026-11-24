import { Stack } from 'expo-router';

// Prep-only (Google) learners: Preparation only (DECISIONS #23). Student
// presentation; no shared-device bar (Google sign-in is hidden in shared mode).
export default function GroupLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
