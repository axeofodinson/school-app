// Auth-state router. No navigation library yet — the app has a single decision
// (which screen to show given session + role), so a conditional render is enough.
// Role routing here is convenience; RLS in db/setup.sql is the real boundary.
import { useAuth } from '../auth/AuthProvider';
import { useLanguage } from '../i18n/LanguageProvider';
import LoadingScreen from '../screens/common/LoadingScreen';
import AuthLanding from '../screens/auth/AuthLanding';
import PendingScreen from '../screens/auth/PendingScreen';
import ProfileErrorScreen from '../screens/auth/ProfileErrorScreen';
import ConsoleHomeScreen from '../screens/console/ConsoleHomeScreen';
import TeacherHomeScreen from '../screens/teacher/TeacherHomeScreen';
import StudentHomeScreen from '../screens/student/StudentHomeScreen';

export default function RootNavigator() {
  const { initializing, session, role, profileStatus } = useAuth();
  // Subscribe to the language so a runtime switch re-renders the whole screen
  // tree — refreshing every t() string, the layout direction, and the fonts.
  useLanguage();

  if (initializing) return <LoadingScreen />;
  if (!session) return <AuthLanding />;

  // Signed in — resolve the profile before routing by role.
  if (profileStatus === 'idle' || profileStatus === 'loading') return <LoadingScreen />;
  if (profileStatus === 'error') return <ProfileErrorScreen />;

  if (role === 'developer' || role === 'admin') return <ConsoleHomeScreen />;
  if (role === 'teacher') return <TeacherHomeScreen />;
  if (role === 'student') return <StudentHomeScreen />;

  // pending, parent, or unknown → no home yet.
  return <PendingScreen />;
}
