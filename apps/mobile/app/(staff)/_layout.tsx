import { Stack } from 'expo-router';

import { AttendanceSyncProvider } from '../../features/attendance/AttendanceSync';
import { StaffFrame } from '../../features/staff/StaffFrame';
import { ThemeProvider } from '../../ui';

// Screens shared by teachers and admins (question bank, assessment builder).
// Staff presentation: dense, lite motion by default (DESIGN_SYSTEM.md §3).
// Who can open them is decided in app/_layout.tsx; what they can touch is RLS.
export default function StaffLayout() {
  return (
    <ThemeProvider presentation="staff">
      {/* Attendance saved offline sends from any staff screen. */}
      <AttendanceSyncProvider>
        <StaffFrame>
          <Stack screenOptions={{ headerShown: false }} />
        </StaffFrame>
      </AttendanceSyncProvider>
    </ThemeProvider>
  );
}
