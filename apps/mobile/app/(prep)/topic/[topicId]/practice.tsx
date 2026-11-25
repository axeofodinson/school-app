import { PracticeScreen } from '../../../../features/practice/PracticeScreen';

// Prep learners practise under /topic/… (same reason as the topic page: one URL per group).
export default function PrepPractice() {
  return <PracticeScreen root="/topic" />;
}
