import { Stack } from 'expo-router';

import { ThemeProvider } from '../../ui';

// Staff surfaces use the staff presentation: dense, lite motion by default (DESIGN_SYSTEM.md §3).
export default function GroupLayout() {
  return (
    <ThemeProvider presentation="staff">
      <Stack screenOptions={{ headerShown: false }} />
    </ThemeProvider>
  );
}
