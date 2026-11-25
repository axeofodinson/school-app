import { Stack } from 'expo-router';
import { View } from 'react-native';

import { AttemptSyncProvider } from '../../features/attempts/AttemptSync';
import { SwitchStudentBar } from '../../features/auth/SwitchStudentBar';
import { MessagesProvider } from '../../features/messages/MessagesProvider';
import { StudentPresentationProvider } from '../../features/student/StudentPresentation';

export default function GroupLayout() {
  return (
    // The student's durable queue: sends waiting attempts on every student screen.
    <AttemptSyncProvider>
      {/* Inbox, live toasts (foreground only) and Android push, on every student screen. */}
      <MessagesProvider>
        {/* PG–Class 5 get the kid presentation (features/student/StudentPresentation). */}
        <StudentPresentationProvider>
          <View style={{ flex: 1 }}>
            <View style={{ flex: 1 }}>
              <Stack screenOptions={{ headerShown: false }} />
            </View>
            {/* Shared-device mode only: the big "Switch student" button, always in view. */}
            <SwitchStudentBar />
          </View>
        </StudentPresentationProvider>
      </MessagesProvider>
    </AttemptSyncProvider>
  );
}
