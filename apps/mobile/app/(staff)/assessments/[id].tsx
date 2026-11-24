import { useLocalSearchParams } from 'expo-router';

import { BuilderScreen } from '../../../features/assessments/BuilderScreen';
import { Screen } from '../../../ui';

export default function AssessmentBuilder() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <BuilderScreen key={id} id={id ?? 'new'} />
    </Screen>
  );
}
