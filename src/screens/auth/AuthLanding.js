// Signed-out entry point. Students are the root users, so the app lands on the
// student sign-in; staff reach their own flow through a link, and back again.
// Two distinct screens, one toggle — the flows stay separate (CLAUDE.md), and
// there's no navigation library yet, so a local state switch does the routing.
import { useState } from 'react';

import LoginScreen from './LoginScreen';
import StudentLoginScreen from './StudentLoginScreen';

export default function AuthLanding() {
  const [mode, setMode] = useState('student'); // 'student' | 'staff'

  if (mode === 'staff') {
    return <LoginScreen onStudent={() => setMode('student')} />;
  }
  return <StudentLoginScreen onStaff={() => setMode('staff')} />;
}
