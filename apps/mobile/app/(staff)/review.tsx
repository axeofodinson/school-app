import { ReviewScreen } from '../../features/review/ReviewScreen';
import { Screen } from '../../ui';

// Two independently scrolling panes (a long queue + one question), so the
// screen itself doesn't scroll.
export default function Review() {
  return (
    <Screen scroll={false}>
      <ReviewScreen />
    </Screen>
  );
}
