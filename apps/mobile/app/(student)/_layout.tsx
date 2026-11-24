import { Stack } from 'expo-router';
import { View } from 'react-native';

import { SwitchStudentBar } from '../../features/auth/SwitchStudentBar';

export default function GroupLayout() {
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        <Stack screenOptions={{ headerShown: false }} />
      </View>
      {/* Shared-device mode only: the big "Switch student" button, always in view. */}
      <SwitchStudentBar />
    </View>
  );
}
