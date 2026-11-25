import { useLocalSearchParams } from 'expo-router';

import { SummaryScreen } from '../../features/attendance/SummaryScreen';
import { Screen } from '../../ui';

export default function AttendanceSummary() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  return (
    <Screen>
      <SummaryScreen date={typeof date === 'string' ? date : null} />
    </Screen>
  );
}
