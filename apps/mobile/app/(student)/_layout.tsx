import { Stack } from 'expo-router';
import { View } from 'react-native';

import { AttemptSyncProvider } from '../../features/attempts/AttemptSync';
import { SwitchStudentBar } from '../../features/auth/SwitchStudentBar';

export default function GroupLayout() {
  return (
    // The student's durable queue: sends waiting attempts on every student screen.
    <AttemptSyncProvider>
      <View style={{ flex: 1 }}>
        <View style={{ flex: 1 }}>
          <Stack screenOptions={{ headerShown: false }} />
        </View>
        {/* Shared-device mode only: the big "Switch student" button, always in view. */}
        <SwitchStudentBar />
      </View>
    </AttemptSyncProvider>
  );
}
