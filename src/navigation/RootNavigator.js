// Auth-state router. No navigation library yet — the app has a single decision
// (which screen to show given session + role), so a conditional render is enough.
// Role routing here is convenience; RLS in db/setup.sql is the real boundary.
import { useAuth } from '../auth/AuthProvider';
import LoadingScreen from '../screens/common/LoadingScreen';
import LoginScreen from '../screens/auth/LoginScreen';
import PendingScreen from '../screens/auth/PendingScreen';
import ProfileErrorScreen from '../screens/auth/ProfileErrorScreen';
import ConsoleHomeScreen from '../screens/console/ConsoleHomeScreen';
import TeacherHomeScreen from '../screens/teacher/TeacherHomeScreen';

export default function RootNavigator() {
  const { initializing, session, role, profileStatus } = useAuth();

  if (initializing) return <LoadingScreen />;
  if (!session) return <LoginScreen />;

  // Signed in — resolve the profile before routing by role.
  if (profileStatus === 'idle' || profileStatus === 'loading') return <LoadingScreen />;
  if (profileStatus === 'error') return <ProfileErrorScreen />;

  if (role === 'developer' || role === 'admin') return <ConsoleHomeScreen />;
  if (role === 'teacher') return <TeacherHomeScreen />;

  // pending, student, parent, or unknown → no console access.
  return <PendingScreen />;
}
