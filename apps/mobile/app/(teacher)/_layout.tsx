import { Stack } from 'expo-router';

import { AttendanceSyncProvider } from '../../features/attendance/AttendanceSync';
import { StaffFrame } from '../../features/staff/StaffFrame';
import { ThemeProvider } from '../../ui';

// Staff surfaces use the staff presentation: dense, lite motion by default (DESIGN_SYSTEM.md §3).
export default function GroupLayout() {
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
