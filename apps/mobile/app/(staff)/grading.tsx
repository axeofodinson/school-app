import { useLocalSearchParams } from 'expo-router';

import { GradingScreen } from '../../features/grading/GradingScreen';
import { Screen } from '../../ui';

export default function Grading() {
  const { assessment } = useLocalSearchParams<{ assessment?: string }>();
  return (
    <Screen>
      <GradingScreen assessmentId={typeof assessment === 'string' ? assessment : null} />
    </Screen>
  );
}
