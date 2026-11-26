import { useLocalSearchParams } from 'expo-router';

import { LiveExamScreen } from '../../../features/exam-live/LiveExamScreen';
import { Screen } from '../../../ui';

export default function LiveExam() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <LiveExamScreen key={id} assessmentId={id ?? ''} />
    </Screen>
  );
}
