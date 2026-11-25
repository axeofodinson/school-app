import { useLocalSearchParams } from 'expo-router';

import { MarkScreen } from '../../features/attendance/MarkScreen';
import { Screen } from '../../ui';

export default function Attendance() {
  const p = useLocalSearchParams<{ class?: string; date?: string }>();
  return (
    <Screen>
      <MarkScreen
        classId={typeof p.class === 'string' ? p.class : null}
        date={typeof p.date === 'string' ? p.date : null}
      />
    </Screen>
  );
}
